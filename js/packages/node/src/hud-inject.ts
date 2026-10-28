import type { IncomingMessage, ServerResponse } from "node:http";
import { BodySplicer, lastBodyClose } from "./hud-body.js";

const WRAPPED = Symbol.for("wizeworks.wizelens.hud");

// pending: not decided yet; on: the body streams through the splicer; off: untouched; done: the tag went out.
type State = "pending" | "on" | "off" | "done";
type Callback = (err?: Error | null) => void;
type Write = (...args: unknown[]) => boolean;
type End = (...args: unknown[]) => ServerResponse;

interface Injection {
  state: State;
  splicer: BodySplicer;
}

interface Call {
  chunk: unknown;
  encoding: BufferEncoding | undefined;
  callback: Callback | undefined;
}

/** The arguments of write(chunk, encoding?, cb?) and end(chunk?, encoding?, cb?). */
function callOf(args: unknown[]): Call {
  const [a, b, c] = args;
  if (typeof a === "function") return { chunk: undefined, encoding: undefined, callback: a as Callback };
  if (typeof b === "function") return { chunk: a, encoding: undefined, callback: b as Callback };
  return { chunk: a, encoding: typeof b === "string" ? (b as BufferEncoding) : undefined, callback: typeof c === "function" ? (c as Callback) : undefined };
}

/** The bytes of a chunk, or null for anything Node would not write (it then throws as it always did). */
function bytesOf(chunk: unknown, encoding: BufferEncoding | undefined): Buffer | null {
  try {
    if (typeof chunk === "string") return Buffer.from(chunk, encoding);
    if (chunk instanceof Uint8Array) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  } catch {
    // An unknown encoding: leave it to Node.
  }
  return null;
}

const textOf = (value: unknown): string => (Array.isArray(value) ? value.join(",") : value == null ? "" : String(value));

/** A page (200) or an error page (4xx, 5xx: where the HUD is wanted most), with an HTML type and no Content-Encoding (a compressed body is left alone). */
export const pageStatus = (status: unknown): boolean => typeof status === "number" && (status === 200 || (status >= 400 && status < 600));

function qualifies(status: unknown, header: (name: string) => unknown): boolean {
  if (!pageStatus(status) || textOf(header("content-encoding")).trim()) return false;
  return /^\s*text\/html\s*(;|$)/i.test(textOf(header("content-type")));
}

/** One header from a writeHead headers argument: an object, a flat [name, value, ...] list, or pairs. */
function fromArg(headers: object, name: string): unknown {
  if (!Array.isArray(headers)) {
    for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return value;
    return undefined;
  }
  for (let i = 0; i < headers.length; i++) {
    const item: unknown = headers[i];
    if (Array.isArray(item) && String(item[0]).toLowerCase() === name) return item[1];
    if (!Array.isArray(item) && i % 2 === 0 && String(item).toLowerCase() === name) return headers[i + 1];
  }
  return undefined;
}

/** A copy of a writeHead headers argument without Content-Length. The caller's object is left as it was. */
function withoutLength(headers: object): object {
  const isLength = (key: unknown) => String(key).toLowerCase() === "content-length";
  if (!Array.isArray(headers)) return Object.fromEntries(Object.entries(headers).filter(([key]) => !isLength(key)));
  if (headers.some((item) => Array.isArray(item))) return headers.filter((item) => !(Array.isArray(item) && isLength(item[0])));
  const out: unknown[] = [];
  for (let i = 0; i + 1 < headers.length; i += 2) if (!isLength(headers[i])) out.push(headers[i], headers[i + 1]);
  return out;
}

const headersIndex = (args: unknown[]): number => [1, 2].find((i) => !!args[i] && typeof args[i] === "object") ?? -1;

