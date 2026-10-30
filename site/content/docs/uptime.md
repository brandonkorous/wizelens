---
title: Uptime checks
description: Call your sites and APIs on a schedule, see uptime and response time, get warned before a certificate ends, and share a status page.
---

The local hub and WizeLens Cloud can call your URLs on a schedule and tell you when one stops answering. Open
**Uptime** in the sidebar and choose **New check**.

## A check

| Setting | What it does |
|---|---|
| URL | An `http://` or `https://` address. Put credentials in a header, not in the URL. |
| Method | GET, HEAD, POST, PUT, PATCH, DELETE, or OPTIONS. |
| Runs | Every 1 to 60 minutes. |
| Timeout | 1 to 60 seconds. A slower answer counts as down. |
| Expected status | `200`, a range like `200-299` (the default), or a list like `200,301-302`. |
| Response must contain | Text the body must hold, for example `"status":"ok"`. |
| Headers | One `Name: value` per line, for example an `Authorization` header for a protected health endpoint. |
| Environment | The environment the results are written in. |

Redirects are followed, up to 5, unless the expected status is itself a 3xx code. **Run now** runs a check at once, so you
see right away whether it works.

## Many checks at once

**Import URLs** takes a pasted list of URLs or a file (Excel, CSV, or JSON) with the columns `url`, and if you like
`name`, `method`, `interval` (minutes), and `expected status`. Each row is checked like a check made by hand, and
nothing is added while a row is wrong. Tick checks to **Run now**, **Pause**, **Resume**, or **Delete** them together.

## What you see

- **Status per check:** up, down, pending (not run yet), or off.
- **Uptime for 24 hours, 7 days, and 30 days.** It counts the time between the first failed run and the next run that
  passed, so it stays right even past your trace retention.
- **Response time** over the time range at the top, and failed runs, on each check's own page.
- **Incidents:** when each check went down, for how long, and why ("Expected status 200-299, got 503", "Timed out after
  10 s", "The TLS certificate is not valid: ...").
- **Certificate warnings.** For https checks, the page shows how many days the TLS certificate has left, and warns when it
  ends within 14 days or has ended.

## Results are requests

Every run is also a request of the `wizelens-uptime` service, written like the requests of your own services. So:

- Requests, Errors, Logs, Search, and the Services page show runs. Search `service:wizelens-uptime`.
- A failed run is an error (`UptimeCheckFailed`) with an error log line. A certificate near its end adds a warning line.
- To be told when a site is down, press **Alert me when one fails** on Uptime. It opens a new alert on **Uptime checks
  failing** above 0 over 5 minutes; add where to send it and save.

## Where checks run

- **The hub** runs checks from your machine, so it can reach local and private addresses too. Start it with
  `--no-uptime` to turn checks off.
- **The cloud** runs checks from its own servers. Checks may not point at private or local addresses, the same rule as
  alert webhooks; self-hosted clouds on a private network can allow them with `--allow-private-targets`. Members and above
  add, change, and delete checks, and every change is in the audit log. Header values are stored encrypted, and secret
  ones show as `[redacted]`.

## Public status page

In the cloud, a project can turn on a status page under **Uptime → Public Status Page**. You get an unguessable, read-only
link to share with your users. It shows the title you pick, each check that is on with its name and state, uptime for 24
hours, 7 days, and 30 days, a bar per day for the last 30 days, and when incidents happened. It never shows URLs, headers,
or error text.

The link is shown once, when you make it. **New link** makes a new one and stops the old one; **Turn off** stops it.
