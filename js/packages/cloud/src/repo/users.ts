import type { Queryable } from "../db/db.js";

/** A signed-in person, as our routes see them. Accounts themselves are Better Auth's (auth/auth.ts). */
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

export async function userCount(q: Queryable): Promise<number> {
  const [row] = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
  return row?.n ?? 0;
}

/** Emails of an organization's members, for alert emails. When mail really goes out, only confirmed ones. */
export const memberEmails = async (q: Queryable, orgId: string, confirmedOnly: boolean): Promise<string[]> =>
  (await q.query<{ email: string }>("SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND (u.email_verified OR NOT $2)", [orgId, confirmedOnly])).map(
    (r) => r.email,
  );
