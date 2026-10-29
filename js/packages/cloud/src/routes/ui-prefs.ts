import { isTimeRange } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { requireUser } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { saveUiPrefs, type UiPrefs } from "../repo/ui-prefs.js";

const CHOICES: [keyof UiPrefs, (v: string) => boolean][] = [
  ["theme", (v) => v === "light" || v === "dark" || v === "system"],
  ["range", isTimeRange],
  ["tz", (v) => v === "local" || v === "utc"],
  ["clock", (v) => v === "12" || v === "24"],
];

/** `PATCH api/me/prefs`: keep the Preferences page's choices on the account. Only the choices sent change. */
async function change(ctx: Ctx): Promise<void> {
  const user = await requireUser(ctx);
  const body = await readJsonBody(ctx.req);
  const patch: UiPrefs = {};
  for (const [name, ok] of CHOICES) {
    const v = body[name];
    if (v === undefined) continue;
    patch[name] = typeof v === "string" && ok(v) ? v : fail(400, `That ${name} is not one of the choices.`);
  }
  sendJson(ctx.res, 200, await saveUiPrefs(ctx.app.db, user.id, patch));
}

export function uiPrefsRoutes(r: Router<Ctx>): void {
  r.on("PATCH", "api/me/prefs", change);
}
