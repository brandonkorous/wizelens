import { scrypt, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";

// Hashes from before Better Auth: "scrypt$<salt b64url>$<key b64url>", N=16384 r=8 p=1, 32-byte key, password as typed.
const LEGACY = { N: 16384, r: 8, p: 1, keylen: 32 };

export const isLegacyHash = (hash: string): boolean => hash.startsWith("scrypt$");

function legacyKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((ok, fail) => scrypt(password, salt, LEGACY.keylen, { N: LEGACY.N, r: LEGACY.r, p: LEGACY.p }, (e, k) => (e ? fail(e) : ok(k))));
}

async function verifyLegacy(hash: string, password: string): Promise<boolean> {
  const [, salt, key] = hash.split("$");
  if (!salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  const got = await legacyKey(password, Buffer.from(salt, "base64url"));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** New hashes use Better Auth's scrypt; old ones still verify, and sign-in replaces them (auth/hooks.ts). */
export const passwordOptions = {
  hash: (password: string) => hashPassword(password),
  verify: ({ hash, password }: { hash: string; password: string }) => (isLegacyHash(hash) ? verifyLegacy(hash, password) : verifyPassword({ hash, password })),
};
