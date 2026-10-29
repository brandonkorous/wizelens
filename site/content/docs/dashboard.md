---
title: The dashboard
description: Every page, one look, at /_wizelens on every service, the hub, and the cloud.
---

The same dashboard runs inside your app at `/_wizelens`, on [the local hub](/docs/hub/), and on
[WizeLens Cloud](/docs/cloud/). Your app shows 15 pages, the hub 21, and the cloud 22. Light and dark themes are built in.

Pick a time range in the top bar, or any from–to, or drag across a chart to zoom. Numbers compare with **the period
before**, or with the **same time last week**. Charts mark the moment each new [release](/docs/releases/) first sent data.
Search everything with **Ctrl K** (**⌘ K**).

![The Overview page](/shots/overview.jpg)

## Pages

The menu is in sections. Pages a host does not run are left out of its menu.

### The top of the menu

| Page | Where | What you get |
|---|---|---|
| **Overview** | Every host | Total Requests, Avg Duration, SQL Queries, Error Rate, Apdex, and Insights Found; Request Activity, Request Timing Breakdown, Services, Recent Requests, Latest Insights, and New and Regressed Errors |
| **Problems** | Every host | Services and endpoints above their normal error rate, p95, or traffic, grouped into problems with a suspected cause ([more](/docs/problems/)) |
| **Search** | Every host | Find any request, trace, span, or log line with the search language; counts per kind, results over time, CSV ([more](/docs/search/)) |

### Investigate

| Page | Where | What you get |
|---|---|---|
| **Requests** | Every host | Filter by method, status, duration, service, endpoint, user, or a search; **With insights**; Live or Paused; CSV; a side panel with Overview, Headers, Response, and Trace |
| **Traces** | Every host | One request as layers: browser, network, routing, handler, each service, each database, render; bottlenecks and the slowest spans; filter by status and duration |
| **Errors** | Every host | Errors over time, top types, errors by service, and the stack and request of each group; Resolve or Ignore a group (hub and cloud), **Regressed** when it comes back, assign on the cloud; filter by status, release, type, endpoint, user ([more](/docs/errors/)) |
| **Logs** | Every host | Every log line, in requests and outside them, filtered by level, service, text, or pattern; patterns, charts from saved searches; Live or Paused ([more](/docs/logs/)) |
| **Database** | Every host | Slow queries over time, time per operation, the slowest, most frequent, or most total-time queries, table hot spots; filter by database, operation, and table |
| **Rendering** | Every host | Render time per route, SSR, hydration, image loading, layout shift, and the React components that render too often |
| **Metrics** | Every host | CPU, memory, GC, request times, and your own counters per service, as charts; split by any attribute |

### Infrastructure

| Page | Where | What you get |
|---|---|---|
| **Services** | Every host | Health of each service, database, and outside host, a map of who calls whom, and a full page per service with its versions |
| **Hosts** | Hub, cloud | CPU, memory, the fullest disk, and network per host, with the services on each ([more](/docs/kubernetes/)) |
| **Kubernetes** | Hub, cloud | Nodes, pods, workloads, restarts, and out-of-memory kills, per cluster and namespace ([more](/docs/kubernetes/)) |

### Analyze

| Page | Where | What you get |
|---|---|---|
| **Insights** | Every host | Every N+1, duplicate query, slow query, and render problem, ranked, with how to fix it ([more](/docs/insights/)) |
| **Security** | Every host | OWASP Top 10 risks from real traffic, and known-vulnerable packages on the hub and the cloud ([more](/docs/security/)) |
| **Users** | Every host | Signed-in users (`enduser.id`) by requests, failures, and latency; a page per user ([more](/docs/users/)) |

### Monitor

| Page | Where | What you get |
|---|---|---|
| **Alerts** | Hub, cloud | Rules, channels, notices, and a page per rule ([more](/docs/alerts/)) |
| **Uptime** | Hub, cloud | Checks that call your URLs on a schedule, with uptime, response time, incidents, and certificate warnings ([more](/docs/uptime/)) |
| **SLOs** | Hub, cloud | Error budgets, burn rate, and Apdex targets ([more](/docs/slos/)) |
| **Dashboards** | Hub, cloud | Your own pages of metric charts ([more](/docs/dashboards/)) |

### Manage

