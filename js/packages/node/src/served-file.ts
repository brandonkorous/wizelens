// Files served as they are (images, fonts, scripts, style sheets): their spans are dropped so they do not bury the pages.

const OK_STATUSES = new Set([200, 206, 304]);
const served = new WeakSet<object>();

/** No route ran, the path names a file, it succeeded, and it is not an HTML page (a page carries the HUD). */
export function isServedFile(path: string, route: string | undefined, status: number | undefined, contentType: unknown): boolean {
  if (route || status === undefined || !OK_STATUSES.has(status)) return false;
  if (!/\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf("/") + 1))) return false;
  return !String(contentType ?? "").toLowerCase().startsWith("text/html");
}

/** Marks a request span as a served file; the store then skips it. */
export const markServedFile = (span: object): void => void served.add(span);

/** True for a span marked by markServedFile. */
export const isServedFileSpan = (span: object): boolean => served.has(span);
