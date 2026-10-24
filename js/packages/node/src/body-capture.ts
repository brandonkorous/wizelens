import type { ServerResponse } from "node:http";

const BODY_LIMIT = 16 * 1024;
const TEXT_TYPE = /^(text\/|application\/(.+\+)?json\b)/i;

export interface ResponseTap {
  /** Bytes the app wrote to the response. */
  bytes(): number;
  /** The kept body, or null when capture is off or the body is not text or JSON. */
  body(): { text: string; truncated: boolean } | null;
  /** `performance.now()` when the app first wrote, flushed headers, or ended; undefined before that. */
  firstAt(): number | undefined;
}

type Chunk = string | Uint8Array;

function isTextBody(res: ServerResponse): boolean {
  if (res.getHeader("content-encoding")) return false;
  return TEXT_TYPE.test(String(res.getHeader("content-type") ?? ""));
}

function toBuffer(chunk: Chunk, encoding: BufferEncoding | undefined): Buffer {
  return typeof chunk === "string" ? Buffer.from(chunk, encoding) : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

function sizeOf(chunk: Chunk, encoding: BufferEncoding | undefined): number {
  return typeof chunk === "string" ? Buffer.byteLength(chunk, encoding) : chunk.byteLength;
}

/** Counts (and optionally keeps the start of) what the app writes. Never changes what the client gets. */
export function tapResponse(res: ServerResponse, capture: boolean): ResponseTap {
  let bytes = 0;
  let kept = 0;
  let eligible: boolean | undefined;
  const parts: Buffer[] = [];
  let firstAt: number | undefined;
  const take = (chunk: unknown, enc: unknown): void => {
    firstAt ??= performance.now();
    if (typeof chunk !== "string" && !(chunk instanceof Uint8Array)) return;
    const encoding = typeof enc === "string" ? (enc as BufferEncoding) : undefined;
    bytes += sizeOf(chunk, encoding);
    if (!capture) return;
    eligible ??= isTextBody(res);
    if (!eligible || kept >= BODY_LIMIT) return;
    const part = toBuffer(chunk, encoding).subarray(0, BODY_LIMIT - kept);
    parts.push(Buffer.from(part));
    kept += part.length;
  };
  wrap(res, "write", take);
  wrap(res, "end", take);
  wrap(res, "flushHeaders", () => void (firstAt ??= performance.now()));
  return {
    firstAt: () => firstAt,
    bytes: () => bytes,
    body: () => (capture && eligible ? { text: Buffer.concat(parts).toString("utf8"), truncated: bytes > kept } : null),
  };
}

function wrap(res: ServerResponse, method: "write" | "end" | "flushHeaders", take: (chunk: unknown, enc: unknown) => void): void {
  const original = res[method] as (...args: unknown[]) => unknown;
  const wrapped = function (this: ServerResponse, ...args: unknown[]) {
    try {
      take(args[0], args[1]);
    } catch {
      // Counting must never break the response.
    }
    return original.apply(this, args);
  };
  res[method] = wrapped as never;
}
