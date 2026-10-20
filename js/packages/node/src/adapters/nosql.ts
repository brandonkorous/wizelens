import { createHmac, randomBytes } from "node:crypto";
import { type DbSpan, runTraced } from "../db.js";

// Fingerprints only compare calls inside this process. The key is never stored or sent, so they cannot be reversed.
const KEY = randomBytes(32);

// Sessions and other driver objects are not values. Dropping them also avoids their cycles.
const replacer = (key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : key === "session" ? undefined : value);

function jsonOf(value: unknown): string {
  try {
    return JSON.stringify(value, replacer) ?? String(value);
  } catch {
    return String(value);
  }
}

/** A salted hash of the values a call ran with, so the same call with the same values can be found without storing them. */
export function fingerprint(parts: readonly unknown[]): string {
  const hmac = createHmac("sha256", KEY);
  for (const part of parts) {
    if (part instanceof Uint8Array) hmac.update(part);
    else hmac.update(typeof part === "string" ? part : jsonOf(part));
    hmac.update("\u0000");
  }
  return hmac.digest("base64url").slice(0, 16);
}

/** True for a key or path part that holds an id or a value: a digit, an email, or a long token. */
export const isIdLike = (part: string): boolean => /\d|@/.test(part) || part.length >= 24;

/** `server.address` and `server.port` when the host is known. */
export function serverAttributes(host: unknown, port: unknown): Record<string, string | number> {
  if (typeof host !== "string" || host === "") return {};
  const p = Number(port);
  return Number.isInteger(p) && p > 0 ? { "server.address": host, "server.port": p } : { "server.address": host };
}

/** Cut long text, so one huge filter or pipeline does not fill the span. */
export const clip = (text: string, max = 1000): string => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Like runTraced, but a result that carries an error (a pipeline or bulk call with failed items) marks the span. */
export function runChecked(span: DbSpan | null, args: unknown[], invoke: (args: unknown[]) => unknown, errorOf: (result: unknown) => unknown): unknown {
  const checked: DbSpan | null = span && {
    ctx: span.ctx,
    fail: span.fail,
    end: (result) => {
      const err = errorOf(result);
      if (err) span.fail(err);
      else span.end(result);
    },
  };
  return runTraced(checked, args, invoke);
}

/** The prototype that owns `name`, walking up from an instance. */
export function ownerOf(instance: object, name: string): object | null {
  for (let p = Object.getPrototypeOf(instance) as object | null; p; p = Object.getPrototypeOf(p) as object | null) {
    if (Object.hasOwn(p, name)) return p;
  }
  return null;
}
