# 173 — Organization › Tags never says the tags belong to one project

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 6 (a tag for the Ostrava client while Hälsa was open in the project menu)
**Surface:** Organization › Tags
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Organization › Tags, 1440 light, 16:39

## What happened

The page sits under Organization and reads as if tags were the organization's. They are one project's: the one open
in the project menu. With Hälsa open, Ifeoma's preview for `service:ostrava-shop` said "No requests match in the last
24 hours" though Ostrava had over a hundred, and saving would have made a Hälsa tag. With All projects open, the page
said "Your role can see tags but not change them." to the owner: one message for two causes.

## Where it lives

`js/packages/ui/src/pages/organization/TagsSettings.tsx`, the section text.

## Fix

The text names the project: "These are the tags of Hälsa Clinics — booking API (Go); each project has its own." Under
All projects it says "Each project has its own tags. Pick one project in the project menu to see, add, or change its
tags." The role message stays for roles that only read.

## Confirmation

- 16:39, Ifeoma: with Ostrava open the page says "These are the tags of Ostrava Bikes — Django shop; each project has
  its own."; with Hälsa open it names Hälsa; with All projects open it says to pick one project.
