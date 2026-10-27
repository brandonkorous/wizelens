# 018 — "AI access (MCP) Off", and no word on how to turn it on

**Status:** fixed
**Severity:** minor
**Found by:** P01 · kanNINJA web team · act 10
**Surface:** Dashboard › Connect › service settings › "AI access (MCP)"
**Filed:** 2026-10-26
**Fixed:** 2026-10-26
**Confirmed by:** re-ran P01 act 10 — the row said how, Dani turned it on, the agent read the sign-up trace, Dani turned it off
**Blocked on:** —

## What happened

Dani opened `http://localhost:3001/_wizelens/#/connect` to let an agent in. The settings list said `AI access (MCP) Off` —
a grey badge and nothing else. No switch, no option name, no link. The only place that says `enableMcp` is a 404 body an
MCP client gets, which Dani only sees after the agent fails.

## What should have happened

Where it says Off, it says how to turn it on for this kind of service, and links to the page with the client config.

## Why it matters

Works-but-unfindable: act 10 is "turn on AI access", and the screen that shows its state gave no path to it.

## Where it lives

`js/packages/ui/src/pages/connect/SourceSettings.tsx` — `mcpRow`.

## The fix

When MCP is off, the row reads "Off · Turn it on with `enableMcp: true`. How" — the switch picked from the service's own
info: `--mcp` on the hub, `o.EnableMcp = true` for .NET, `enableMcp: true` for Node; other runtimes get the link only.
**How** opens `https://wizelens.com/docs/ai-access/#on-your-own-machine`.

Its neighbour had the same gap: "Response bodies Off". Both rows now use one `offHint`, so it also reads "Off ·
Turn it on with `captureResponseBody: true`. How" (`o.CaptureResponseBody = true` on .NET), linking `/docs/configuration/`.

## Confirmed by

> Re-ran P01 act 10: Connect on the API's dashboard read "AI access (MCP) Off Turn it on with enableMcp: true. How". Dani
> added `enableMcp: true` to kanNINJA's `createWizeLens` (test-only, not committed); the API restarted, `api/info` said
> `mcp: true`, and an MCP client at `http://localhost:3001/_wizelens/mcp` listed 16 tools and read the sign-up trace.
> Dani removed it: the row read Off again, and the client got `MCP is disabled. Set enableMcp: true.`
> Re-read after the neighbour fix: "AI access (MCP) Off Turn it on with enableMcp: true. How · Response bodies Off Turn it
> on with captureResponseBody: true. How".

## Rating effect

In-app › Connect — Ease 6 → 7
