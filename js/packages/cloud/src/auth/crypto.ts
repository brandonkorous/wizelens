import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

/** "scrypt$<salt>$<hash>", both base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length, SCRYPT);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Kinds of secret tokens. The prefix tells a person what a token is for. */
export const TOKEN_PREFIX = { session: "wl_s_", invite: "wl_inv_", ingest: "wl_ik_", read: "wl_rk_", share: "wl_sh_" } as const;
export type TokenKind = keyof typeof TOKEN_PREFIX;

/** A new random token. Only its hash is stored. */
export const newToken = (kind: TokenKind): string => `${TOKEN_PREFIX[kind]}${randomBytes(24).toString("base64url")}`;

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const newId = (): string => randomUUID();

/** A URL-safe short name from free text, for example "My Shop!" -> "my-shop". */
export const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";
