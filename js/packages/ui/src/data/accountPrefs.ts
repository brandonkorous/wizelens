// The Preferences page's choices kept on the account (cloud), so every browser a person signs in on starts with them.
import { apiSend } from "./api";
import { PERIOD_KEYS } from "./period";
import { KEYS, readPref, writePref } from "./prefs";

const KEY_OF = { theme: KEYS.theme, range: KEYS.range, tz: PERIOD_KEYS.tz, clock: PERIOD_KEYS.clock } as const;
export type AccountPref = keyof typeof KEY_OF;
export type AccountPrefs = Partial<Record<AccountPref, string>>;

let seeded = false;
let onAccount = false;

/** Once a page load, put the account's choices in this browser. A link that names a range keeps it. */
export function seedAccountPrefs(prefs: AccountPrefs | undefined): void {
  onAccount = true;
  if (seeded || !prefs) return;
  seeded = true;
  const linkRange = new URLSearchParams(window.location.hash.split("?")[1] ?? "").has("range");
  for (const [name, key] of Object.entries(KEY_OF) as [AccountPref, string][]) {
    const v = prefs[name];
    if (v && !(name === "range" && linkRange) && readPref(key) !== v) writePref(key, v);
  }
}

/** A setter that also keeps the choice on the account when signed in to a cloud. A failed save leaves it in this browser. */
export const kept =
  <T extends string>(name: AccountPref, set: (v: T) => void) =>
  (v: T): void => {
    set(v);
    if (onAccount) void apiSend("PATCH", "./api/me/prefs", { [name]: v }).catch(() => undefined);
  };
