---
title: Sampling
description: Keep a share of the traces on busy services, plus every trace with an error or a slow span.
---

## Turn it on

Set a rate between 0 and 1:

| Where | Code |
|---|---|
| Node | `createWizeLens({ serviceName: "orders-api", sampling: { rate: 0.1 } })` |
| .NET | `AddWizeLens(o => o.Sampling.Rate = 0.1)` |
| Both | `WIZELENS_SAMPLE_RATE=0.1` |

## What is always kept

- Every trace with an error (`keepErrors`, on by default).
- Every trace with a server-side span of 1 second or more (`keepSlowMs`, default `1000`; `null` turns it off).

## Every service keeps the same traces

The choice comes from the trace id, so every service makes the same choice. A kept trace is whole across all your
services, and a dropped one is gone everywhere.

A trace outside the rate is held until its first span in this process ends. It is kept if anything in it failed or was slow,
and dropped if not. An error that comes after the choice still keeps the rest of the trace.

## What it changes

The local store, the SQLite file, and the hub all get only the kept traces. The **Settings** page shows the rate, so read the
counts on other pages as a share of the traffic.
