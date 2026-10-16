import type { IncomingMessage } from "node:http";
import { gunzipSync } from "node:zlib";

/** Most bytes one request body may hold, after unzip. */
export const MAX_BODY = 16 * 1024 * 1024;

/** Read the raw body, and unzip it when it is gzip. Throws when it is too large. */
export async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks);
  const gzip = String(req.headers["content-encoding"] ?? "").toLowerCase() === "gzip";
  return gzip ? gunzipSync(raw, { maxOutputLength: MAX_BODY }) : raw;
}

export const isProtobuf = (req: IncomingMessage) => String(req.headers["content-type"] ?? "").includes("protobuf");

/** Parse a JSON body. Undefined when it is empty. */
export function parseJson(body: Buffer): unknown {
  const text = body.toString("utf8");
  return text ? JSON.parse(text) : undefined;
}
