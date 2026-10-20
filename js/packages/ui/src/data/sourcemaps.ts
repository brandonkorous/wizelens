import { useEffect, useState } from "react";
import { cachedLoader, type ErrorEvent, fetchMapLoader, type ResolvedFrame, resolveStack, SOURCEMAPS_RESOLVE_PATH } from "@wizeworks/lens-core";
import { apiSend } from "./api";
import { useHost } from "./host";
import { getScope } from "./prefs";
import { projectQuery } from "./projectScope";

/** What a stack view needs from an error: an ErrorEvent, or one built from a trace span. Its trace and span pick the project whose maps apply. */
export type StackSource = Pick<ErrorEvent, "type" | "message" | "stack" | "browser" | "release"> & Partial<Pick<ErrorEvent, "traceId" | "spanId">>;

export interface ResolvedStack {
  frames: ResolvedFrame[] | null;
  loading: boolean;
  error: string | null;
}

// Hosts without the resolve API (the .NET add-on): this browser reads the maps the dev server or the site serves.
const browserLoader = cachedLoader(fetchMapLoader({ allow: (u) => /^https?:$/.test(u.protocol), timeoutMs: 8000 }), { max: 10, hitMs: 30_000 });

function resolveUrl(): string {
  const project = projectQuery();
  return `./${SOURCEMAPS_RESOLVE_PATH}${project ? `?${project}` : ""}`;
}

// The host reads the maps of the project the error's trace and span belong to, so "All projects" and joined traces resolve too.
async function resolveOn(server: boolean, stack: string, event: Pick<StackSource, "release" | "traceId" | "spanId">): Promise<ResolvedFrame[]> {
  if (!server) return resolveStack(stack, event.release, browserLoader);
  const body = { stack, release: event.release, traceId: event.traceId, spanId: event.spanId };
  return (await apiSend<{ frames: ResolvedFrame[] }>("POST", resolveUrl(), body)).frames;
}

/** A browser error's stack after source maps, from the host when it resolves stacks, else in this browser. Null frames for server errors. */
export function useResolvedStack(event: StackSource): ResolvedStack {
  const server = useHost().has("sourcemaps");
  const stack = event.browser ? event.stack : null;
  const [state, setState] = useState<ResolvedStack & { key: string | null }>({ key: null, frames: null, loading: false, error: null });
  const { release, traceId, spanId } = event;
  const key = stack ? [server, release ?? "", traceId ?? "", spanId ?? "", stack].join("\n") : null;
  useEffect(() => {
    if (!stack || !key) return;
    let live = true;
    resolveOn(server, stack, { release, traceId, spanId })
      .then((frames) => live && setState({ key, frames, loading: false, error: null }))
      .catch((err: unknown) => live && setState({ key, frames: null, loading: false, error: err instanceof Error ? err.message : String(err) }));
    return () => void (live = false);
  }, [key, server, stack, release, traceId, spanId]);
  if (!key) return { frames: null, loading: false, error: null };
  return state.key === key ? state : { frames: null, loading: true, error: null };
}