| Page | Where | What you get |
|---|---|---|
| **Connect** | Every host | How to send data here, how the host is set up, keys, and every add-on option (below) |
| **People & access** | Cloud | Members, Project access, Single sign-on, User sync (SCIM), Connected apps, Shared links, and Audit log ([more](/docs/cloud/)) |
| **Organization** | Cloud | Projects, Data retention, Thresholds and hidden keys, Tags, Billing, and General (below) |
| **Settings** | Hub, in-app | Data retention and thresholds (hub), Tags, and Preferences (below) |

Lists open a page of their own for each service, endpoint, error group, query, page route, and user. Number cards open
the list behind them: Error Rate opens the failed requests.

Your own preferences (theme, default time range, time zone, and clock) are under **Account → Preferences** in the user
menu on the cloud, and under **Settings → Preferences** on a hub or in-app. The cloud saves them to your account, so every
browser you sign in on uses them. A hub or in-app dashboard saves them in this browser.

## Connect

| Section | Where | What it holds |
|---|---|---|
| **Setup steps** | Hub, cloud | How to send a service's data here. On the cloud, step 1 makes the sending key right there. An app that sends to a hub shows **Sends to**. |
| **Server setup**, **This service** | Every host | How WizeLens is set up on the hub or cloud, or in each connected service |
| **Sending keys** | Cloud | Ingest keys (apps) and browser keys (static sites) |
| **AI read keys** | Cloud | Read keys for AI agents and scripts, and the MCP address |
| **Add-on options** | Every host | Every option of the .NET and Node add-ons, and the environment variable that sets it |

## Organization and Settings

| Section | Where | What it holds |
|---|---|---|
| **Projects** | Cloud | Add a project, clear its data, or delete it |
| **Data retention** | Hub, cloud | How long each project keeps traces; on the cloud also its logs, and the longest any project keeps data |
| **Thresholds and hidden keys** | Hub, cloud | Slow query (ms), N+1 threshold, and more hidden keys, for the project you pick |
| **Tags** | Every host | The tags of this project ([more](/docs/tags/)) |
| **Billing** | Cloud | The plan, this month's data, and the spend cap |
| **General** | Cloud | The organization's name, and deleting it |
| **Preferences** | Hub, in-app | Theme, default time range, time zone, and clock |

A new organization is made from the organization menu at the top.

## Around every page

### The menu

The menu has a top group (Overview, Problems, Search) and five sections: **Investigate**, **Infrastructure**,
**Analyze**, **Monitor**, and **Manage**. Click a heading to fold its section. The menu remembers what you folded, and a
folded section still shows the page you are on. Saved views show under **Saved**.

The foot of the menu has a **Docs** link and the version of your add-on, hub, or cloud. Click the version to open the
[changelog](/changelog).

On a phone, a bar at the bottom holds **Overview**, **Problems**, **Requests**, **Errors**, and **More**. **More** opens a
drawer with every other page, in the same sections, and your saved views.

### The top bar

| Part | What it does |
|---|---|
| Search box | Opens Ctrl K search (below) |
| Where it runs | **In-app**, **Local hub**, or **Cloud**, and how long the host keeps data |
| Service chip | Shows while a service is chosen. Click it to show all services again. |
| Project menu | Hub and cloud: organization, project, environment, and the services sending data, each with its hosts. Pick a service and every page counts that service only. |
| Environment | In your app: its environment and the services it is connected to |
| Time range | Presets, a **Custom range** from–to, and **Compare with**: **The period before** or **Same time last week** |
| Star | **Save this view** (below) |
| Link | **Share this page** (below) |
| Bell | Errors, insights, serious security risks, and fired alerts of the last 24 hours |
| Theme | Light, dark, or the same as your system |
| Your name | Cloud: **Account**, your organization and role, and **Sign out** |

The address bar holds the time range, a custom window, the compare choice, the project, the environment, and the service.
A copied link, or the link in an alert notice, opens exactly what you saw.

### Projects and All projects

