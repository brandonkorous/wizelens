# 096 — The Vite plugin leaves the source maps in the site she deploys

**Status:** fixed
**Severity:** major
**Found by:** P04 · Haddad Studio · act 6
**Surface:** `@wizeworks/lens-cli/vite` (the build step the Errors hint and the Source maps docs point to)
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-ran P04 act 6 at 22:29 with this branch's plugin: the build said "Uploaded 1 source map for release 1.0.1", and `dist/assets/` held only `index-CBBz6Uwe.js` and the CSS. The error page then read the uploaded map (`src/pages/Contact.tsx:33:59`).
**Blocked on:** —

## What happened

Noor added `wizelensSourceMaps()` to vite.config.ts, as the docs say, and built with her new build key. The build
said "Uploaded 1 source map for release 1.0.1". Then `dist/assets/` still held `index-CBBz6Uwe.js.map`. She deploys
`dist` as it is, so her whole source would be public at that address. The docs say "Production sites should not serve
their maps", and say the Next.js wrapper deletes the maps it turned on; the Vite and webpack plugins do not.

## What should have happened

When the plugin turned the maps on, it deletes them once they are uploaded, the same as the Next.js wrapper. A site
that asked for maps itself keeps them.

## Where it lives

`cli/src/vite.ts` and `cli/src/webpack.ts` call `uploadAfterBuild` with no `deleteAfterUpload`; only `cli/src/next.ts`
sets it.

## The fix

`cli/src/vite.ts` and `cli/src/webpack.ts` delete the maps they turned on once they are uploaded
(`deleteAfterUpload` defaults to that); a build that set `sourcemap` or `devtool` itself keeps its maps. The docs say
so. Test: `plugins.test.ts` "deletes the maps it turned on once they are uploaded, and keeps maps the site asked
for".
