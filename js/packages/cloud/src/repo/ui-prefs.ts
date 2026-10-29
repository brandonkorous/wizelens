import type { Queryable } from "../db/db.js";

/** The Preferences page's choices: theme, default range, time zone, and clock. One left out uses the browser's own. */
export type UiPrefs = Partial<Record<"theme" | "range" | "tz" | "clock", string>>;

export async function uiPrefsOf(q: Queryable, userId: string): Promise<UiPrefs> {
  const [r] = await q.query<{ prefs: string }>("SELECT prefs FROM ui_prefs WHERE user_id = $1", [userId]);
  return r ? (JSON.parse(r.prefs) as UiPrefs) : {};
}

/** Change only the choices sent. */
export async function saveUiPrefs(q: Queryable, userId: string, patch: UiPrefs): Promise<UiPrefs> {
  const prefs = { ...(await uiPrefsOf(q, userId)), ...patch };
  await q.query("INSERT INTO ui_prefs (user_id, prefs) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET prefs = $2", [userId, JSON.stringify(prefs)]);
  return prefs;
}