On the cloud, the project menu lists your organization's projects, with **All projects** first when there is more than
one. All projects shows every project you may read on one screen, with totals that add up. With more than one
organization, the same menu picks the organization. See [All projects](/docs/teams/#all-projects).

The hub lists its projects and environments, each with **All projects** and **All environments** first.

### Save this view

The star in the top bar saves the page you are on, with its filters and time range. Give it a **Name**. It shows under
**Saved** in the menu, in the phone's **More** drawer, and in Ctrl K. A saved search also shows under the box on the Search
page. On the Logs page, **Chart it on the Logs page** turns the search into a chart.

On the cloud a saved view is yours until you tick **Share with the team**. On the hub every saved view is shared with the
project. The star shows on the hub and the cloud.

### Share this page

On the cloud, the link button makes a read-only link to the page you are on: Overview, Requests, Errors, Database, Logs,
Insights, Security, Rendering, Services, Traces, and the page of one error, service, endpoint, query, or route. Pick
**For 1 day**, **For 7 days**, or **For 30 days**, add who it is for if you like, then **Make a link**. The numbers are kept as they are now and do not
change. Anyone with the link can open it. A link belongs to one project, so it is not offered under All projects. See
and revoke links under **People & access → Shared links**.

### Live or paused

Requests and Logs update as new data comes in. Click **Live** to switch to **Paused** and keep the list still. Click again
to go live.

### A new version

When your hub or cloud starts a new release, an open dashboard shows "A new version of WizeLens is ready." with **Refresh**
and **Later**. The page keeps working until you refresh.

## Ctrl K

**Ctrl K** (**⌘ K**) opens one search over everything: pages, requests, trace ids, log lines, services, error groups,
queries, insights, security risks, metrics, alerts, SLOs, saved views, and dashboards. The first hit is
**Search everything**, which opens the [Search page](/docs/search/) with your text.

![The Traces page](/shots/traces.jpg)

## One trace

Open any trace for the full detail, across every service it touched.

- **The header:** services, health, and how the time splits into server code, database, render, and network and other.
  **Copy trace id** copies it.
- **Tabs:** Timeline, SQL, HTTP, Messages, Logs, and Errors, each with its count.
- **Findings:** the errors and insights of this request, then its **Security risks**. Click one to select its spans.
- **The timeline:** **Find spans by name or service**, **Errors only**, **Critical path**, **Expand all**, and
  **Collapse all**. A span with children shows its self time.
- **A span:** its service, kind, duration, start, status, and id; the query and its parameters; events, logs, and
  attributes. Click an attribute value to find spans with it. Links open its service, endpoint, query, error, and the
  request's logs. A span from Kubernetes links to its pod and node.
- **JSON** downloads the trace.
- **Compare** with another trace: paste its id, or pick a recent trace of the same request. The compare page shows the
  numbers side by side, self time per service, and both timelines.
- **Tag this** and the trace's tags ([more](/docs/tags/)).
- **Share** (cloud): a read-only link to this trace for 1, 7, or 30 days.

## What counts as an error

A request fails when it answers 500 or more, or when a step inside it throws or ends with an error. A 4xx answer, like
404 Not Found, is not a failure, even when your app marks it as an error. So bots that ask for files you do not have, and
pages that look something up and fall back, do not push up your error rate.

### Answers you expect

Some 5xx answers are on purpose. A site that is paused answers 503 "come back later", so search engines keep its pages
and try again. Mark these answers as expected, and WizeLens leaves them out of error rates, failed requests, error
groups, problems, alerts, and health. The status stays as it is: `status:5xx` still finds them.

| How | Code |
|---|---|
| Any app, any language | Send the response header `X-WizeLens-Expected: 1` |
| Node, Next.js | `wizelens.expected()` inside the request |
| .NET | `WizeLensRequest.Expected()` inside the request |
| Java, Python, Go | Set the attribute `wizelens.expected` to `true` on the server span |

The header works with every add-on, and it reaches the browser too, so the page's own request is not an error either.
An answer you expect still fails when your code throws while it builds it: only the status is forgiven, never an
exception.

## Time

Database and outgoing times are wall time: spans that overlap count once, so a request never shows more database time than
server time. When queries ran at the same time, "all queries added up" is shown next to it.

## How far back

| Running | Ranges |
|---|---|
| In your app | Up to 24 hours (newest 2,000 traces) |
| The hub | Up to what it keeps: 7 days by default (`--retention`) |
| The cloud | Up to 30 days in the menu, computed on the server |

Ranges longer than the host keeps are hidden.
