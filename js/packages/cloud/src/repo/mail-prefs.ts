import type { Queryable } from "../db/db.js";

export type DigestPeriod = "daily" | "weekly" | "monthly";
export const DIGEST_PERIODS: readonly DigestPeriod[] = ["daily", "weekly", "monthly"];
/** A project with no saved choice gets the weekly digest only. */
export const DEFAULT_DIGEST: Record<DigestPeriod, boolean> = { daily: false, weekly: true, monthly: false };

export interface MailPrefs {
  team: boolean;
  health: boolean;
  /** Off stops every digest, for projects made later too. */
  digests: boolean;
  timeZone: string;
  /** True once the person picked a zone or their browser sent one; until then emails show UTC. */
  zoneSet: boolean;
  /** Local hour digests go out, 0 to 23. */
  digestHour: number;
}

export const DEFAULT_PREFS: MailPrefs = { team: true, health: true, digests: true, timeZone: "UTC", zoneSet: false, digestHour: 8 };

/** What a stop link turns off: team or health notices, one digest of one project, or every digest. */
export type StopScope = "team" | "health" | "digests" | { projectId: string; period: DigestPeriod };

type PrefRow = { team: boolean; health: boolean; digests: boolean; time_zone: string; zone_set: boolean; digest_hour: number };

export async function prefsOf(q: Queryable, userId: string): Promise<MailPrefs> {
  const [r] = await q.query<PrefRow>("SELECT team, health, digests, time_zone, zone_set, digest_hour FROM mail_prefs WHERE user_id = $1", [userId]);
  return r ? { team: r.team, health: r.health, digests: r.digests, timeZone: r.time_zone, zoneSet: r.zone_set, digestHour: r.digest_hour } : { ...DEFAULT_PREFS };
}

export async function savePrefs(q: Queryable, userId: string, patch: Partial<MailPrefs>): Promise<MailPrefs> {
  const p = { ...(await prefsOf(q, userId)), ...patch };
  if (patch.timeZone !== undefined) p.zoneSet = true;
  await q.query(
    `INSERT INTO mail_prefs (user_id, team, health, digests, time_zone, zone_set, digest_hour) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET team = $2, health = $3, digests = $4, time_zone = $5, zone_set = $6, digest_hour = $7`,
    [userId, p.team, p.health, p.digests, p.timeZone, p.zoneSet, p.digestHour],
  );
  return p;
}

/** Saved digest choices by project. Projects not in the map use DEFAULT_DIGEST. */
export async function digestPrefsOf(q: Queryable, userId: string): Promise<Map<string, Record<DigestPeriod, boolean>>> {
  const rows = await q.query<{ project_id: string } & Record<DigestPeriod, boolean>>("SELECT project_id, daily, weekly, monthly FROM digest_prefs WHERE user_id = $1", [userId]);
  return new Map(rows.map((r) => [r.project_id, { daily: r.daily, weekly: r.weekly, monthly: r.monthly }]));
}

export async function saveDigestPref(q: Queryable, userId: string, projectId: string, patch: Partial<Record<DigestPeriod, boolean>>): Promise<void> {
  const p = { ...((await digestPrefsOf(q, userId)).get(projectId) ?? DEFAULT_DIGEST), ...patch };
  await q.query(
    `INSERT INTO digest_prefs (user_id, project_id, daily, weekly, monthly) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, project_id) DO UPDATE SET daily = $3, weekly = $4, monthly = $5`,
    [userId, projectId, p.daily, p.weekly, p.monthly],
  );
}

/** Turn off what a stop link names. */
export async function applyStop(q: Queryable, userId: string, scope: StopScope): Promise<void> {
  if (typeof scope === "object") return saveDigestPref(q, userId, scope.projectId, { [scope.period]: false });
  await savePrefs(q, userId, { [scope]: false });
}

export interface Recipient {
  id: string;
  email: string;
  name: string;
}

/** Owners and admins of an organization who keep this kind of notice on. With real mail, only confirmed addresses. */
export const managersOf = async (q: Queryable, orgId: string, pref: "team" | "health", confirmedOnly: boolean): Promise<Recipient[]> =>
  q.query<Recipient>(
    `SELECT u.id, u.email, u.name FROM members m JOIN users u ON u.id = m.user_id LEFT JOIN mail_prefs p ON p.user_id = u.id
     WHERE m.org_id = $1 AND m.role IN ('owner', 'admin') AND COALESCE(p.${pref}, TRUE) AND (u.email_verified OR NOT $2) ORDER BY u.email`,
    [orgId, confirmedOnly],
  );

/** Each address's time zone (lower case address); addresses with no saved zone are left out. */
export async function zonesOf(q: Queryable, emails: readonly string[]): Promise<Map<string, string>> {
  if (!emails.length) return new Map();
  const rows = await q.query<{ email: string; time_zone: string }>(
    "SELECT lower(u.email) AS email, p.time_zone FROM users u JOIN mail_prefs p ON p.user_id = u.id WHERE lower(u.email) = ANY($1)",
    [emails.map((e) => e.toLowerCase())],
  );
  return new Map(rows.map((r) => [r.email, r.time_zone]));
}
