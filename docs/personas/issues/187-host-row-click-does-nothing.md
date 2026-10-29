# 187 — Clicking a host's row does nothing; only its name opens it

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 8 (Hosts)
**Surface:** Hosts
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Hosts, 1440 light, 17:33

## What happened

On Errors, Alerts, Dashboards, and Database a click anywhere on a row opens it. On Hosts a click on the CPU or Memory
bars did nothing; only the blue name opened the host.

## Where it lives

`js/packages/ui/src/pages/infra/HostsPage.tsx`, the hosts table.

## Fix

The row opens the host, like the other lists.

## Confirmation

- 17:33, Ifeoma: a click on the lmd-vm-ubuntu-03 row opened `/hosts/lmd-vm-ubuntu-03`.
