# 024 — A new sending key was for the first project, not the one I was in

**Status:** fixed
**Severity:** major
**Found by:** P02 · setup of the neighbour org (Harrow & Vance Studio), through the UI
**Surface:** Cloud › Connect › Make a sending key
**Filed:** 2026-10-27
**Fixed:** 2026-10-27
**Confirmed by:** re-opened Make a sending key with `hv-bookings` in the top bar — the form's Project read `hv-bookings`; the key was made there and `hv-bookings-api` data arrived in `hv-bookings`
**Blocked on:** —

## What happened

The neighbour's owner switched the top bar to the new project `hv-bookings`, opened Connect › **Make a sending key**, and
typed the name. The form's **Project** box read `My app` — the org's first project, not the one on screen. Nothing on
the form called it out; Create key would have made a key that sends `hv-bookings-api` data into `My app`.

## What should have happened

The form starts on the project the person is looking at. Under "All projects" it starts on the first, as before.

## Why it matters

The wrong default is silent and sticky: data lands in the wrong project, alerts and SLOs on the right one never see it,
and people with access to only that other project see a service that is not theirs. Greta (P02) keeps one key per
service and per project; this is the first trap on her path.

## Where it lives

`js/packages/ui/src/pages/connect/KeyForm.tsx` — `picked` started at `data.projects[0]`.

## The fix

`picked` starts at the dashboard's current project (`currentProject(useAccount())`), falling back to the first. One form
serves sending keys and read keys, so both get it.

## Confirmed by

> Re-opened the form as the neighbour with `hv-bookings` in the top bar: Kind "Ingest", **Project "hv-bookings"**,
> Expires "Never". Created `hv-bookings-api` without touching Project; Sending keys lists it under `hv-bookings`; its
> traces (`/bookings`, `82e5317a…`) show in `hv-bookings`.

## Rating effect

Cloud › Connect › Sending keys — Ease, scored in P02's run
