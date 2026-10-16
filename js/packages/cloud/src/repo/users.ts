import { checkPassword, hashPassword, hashToken, newId, newToken } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

export interface User {
  id: string;
  email: string;
  name: string;
}

const SESSION_MS = 30 * 24 * 60 * 60_000;
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;

/** Check sign-up input. Returns an error message, or null when it is fine. */
export function signUpProblem(email: string, password: string, name: string): string | null {
  if (!isEmail(normalizeEmail(email))) return "Enter a valid email address.";
  if (password.length < 10) return "Use a password of at least 10 characters.";
  if (password.length > 200) return "Use a password of at most 200 characters.";
  if (!name.trim() || name.length > 100) return "Enter your name (at most 100 characters).";
  return null;
}

export async function userCount(q: Queryable): Promise<number> {
  const [row] = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
  return row?.n ?? 0;
}

export async function createUser(q: Queryable, email: string, password: string, name: string, now: number): Promise<User> {
  const user = { id: newId(), email: normalizeEmail(email), name: name.trim() };
  await q.query("INSERT INTO users (id, email, name, password_hash, created_ms) VALUES ($1, $2, $3, $4, $5)", [
    user.id,
    user.email,
    user.name,
    await hashPassword(password),
    now,
  ]);
  return user;
}

export async function userByEmail(q: Queryable, email: string): Promise<User | undefined> {
  const [row] = await q.query<User>("SELECT id, email, name FROM users WHERE email = $1", [normalizeEmail(email)]);
  return row;
}

/** The user when the email and password match. Takes the same time when the email is unknown. */
export async function verifyLogin(q: Queryable, email: string, password: string): Promise<User | undefined> {
  const [row] = await q.query<User & { password_hash: string }>("SELECT id, email, name, password_hash FROM users WHERE email = $1", [
    normalizeEmail(email),
  ]);
  const ok = await checkPassword(password, row?.password_hash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  return row && ok ? { id: row.id, email: row.email, name: row.name } : undefined;
}

export async function setPassword(q: Queryable, userId: string, password: string): Promise<void> {
  await q.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(password), userId]);
  await q.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

/** A new session. Returns the token for the cookie; only its hash is stored. */
export async function createSession(q: Queryable, userId: string, now: number): Promise<{ token: string; expiresMs: number }> {
  const token = newToken("session");
  const expiresMs = now + SESSION_MS;
  await q.query("INSERT INTO sessions (token_hash, user_id, created_ms, expires_ms) VALUES ($1, $2, $3, $4)", [hashToken(token), userId, now, expiresMs]);
  return { token, expiresMs };
}

export async function userBySession(q: Queryable, token: string, now: number): Promise<User | undefined> {
  const [row] = await q.query<User>(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_ms > $2`,
    [hashToken(token), now],
  );
  return row;
}

export async function endSession(q: Queryable, token: string): Promise<void> {
  await q.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function pruneSessions(q: Queryable, now: number): Promise<void> {
  await q.query("DELETE FROM sessions WHERE expires_ms <= $1", [now]);
}
