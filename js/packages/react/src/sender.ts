import type { Span } from "@wizeworks/lens-core";
import type { ClientLog } from "./console-capture.js";

/** Queues browser spans and posts them to `{endpoint}/api/client-spans`. */
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

export function createSender(endpointUrl: string, getFetch: () => typeof fetch | null): Sender {
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
    const spans = queue.splice(0, queue.length);
    const lines = logs.splice(0, logs.length);
    try {
      await send(`${endpointUrl}/api/client-spans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lines.length > 0 ? { spans, logs: lines } : { spans }),
        keepalive: true,
      });
    } catch {
      // WizeLens is a dev tool. Never break the app because it is down.
    }
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
