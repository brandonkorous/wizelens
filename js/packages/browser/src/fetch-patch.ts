import { formatTraceparent } from "@wizeworks/lens-core";
import { watchBody } from "./paint.js";
import { type Answer, type Call, type FetchContext, finishCall, isWizeLensCall, startCall } from "./request-span.js";

export type { FetchContext } from "./request-span.js";

function requestUrl(input: RequestInfo | URL, base: string): URL {
  if (typeof input === "string") return new URL(input, base);
  if (input instanceof URL) return input;
  return new URL(input.url, base);
}

function withTraceparent(ctx: FetchContext, call: Call, input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (!ctx.propagateTo(call.url)) return init;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("traceparent", formatTraceparent(call.traceId, call.spanId, true));
  return { ...init, headers };
}

const answerOf = (response: Response): Answer => ({
  status: response.status,
  header: (name) => response.headers.get(name),
  whenRead: (onRead) => watchBody(response, onRead),
});

/** A fetch that adds traceparent, records the request for the HUD, and sends a browser span. */
export function patchFetch(orig: typeof fetch, ctx: FetchContext): typeof fetch {
  return async function profiledFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: URL;
    try {
      url = requestUrl(input, ctx.base);
    } catch {
      return orig(input, init);
    }
    if (isWizeLensCall(url, ctx.endpoint)) return orig(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const call = startCall(ctx, "fetch", url, method);
    const nextInit = withTraceparent(ctx, call, input, init);
    try {
      const rewrap = input instanceof Request && nextInit !== init;
      const response = rewrap ? await orig(new Request(input, nextInit)) : await orig(input, nextInit);
      finishCall(ctx, call, answerOf(response), null);
      return response;
    } catch (err) {
      finishCall(ctx, call, null, err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
