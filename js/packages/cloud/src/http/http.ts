import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_JSON = 1024 * 1024;

/** A failure that becomes one JSON error answer. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** More fields for the JSON answer, for example the plan a 402 needs. */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export function sendJson(res: ServerResponse, status: number, value: unknown, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(value));
}

/** The body exactly as sent, for signature checks. Throws 413 past 1 MB. */
export async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_JSON) fail(413, "The body is too large.");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** A small JSON body. Throws 400 for bad JSON or more than 1 MB. */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const text = await readRawBody(req);
  try {
    const v = text ? (JSON.parse(text) as unknown) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(400, "Send a JSON object.");
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return fail(400, "The body is not valid JSON.");
  }
}

export function cookieOf(req: IncomingMessage, name: string): string | undefined {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** A cookie header: HttpOnly, SameSite=Lax, Secure on https. `maxAgeS` 0 deletes it. */
export const cookie = (name: string, value: string, maxAgeS: number, secure: boolean): string =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure ? "; Secure" : ""}`;

export const bearerOf = (req: IncomingMessage): string | undefined => {
  const auth = String(req.headers.authorization ?? "");
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() || undefined : undefined;
};

/** Read a string field. Throws 400 when it is required and missing. */
export function str(body: Record<string, unknown>, key: string, required = true): string {
  const v = body[key];
  if (typeof v === "string" && v.trim()) return v;
  if (required) fail(400, `"${key}" is required.`);
  return "";
}
