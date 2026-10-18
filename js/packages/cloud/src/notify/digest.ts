import type { CloudApp } from "../app.js";
import { digest } from "../mail/emails-digest.js";
import { renderMail } from "../mail/templates.js";
import { stopUrl } from "../mail/unsubscribe.js";
import { DEFAULT_DIGEST, type DigestPeriod, digestPrefsOf } from "../repo/mail-prefs.js";
import { type DigestData, digestData } from "./digest-data.js";

interface Local {
  date: string;
  month: string;
  weekday: number;
  day: number;
  hour: number;
}

/** The date and hour in a time zone. Unknown zones count as UTC. */
export function localOf(ms: number, timeZone: string): Local {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(ms));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone);
  } catch {
    parts = fmt("UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, month: `${get("year")}-${get("month")}`, weekday, day: Number(get("day")), hour: Number(get("hour")) };
}

/** Digests due at this local time, each with the key that makes it go out once: every day, on Mondays, on the 1st. */
export function dueKeys(l: Local, hour: number): [DigestPeriod, string][] {
  if (l.hour < hour) return [];
  const due: [DigestPeriod, string][] = [["daily", `D:${l.date}`]];
  if (l.weekday === 1) due.push(["weekly", `W:${l.date}`]);
  if (l.day === 1) due.push(["monthly", `M:${l.month}`]);
  return due;
}

interface Person {
  id: string;
  email: string;
  time_zone: string | null;
  digest_hour: number | null;
}

interface ProjectRow {
  id: string;
  name: string;
  org: string;
  retention_days: number;
}

/** Claim one send. Only the instance whose row went in sends, so a digest goes out once. */
const claim = async (app: CloudApp, userId: string, projectId: string, period: DigestPeriod, key: string) =>
  (
    await app.db.query("INSERT INTO digest_sends (user_id, project_id, period, period_key, sent_ms) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING period", [
      userId,
      projectId,
      period,
      key,
      app.config.now(),
    ])
  ).length > 0;

type Cache = Map<string, Promise<DigestData | null>>;

async function sendOne(app: CloudApp, who: Person, p: ProjectRow, period: DigestPeriod, key: string, cache: Cache): Promise<void> {
  if (!(await claim(app, who.id, p.id, period, key))) return;
  try {
    const id = `${p.id}:${period}`;
    if (!cache.has(id)) cache.set(id, digestData(app.db, app.telemetry, p.id, p.retention_days, period, app.config.now()));
    const data = await cache.get(id)!;
    if (!data || data.empty) return;
    const links = { project: `${app.baseUrl()}/_wizelens/#/?project=${encodeURIComponent(p.id)}`, stop: stopUrl(app, who.id, { projectId: p.id, period }) };
    app.mailer.send(renderMail(who.email, digest(p.name, p.org, period, data, links)));
  } catch (err) {
    await app.db.query("DELETE FROM digest_sends WHERE user_id = $1 AND project_id = $2 AND period = $3 AND period_key = $4", [who.id, p.id, period, key]);
    throw err;
  }
}

async function digestsFor(app: CloudApp, who: Person, cache: Cache): Promise<void> {
  const due = dueKeys(localOf(app.config.now(), who.time_zone ?? "UTC"), who.digest_hour ?? 8);
  if (due.length === 0) return;
  const projects = await app.db.query<ProjectRow>(
    "SELECT p.id, p.name, o.name AS org, o.retention_days FROM members m JOIN orgs o ON o.id = m.org_id JOIN projects p ON p.org_id = o.id WHERE m.user_id = $1 ORDER BY p.name",
    [who.id],
  );
  const prefs = await digestPrefsOf(app.db, who.id);
  for (const p of projects) for (const [period, key] of due) if ((prefs.get(p.id) ?? DEFAULT_DIGEST)[period]) await sendOne(app, who, p, period, key, cache);
}

/** Send the digests that are due now. People with digests off, and unconfirmed addresses when mail is real, get none. */
export async function sendDigests(app: CloudApp): Promise<void> {
  const people = await app.db.query<Person>(
    `SELECT u.id, u.email, p.time_zone, p.digest_hour FROM users u LEFT JOIN mail_prefs p ON p.user_id = u.id
     WHERE COALESCE(p.digests, TRUE) AND (u.email_verified OR NOT $1)`,
    [app.mailer.live],
  );
  const cache: Cache = new Map();
  for (const who of people) await digestsFor(app, who, cache).catch((err: unknown) => console.error(`[wizelens-cloud] digest for ${who.id} failed:`, err));
}

