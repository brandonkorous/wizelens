---
title: Alerts
description: Rules that watch error rates, latency, traffic, logs, metrics, security, and SLOs, and tell Slack, Teams, Discord, PagerDuty, a webhook, or email.
---

Alerts run on [the local hub](/docs/hub/) and on [WizeLens Cloud](/docs/cloud/). A rule watches one value over a window
and sends a notice when it crosses your line. Rules are checked every minute. Open **Alerts** in the menu and choose
**New alert**.

## A rule

| Setting | What it does |
|---|---|
| **Name** | What the notice and the list call it |
| **Environment (optional)** | Watch one environment, or all |
| **Metric** | What to watch (below) |
| **Condition** | **is above**, **is at or above**, **is below**, **is at or below**, or **is above normal** |
| **Threshold** | The line, in the metric's unit |
| **Over the last** | 5 minutes, 15 minutes, 1 hour, 6 hours, or 24 hours |
| **Service (optional)**, **Endpoint (optional)** | Watch everything, one service, or one endpoint of it |
| **Remind while firing** | No reminders, or every 15 minutes, hour, 4 hours, or day |
| **On** | Turn the rule on or off |
| **Notify** | Up to five channels (below) |

## What a rule can watch

| Metric | Unit | Counts |
|---|---|---|
| Error rate | % | The share of requests that failed |
| p95 request duration | ms | p95 of request durations |
| Average request duration | ms | The average request duration |
| Requests | | Requests in the window |
| New error types | | Error groups in the window that the window before did not have |
| Slow queries | | Slow queries in the window, per service |
| Log lines | | Lines that match a log search |
| New security risks | | Security risks in the window that the window before did not have, per service |
| A metric (CPU, memory, your own) | | One OpenTelemetry metric |
| An SLO's burn rate | × | How fast an SLO spends its error budget |

- **A metric:** pick the **Metric name**, what to **Read** (Newest value, Average, Highest, p95, p99, or Per second), and
  optionally its service. The threshold is in the metric's base unit: seconds, bytes, or 0 to 1 for ratios (0.8 is 80%).
- **Log lines:** pick the **Level**, the service, the text, and where it was **Written** (in requests, outside them, or
  both). **Alert on this search** on the [Logs](/docs/logs/) page fills these in, with its category and pattern.
- **An SLO's burn rate:** pick the SLO. A burn rate of 1 spends the budget exactly over the SLO's window. 14.4 over 1 hour
  spends 2% of a 30-day budget. See [SLOs](/docs/slos/).

## Above normal

Pick **is above normal** on error rate, p95, or requests to skip the threshold. The rule checks every service and endpoint
against the same window at the same time in earlier weeks (or days, on hosts that keep less), and fires on the one that
broke. **Sensitivity** is High, Medium, or Low: 2, 3, or 4 spreads above normal. The notice names it and its normal
value:

```text
p95 duration is above normal on pay POST /api/charge: 412 ms (normal 31 ms, alerts above 46 ms)
```

In the cloud, every fired notice links to the [problem](/docs/problems/) it is part of, with its suspected cause:

```text
Part of a problem: Error rate above normal on pay and 2 more. Suspected cause: pay 2.0.0 was released as it started.
```

## Where notices go

Add up to five channels with **Add a channel**:

| Send to | Needs |
|---|---|
| Slack incoming webhook | The webhook URL |
| Microsoft Teams webhook | The webhook URL |
| Discord webhook | The webhook URL |
| PagerDuty (Events API v2) | The routing key of a PagerDuty service |
| Webhook (JSON) | Any URL that takes a JSON POST |
| Email to members | Cloud only: the members to send to. Only confirmed emails get it. |

With no channel, the alert shows on the dashboard and in the bell only. A notice goes out when the state changes, and
again at each reminder while it keeps firing:

```text
Error rate is 3.4% (above 2%)
Error rate is 3.1% (still above 2%)
Error rate is 1.1% (no longer above 2%)
```

The hub can send to local and private addresses. The cloud sends only to https addresses on the public internet, unless it
runs with `--allow-private-webhooks`.

## The Alerts page

**Rules** lists each alert with its rule, state, last value, and where it sends. States are **OK**, **Firing**,
**Acknowledged**, **Muted**, and **Off**. Each row has:

| Action | What it does |
|---|---|
| **Acknowledge** | While firing: stops the reminders |
| **Mute…** | **For 1 hour**, **For 4 hours**, **For 1 day**, or **Until I unmute**. **Unmute** ends it. |
| **Turn off**, **Turn on** | Stops or starts the rule |
| **Test** | Sends a test notice to every channel, and says how it went |
| **Edit**, **Delete** | Change or remove the rule |

Tick rules to **Mute…**, **Unmute**, **Turn on**, **Turn off**, or **Delete** them together. In the cloud, a new alert
can be made in many projects at once: under **Make this alert in**, pick the projects (or **Select all**). Each project
gets its own copy of the rule.

**Recent notices** lists what fired, resolved, reminded, was tested, acknowledged, muted, or unmuted, with the message and
how each channel took it.

Each rule has its own page: **Value Against the Line** for every check, **View the traces** behind it, and
**Notices and Changes**.

## Alert on this

These buttons open a new rule, filled in:

| Where | The rule |
|---|---|
| A service's page | Its error rate |
| An endpoint's page | Its p95 duration |
| An error's page | The error rate of its endpoint, or new errors in its service |
| A metric chart | That metric |
| **Alert on this search** on Logs | The count of that log search |
| **Alert on burn rate** on an SLO | That SLO's burn rate |

## Teams and AI tools

- In the cloud, members, admins, and owners make and change rules; viewers see them.
- In the cloud, under **All projects**, a new rule asks which project it belongs to.
- On the hub and the cloud, AI tools read rules and notices with `get_alerts`. Channel secrets are left out. See
  [AI access](/docs/ai-access/).
