import { createHash, randomBytes, randomUUID } from "node:crypto";

// Our own secrets: data-plane keys, share links, and status page links. Passwords, sessions, and invites are Better Auth's.

/** Kinds of secret tokens. The prefix tells a person what a token is for. */
export const TOKEN_PREFIX = { ingest: "wl_ik_", read: "wl_rk_", share: "wl_sh_", status: "wl_st_", scim: "wl_sc_" } as const;
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
