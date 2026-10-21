---
title: SLOs and Apdex
description: Say how much of a service's traffic must succeed or be fast enough, watch the error budget and its burn rate, and set Apdex targets.
---

An SLO (service level objective) says how much of a service's or an endpoint's requests must be good over 7 or 30 days.
WizeLens shows how much error budget is left and how fast it burns, and an alert can watch the burn rate. SLOs run on
[the local hub](/docs/hub/) and on [WizeLens Cloud](/docs/cloud/). Open **SLOs** in the menu and choose **New SLO**.

## An SLO

| Setting | What it does |
|---|---|
| **Name (optional)** | What the list and alerts call it |
| **Service** | The service it covers |
| **Endpoint (optional)** | One endpoint, such as `GET /api/orders/{id}`, or all of them |
| **Good means** | **Requests succeed**, or **Requests are fast enough** |
| **Within (ms)** | For fast enough: a good request finishes in this time |
| **Target (%)** | The share that must be good, such as 99.9 |
| **Window** | **Over 30 days** or **Over 7 days**, ending now |

The goal reads as a sentence: "99.9% of checkout requests succeed, over 30 days".

## Error budget and burn rate

The error budget is the share of requests that may be bad. At 99.9% over 30 days, 0.1% of that window's requests may fail.
**Budget Left** is how much of it is not spent yet: 100% when nothing went wrong, 0% once it is spent.

The burn rate is how fast the budget goes: the bad share now, over the bad share allowed. At 1 the budget lasts exactly
the window. At 14.4 for an hour, 2% of a 30-day budget is gone: page someone. At 6 for six hours, open a ticket.

## The SLOs page

**Objectives** lists each SLO:

| Column | What it shows |
|---|---|
| SLO | Its name |
| Goal | The sentence above |
| Now | The good share over the window, red when under the target |
| Budget Left | The error budget not spent yet |
| Burn (1 h / 6 h) | The burn rate over the last hour and the last 6 hours |
| Requests | Requests in the window |

Each SLO has its own page: its goal, the good share now, its requests, the burn now, and a link to the service or endpoint
it covers. Two charts show **Error Budget Left (0% once spent)** and **Good Requests** against the target over the window.
**Edit** and **Delete** change it.

## Alert on burn rate

**Alert on burn rate** on an SLO's page opens a new [alert rule](/docs/alerts/) that fires when the burn rate goes above
14.4 over 1 hour. Change the rate and the window to fit. The notice reads:

```text
SLO Checkout availability burns its budget 16.2× as fast as allowed (above 14.4×)
```

## Apdex

Apdex scores how fast requests felt, from 0 to 1, against a target time:

- **Satisfied:** at or under the target.
- **Tolerating:** under four times the target.
- **Frustrated:** slower than that, or failed.

The score is satisfied plus half of tolerating, over all requests.

| Score | Rating |
|---|---|
| 0.94 and up | Excellent |
| 0.85 to 0.94 | Good |
| 0.70 to 0.85 | Fair |
| 0.50 to 0.70 | Poor |
| Under 0.50 | Unacceptable |

The **Apdex** card on the Overview and on each service's page shows the score, its rating, and the target. On the hub and
the cloud, set each service's target under **Apdex Targets** on the SLOs page, then **Save targets**. An empty target uses
500 ms, and your app's own dashboard uses 500 ms for every service. With several targets, the Overview scores each service
against its own.

## Teams and projects

- In the cloud, members, admins, and owners make and change SLOs and targets; viewers see them.
- In the cloud, under **All projects**, the list shows each SLO's project, a new SLO asks which project it belongs to,
  and Apdex targets are set per project: pick one in the menu.
- **Ctrl K** finds SLOs by name.