/** Decide at writeHead, from its status and headers over the ones already set. Returns the arguments to pass on. */
function decideAtHead(res: ServerResponse, s: Injection, args: unknown[]): unknown[] {
  const at = headersIndex(args);
  const passed = at >= 0 ? (args[at] as object) : null;
  const header = (name: string) => (passed ? fromArg(passed, name) : undefined) ?? res.getHeader(name);
  s.state = !res.headersSent && qualifies(args[0], header) ? "on" : "off";
  if (s.state === "off") return args;
  res.removeHeader("content-length");
  if (!passed) return args;
  const copy = [...args];
  copy[at] = withoutLength(passed);
  return copy;
}

/** Decide at the first write or end, from what is set on the response. `whole` is the body when end() is the first call. */
function decideAtBody(res: ServerResponse, s: Injection, whole?: Buffer | null): void {
  const full = whole === undefined || (whole !== null && lastBodyClose(whole) >= 0);
  s.state = !res.headersSent && full && qualifies(res.statusCode, (name) => res.getHeader(name)) ? "on" : "off";
  // A streamed body has no known length once the tag goes in; a whole one gets its new length in end().
  if (s.state === "on" && whole === undefined) res.removeHeader("content-length");
}

function wrapWriteHead(res: ServerResponse, s: Injection): void {
  const original = res.writeHead as (...args: unknown[]) => ServerResponse;
  res.writeHead = function (this: ServerResponse, ...args: unknown[]) {
    let pass = args;
    if (s.state === "pending") {
      try {
        pass = decideAtHead(this, s, args);
      } catch {
        s.state = "off";
        pass = args;
      }
    }
    return original.apply(this, pass);
  } as ServerResponse["writeHead"];
}

function wrapWrite(res: ServerResponse, s: Injection): void {
  const original = res.write as Write;
  res.write = function (this: ServerResponse, ...args: unknown[]) {
    if (s.state === "pending") decideAtBody(this, s);
    if (s.state !== "on") return original.apply(this, args);
    const call = callOf(args);
    const bytes = bytesOf(call.chunk, call.encoding);
    if (!bytes) return original.apply(this, args);
    return original.call(this, s.splicer.push(bytes), call.callback);
  } as Write as ServerResponse["write"];
}

function wrapEnd(res: ServerResponse, s: Injection): void {
  const original = res.end as End;
  res.end = function (this: ServerResponse, ...args: unknown[]) {
    const call = callOf(args);
    const bytes = call.chunk == null ? Buffer.alloc(0) : bytesOf(call.chunk, call.encoding);
    const whole = s.state === "pending";
    if (whole) decideAtBody(this, s, bytes);
    if (s.state !== "on" || !bytes) return original.apply(this, args);
    s.state = "done";
    const out = s.splicer.finish(bytes);
    if (whole && this.hasHeader("content-length")) this.setHeader("Content-Length", out.length);
    return original.call(this, out, call.callback);
  } as End as ServerResponse["end"];
}

/** A page navigation (Accept has text/html) loses Accept-Encoding, so a compressing layer answers plain HTML that can take the tag. */
export function askForPlainPage(req: IncomingMessage): void {
  if (!/\btext\/html\b/i.test(String(req.headers.accept ?? ""))) return;
  // Node builds both header objects from rawHeaders with a stored count, so they are built (and cleaned) before rawHeaders shrinks.
  delete req.headers["accept-encoding"];
  delete req.headersDistinct["accept-encoding"];
  const raw = req.rawHeaders;
  for (let i = raw.length - 2; i >= 0; i -= 2) if (raw[i]!.toLowerCase() === "accept-encoding") raw.splice(i, 2);
}

/** Put `tag` before the last `</body>` of a full HTML page (or error page) answered to a GET. Any doubt leaves the answer as the app wrote it. */
export function injectHud(req: IncomingMessage, res: ServerResponse, tag: string): void {
  const marked = res as ServerResponse & { [WRAPPED]?: true };
  if (req.method !== "GET" || marked[WRAPPED]) return;
  marked[WRAPPED] = true;
  askForPlainPage(req);
  const s: Injection = { state: "pending", splicer: new BodySplicer(tag) };
  wrapWriteHead(res, s);
  wrapWrite(res, s);
  wrapEnd(res, s);
}
