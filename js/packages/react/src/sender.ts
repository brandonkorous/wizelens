import type { Span } from "@wizeworks/lens-core";
import type { ClientLog } from "./console-capture.js";

/** Queues browser spans and logs, and posts each to `{endpoint}/api/client-spans` of the server that holds its trace. */
export interface Sender {
  push(span: Span): void;
  /** Queue a browser log line. */
  log(entry: ClientLog): void;
  /** Keep a span back, for example until its render time is known. */
  hold(id: string, span: Span): void;
  /** Queue a held span. False when it was already sent. */
  release(id: string): boolean;
  /** Send queued spans. `all` also sends held spans. */
  flush(all?: boolean): Promise<void>;
}

const BATCH = 20;

// Send to another server only on this page's origin, like the server's remote rule.
function sameOrigin(endpoint: string): boolean {
  try {
    return typeof location !== "undefined" && new URL(endpoint, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

interface Batch {
  spans: Span[];
  logs: ClientLog[];
}

function groupByEndpoint(spans: Span[], logs: ClientLog[], target: (traceId: string) => string): Map<string, Batch> {
  const groups = new Map<string, Batch>();
  const batchOf = (traceId: string) => {
    const key = target(traceId);
    if (!groups.has(key)) groups.set(key, { spans: [], logs: [] });
    return groups.get(key)!;
  };
  for (const span of spans) batchOf(span.traceId).spans.push(span);
  for (const log of logs) batchOf(log.traceId).logs.push(log);
  return groups;
}

async function post(send: typeof fetch, endpoint: string, { spans, logs }: Batch): Promise<void> {
  try {
    await send(`${endpoint}/api/client-spans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logs.length > 0 ? { spans, logs } : { spans }),
      keepalive: true,
    });
  } catch {
    // WizeLens is a dev tool. Never break the app because it is down.
  }
}

/** `endpointOf` names the server that holds a trace; spans go there when it is on this page's origin. */
export function createSender(endpointUrl: string, getFetch: () => typeof fetch | null, endpointOf: (traceId: string) => string = () => endpointUrl): Sender {
  const queue: Span[] = [];
  const logs: ClientLog[] = [];
  const held = new Map<string, Span>();

  async function flush(all = true): Promise<void> {
    if (all) {
      queue.push(...held.values());
      held.clear();
    }
    const send = getFetch();
    if ((queue.length === 0 && logs.length === 0) || !send) return;
    const target = (traceId: string) => {
      const owner = endpointOf(traceId);
      return owner !== endpointUrl && sameOrigin(owner) ? owner : endpointUrl;
    };
    const groups = groupByEndpoint(queue.splice(0, queue.length), logs.splice(0, logs.length), target);
    await Promise.all([...groups].map(([endpoint, batch]) => post(send, endpoint, batch)));
  }

  function push(span: Span): void {
    queue.push(span);
    if (queue.length >= BATCH) void flush(false);
  }

  return {
    push,
    log(entry) {
      logs.push(entry);
      if (logs.length >= 100) void flush(false);
    },
    hold: (id, span) => void held.set(id, span),
    release(id) {
      const span = held.get(id);
      if (!span) return false;
      held.delete(id);
      push(span);
      return true;
    },
    flush,
  };
}
