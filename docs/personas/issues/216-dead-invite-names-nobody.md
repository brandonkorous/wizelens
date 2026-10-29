# 216 — A dead invite link says only "ask your team"

**Status:** fixed
**Severity:** minor
**Found by:** P05, signed out, an old invite link
**Surface:** `#/invite`
**Filed:** 2026-10-29
**Fixed:** 2026-10-29
**Confirmed by:** P03 Sid, signed out at 360: a withdrawn invite reads "This invite to Ashgrove & Peña was withdrawn. Ask Siddharth Ramaswamy-Kowalczyk for a new one."; `invite-preview.test.ts` covers used and expired

## What happened

A used, withdrawn, or expired invite showed "This invite link is not valid any more. Ask your team for a new one." A person invited by someone outside their own team has no idea who to ask, or which organization it was.

## Where it lives

`GET api/invites/:id` found only pending, unexpired invites, so it knew nothing about a dead one.

## Fix

The preview finds any invite by its id (the link's secret). A dead one answers 410 with the organization, why it stopped (used, withdrawn, expired after 7 days), and the inviter's name.
