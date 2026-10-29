# 186 — "Fullest Disk" shows one disk's share with another disk's size

**Status:** fixed
**Severity:** major
**Found by:** P06 Ifeoma, act 8 (host lmd-vm-ubuntu-03, sent by the collector from the docs)
**Surface:** Hosts › a host
**Filed:** 2026-10-28
**Fixed:** 2026-10-28
**Confirmed by:** P06 Ifeoma at Hosts › lmd-vm-ubuntu-03, 1440 light and 360 dark, 17:32

## What happened

The card read "Fullest Disk 53.7% · 160 GB of 1,007 GB". 160 GB of 1,007 GB is 16%. The 53.7% was the small `/mnt`
disk (62.3 MB of 126 MB); the bytes were the sum of all disks. A platform lead reads the card as "the big disk is half
full" and plans for space that is not used.

## Where it lives

`js/packages/ui/src/pages/infra/HostDetail.tsx`: the share is the fullest file system's, the note was the host total.

## Fix

The note is the fullest file system's bytes and mount: "62.3 MB of 126 MB on /mnt". With no file system rows it falls
back to the host total.

## Confirmation

- 17:32, Ifeoma: "Fullest Disk 53.7% · 62.3 MB of 126 MB on /mnt", at 1440 light and 360 dark.
