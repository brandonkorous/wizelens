import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { HEADER_HOP, MAX_FEDERATION_HOPS, mergeTraces, type Trace } from "@wizeworks/lens-core";
import type { TraceStore } from "./store.js";

const TIMEOUT_MS = 2000;

/** Fetch one trace part from another WizeLens endpoint. Undefined when it fails. */
export async function fetchRemote(remote: string, traceId: string, hop: number): Promise<Trace | undefined> {
  try {
    // No spans at all: a framework fetch wrapper (Next.js) makes its own span above undici.
    const res = await context.with(suppressTracing(ROOT_CONTEXT), () =>
      fetch(`${remote}/api/traces/${traceId}?federate=true`, {
        headers: { [HEADER_HOP]: String(hop + 1), Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
    return res.ok ? ((await res.json()) as Trace) : undefined;
  } catch {
    return undefined;
  }
}

/** Build `getTrace`: the local trace merged with the parts its downstream services hold. */
export function createGetTrace(store: TraceStore, selfEndpoints: ReadonlySet<string>) {
  return async function getTrace(traceId: string, federate = true, hop = 0): Promise<Trace | undefined> {
    const local = store.get(traceId);
    if (!federate || hop + 1 > MAX_FEDERATION_HOPS) return local;
    const remotes = (local?.remotes ?? []).filter((r) => !selfEndpoints.has(r));
    const parts = await Promise.all(remotes.map((remote) => fetchRemote(remote, traceId, hop)));
    const all = [local, ...parts].filter((t): t is Trace => !!t && Array.isArray(t.spans));
    if (all.length === 0) return undefined;
    return mergeTraces(traceId, all);
  };
}
