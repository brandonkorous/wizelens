import type { Queryable } from "../db/db.js";

export type SuppressReason = "bounce" | "complaint";

const norm = (email: string) => email.trim().toLowerCase();

/** Skip this address from now on. A bounce wins over a complaint, since nothing can reach the address. */
export async function suppress(q: Queryable, email: string, reason: SuppressReason, detail: string, now: number): Promise<void> {
  await q.query(
    `INSERT INTO mail_suppressions (email, reason, detail, created_ms) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET reason = CASE WHEN mail_suppressions.reason = 'bounce' THEN 'bounce' ELSE EXCLUDED.reason END,
       detail = EXCLUDED.detail, created_ms = EXCLUDED.created_ms`,
    [norm(email), reason, detail.slice(0, 500), now],
  );
}

export async function suppressionOf(q: Queryable, email: string): Promise<SuppressReason | null> {
  const rows = await q.query<{ reason: SuppressReason }>("SELECT reason FROM mail_suppressions WHERE email = $1", [norm(email)]);
  return rows[0]?.reason ?? null;
}

/** The person proved the address works (they opened a link sent to it), so mail may go there again. */
export async function unsuppress(q: Queryable, email: string): Promise<void> {
  await q.query("DELETE FROM mail_suppressions WHERE email = $1", [norm(email)]);
}
