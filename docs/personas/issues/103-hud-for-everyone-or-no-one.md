# 103 — A static site's HUD is on for every visitor, or for no one

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 9 (the HUD on her own phone)
**Surface:** the HUD on a site with a browser key; Connect › Sending keys (script tag); docs HUD and Browser
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** at 23:26 on a 390 px phone (4G), Noor opened `http://localhost:4173/?wizelens-hud=on`: the HUD read "1,372 ms Total … 1,367 ms Render" and fit (358 px). /services in the same browser, with no switch in the address, showed it too. A visitor's browser on /services had no HUD. `?wizelens-hud=off` hid it again. By thumb: the HUD buttons are 44×44, Settings › "Show WizeLens bottom left", Minimize (46×46 dot) and open again all worked at 390 and 360; "Open the dashboard" went to `http://localhost:5970/_wizelens/`. Rule 7: at 23:36 Greta (P02) made a browser key on Connect; its tag had no `data-hud` and the HUD note showed; she revoked it.

## What happened

Noor's tag came from Connect with `data-hud="false"`. With `"auto"`, a browser key never showed the HUD. The only way
to see it was `data-hud="true"`, and then every visitor to her portfolio saw it too. With it on, the HUD buttons were
28×28 px (too small for a thumb), the Settings buttons had no padding, "Open the dashboard" went to the key's send
address (a blank page), and the Database tip said "No data yet" on a site that has no server.

## What should have happened

She turns the HUD on in her own browser, and only there. It works by thumb, and every link goes somewhere.

## The fix

`browser/src/hud-switch.ts` `ownHudChoice()`: `?wizelens-hud=on` or `off` on any page is kept for this browser
(`wizelens.hud.mine`), and with `hud: "auto"` it wins over the probe. A browser key still reads nothing back.
Connect's tag drops `data-hud="false"` and says how to turn it on. `cloud.ts` `dashboardOf()` sends "Open the
dashboard" to the cloud. HUD icon buttons are 44 px on touch screens (`pointer:coarse`); `.wl-btn` keeps its padding
in the HUD. The Database tip says the same as the Server tip. Docs: `hud.md` (Just for you), `browser.md`. Tests:
`lens-hud.test.ts`, `cloud.test.ts`.
