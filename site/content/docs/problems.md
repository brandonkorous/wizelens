---
title: Problems
description: How WizeLens learns what normal looks like for each service and endpoint, groups what is above normal into problems, and names a suspected cause.
---

The **Problems** page answers "is anything wrong right now, and why?" without a threshold to set. It uses plain statistics.
There is no AI inside WizeLens.

## What normal means

For every service (an API, a worker, a database, an outside host) and every endpoint, query, or call of it, WizeLens keeps
three numbers per time bucket: **error rate**, **p95 duration**, and **traffic**. It compares each bucket with the same bucket
in the **4 weeks before**: the same hour of the same weekday. Monday morning is compared with Monday mornings, not with Sunday
night.

A host that keeps less than two weeks (the hub keeps 7 days unless you start it with a longer `--retention`) compares with the
same hour on the **6 days before** instead. WizeLens needs two earlier weeks (or days) with data before it judges anything.
Until then the page says it is learning.

A value is **above normal** when it is more than a few spreads above the mean of those earlier samples. The spread is their
standard deviation, with a floor so a very steady history does not turn every wiggle into a problem. Very quiet moments are
skipped: a bucket needs 10 requests, 5 failures, or 10 measured calls before it counts.

| Sensitivity | Spreads above normal |
|---|---|
| High | 2 |
| Medium (default) | 3 |
| Low | 4 |

## Problems, not alarms

One slow database makes the API that calls it slow, and the API in front of that. Anomalies that start within 15 minutes of
each other on services that call each other (the call map on the Services page) become **one problem card**. Ongoing problems
come first.

Each card names a **suspected cause**, the most telling one it finds:

| Cause | What WizeLens saw |
|---|---|
| **New release** | A service in the problem started sending a new `service.version` just before it began, and not in the week before. The same releases as the chart markers and the service page's versions |
| **New error** | An error group that did not happen in the week before started with it |
| **Query** | A query got slower, fails more, or runs far more often than normal |
| **Downstream service** | A service that the others call, and that calls none of them, is above normal too |

Open a card for each anomaly on a chart against its normal and the line it crossed, and links to the service, the error,
or the database.

## Tell WizeLens your version

Problems can only name a release when spans carry `service.version`.

- **Node:** `createWizeLens({ serviceName: "orders-api", release: "2.4.0" })`, or set `WIZELENS_RELEASE` or `OTEL_SERVICE_VERSION`. When you
  start the app with npm, the package version is used.
- **ASP.NET Core:** `o.Release = "2.4.0"`, or `WIZELENS_RELEASE` or `OTEL_SERVICE_VERSION`. By default it is the app's informational version.
- **OpenTelemetry (OTLP):** set the `service.version` resource attribute. The hub copies it onto every span of that service.
- **React:** the `release` prop, or what the build plugin sets.

## Alerts and AI tools

In WizeLens Cloud, an alert rule can fire when error rate, p95, or requests **is above normal** for any service or endpoint.
Every fired notice links to the problem it is part of, with its suspected cause. See [WizeLens Cloud](/docs/cloud/#alerts).

AI tools get `list_problems` on the hub and the cloud. See [AI access](/docs/ai-access/).
