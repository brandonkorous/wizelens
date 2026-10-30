import { formatTraceparent } from "@wizeworks/lens-core/internal";
import { failureOf, isPrefetch } from "./fetch-failure.js";
import { watchBody } from "./paint.js";
import { type Answer, type Call, type FetchContext, finishCall, isWizeLensCall, startCall } from "./request-span.js";

export type { FetchContext } from "./request-span.js";

/** Marks the script's own fetches (reading the page's source maps): they are not the page's requests. */
export const OWN_CALL = Symbol.for("wizelens.ownCall");

const isOwnCall = (init: RequestInit | undefined): boolean => !!init && (init as Record<symbol, unknown>)[OWN_CALL] === true;

/** Blazor fetches its own runtime (.wasm, .dll, .pdb, boot json) from `_framework/`: the framework's files, not the app's calls. */
const isFrameworkFile = (url: URL): boolean => url.pathname.includes("/_framework/");

function requestUrl(input: RequestInfo | URL, base: string): URL {
  if (typeof input === "string") return new URL(input, base);
  if (input instanceof URL) return input;
  return new URL(input.url, base);
}

const headersOf = (input: RequestInfo | URL, init?: RequestInit): Headers => new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
const signalOf = (input: RequestInfo | URL, init?: RequestInit): AbortSignal | null => init?.signal ?? (input instanceof Request ? input.signal : null);

function withTraceparent(ctx: FetchContext, call: Call, input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (!ctx.propagateTo(call.url)) return init;
  const headers = headersOf(input, init);
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
    if (isWizeLensCall(url, ctx.endpoint) || isOwnCall(init) || isFrameworkFile(url)) return orig(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const call = startCall(ctx, "fetch", url, method, isPrefetch(url, headersOf(input, init)));
    const nextInit = withTraceparent(ctx, call, input, init);
    try {
      const rewrap = input instanceof Request && nextInit !== init;
      const response = rewrap ? await orig(new Request(input, nextInit)) : await orig(input, nextInit);
      finishCall(ctx, call, answerOf(response), null);
      return response;
    } catch (err) {
      finishCall(ctx, call, null, failureOf(err, signalOf(input, init)));
      throw err;
    }
  };
}
