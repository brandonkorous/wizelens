// Why a browser call ended without an answer, and which calls are prefetches: neither a cancel nor a prefetch is a failure.

/** A call that ended without an answer. A cancelled one is not a failure: no error, no exception. */
export interface CallFailure {
  message: string;
  /** The real exception type, for example "TypeError" or "AbortError". */
  type: string;
  cancelled: boolean;
}

let leaving = false;
const hide = () => void (leaving = true);
const show = () => void (leaving = false);
const onVisible = () => typeof document !== "undefined" && document.visibilityState === "visible" && show();

/** Note when the page is hidden or unloading: calls it cuts off are cancelled. Returns an undo function. */
export function watchLeaving(): () => void {
  if (typeof addEventListener !== "function") return () => {};
  addEventListener("pagehide", hide);
  addEventListener("pageshow", show);
  addEventListener("visibilitychange", onVisible);
  return () => {
    removeEventListener("pagehide", hide);
    removeEventListener("pageshow", show);
    removeEventListener("visibilitychange", onVisible);
    leaving = false;
  };
}

const pageGone = (): boolean => leaving || (typeof document !== "undefined" && document.visibilityState === "hidden");
const offline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;
const nameOf = (err: unknown): string => (err && typeof err === "object" && "name" in err && typeof err.name === "string" ? err.name : "Error");
const timedOut = (signal: AbortSignal): boolean => nameOf(signal.reason) === "TimeoutError";

/** A rejected fetch or a failed XHR: its message, its real type, and whether the app or the page cancelled it. */
export function failureOf(err: unknown, signal?: AbortSignal | null, aborted = false): CallFailure {
  const type = nameOf(err);
  const message = err instanceof Error ? err.message : String(err);
  const byApp = type === "AbortError" || aborted || (!!signal?.aborted && !timedOut(signal));
  return { message, type, cancelled: byApp || pageGone() || offline() };
}

const PREFETCH_HEADERS = ["next-router-prefetch", "rsc"];

/** A router prefetch (Next.js `_rsc=` query or `RSC` / `Next-Router-Prefetch` header): the app does not wait for it. */
export function isPrefetch(url: URL, headers: Headers | null): boolean {
  if (url.searchParams.has("_rsc")) return true;
  return !!headers && PREFETCH_HEADERS.some((h) => headers.get(h) === "1");
}
