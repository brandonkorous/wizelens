import { vi } from "vitest";
import { parseTraceparent, type Span } from "@wizeworks/lens-core/internal";

// Vitest runs in Node: these stubs give the recorder a page origin and a sessionStorage.
export const storage = new Map<string, string>();

export function stubPage(): void {
  vi.stubGlobal("location", new URL("http://app.test/page"));
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
  });
}

export interface Call {
  url: string;
  init?: RequestInit;
}

export const urlOf = (input: RequestInfo | URL) => String(input instanceof Request ? input.url : input);

/** A fake fetch that answers like a WizeLens server: it echoes the trace id it was sent. */
export function echoServer(calls: Call[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: urlOf(input), init });
    const sent = parseTraceparent(new Headers(init?.headers).get("traceparent"));
    return new Response("{}", { status: 200, headers: sent ? { "X-WizeLens-Trace": sent.traceId } : {} });
  }) as typeof fetch;
}

/** The spans posted to /api/client-spans. */
export function postedSpans(calls: Call[]): Span[] {
  return calls
    .filter((c) => c.url.endsWith("/api/client-spans"))
    .flatMap((c) => (JSON.parse(String(c.init!.body)) as { spans: Span[] }).spans);
}

export function span(spanId: string, category: Span["category"], service: string, durationMs: number, extra: Partial<Span> = {}): Span {
  return {
    traceId: "t",
    spanId,
    parentSpanId: null,
    name: `${category} ${spanId}`,
    kind: "internal",
    category,
    service,
    startMs: Number(spanId),
    durationMs,
    status: "unset",
    statusMessage: null,
    attributes: {},
    events: [],
    ...extra,
  };
}
