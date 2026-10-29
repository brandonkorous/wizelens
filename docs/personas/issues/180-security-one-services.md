# 180 — Security says "from 1 services"

**Status:** fixed
**Severity:** minor
**Found by:** P06 Ifeoma, act 7 (Security, with only the Ostrava shop selected)
**Surface:** Security
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Security, 1440 light, 17:16

## What happened

The package-check line under the OWASP grid read "… package versions from 1 services are checked against OSV". With
one project picked, one service is the usual case.

## Where it lives

`js/packages/ui/src/pages/security/SecurityPage.tsx`, `scanNote`.

## Fix

The line counts each noun, and "is" or "are" follows the package count.

## Confirmation

- 17:16, Ifeoma: "… package versions from 1 service are checked against OSV, last 57m ago."
