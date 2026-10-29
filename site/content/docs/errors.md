---
title: Errors
description: Every exception grouped by cause, with its stack, requests, users, and releases; resolve, ignore, and assign them like an error tracker.
---

The **Errors** page groups every exception and failed span by cause, from the browser to the database. On the hub and in
the cloud it is also an error tracker: resolve a group, ignore it, see it come back, and assign it.

## Error groups

One group is one cause: the same service, error type, and message. Numbers, ids, and uuids in the message do not split a
group, so `Order 1182 not found` and `Order 1190 not found` are one group. A browser error also groups by the first frame
of your own code, so the same message thrown in two places is two groups, and one bug stays one group across builds.

A group is **Critical** when a request it happened in answered 5xx, or wrote a log line at the critical level. An
[answer you expect](/docs/dashboard/#answers-you-expect) is never critical.

**First seen** is the first time over everything the host keeps, not the start of the time range.

## The Errors page

| Part | What it shows |
|---|---|
| Cards | Total Exceptions, Error Rate, Impacted Endpoints, and Critical Incidents, each against the period before |
| Errors Over Time | Critical and other errors per bucket, and the compared period as a dashed line |
| Top Error Types | The most frequent types. Click one to filter by it. |
| Recent Exceptions | Every group, newest first (or **Most Frequent Exceptions**), a page at a time, with status, endpoint, service, count, and tags. Export as CSV. |
| Errors by Service | Exceptions, error rate, trend, and change per service |
| Error Details | The chosen group: its stack, request, and tags, with the actions below |

The details panel shows the endpoint, service, first and last seen, and for browser errors the source line and the
release. Its tabs are **Stack Trace**, **Request Context** (method, path, status, user, user agent, and the trace), and
**Tags**. **View affected requests** opens the failed requests of the endpoint. **View full error** opens the group's own
page. The arrows step to the previous and next group.

## Filters

**Service**, **Error type**, and **Endpoint** each narrow the list to one value. **Search** finds text in the type or
message, and **Order** picks Most recent or Most frequent. These need a word more:

| Filter | What it does |
|---|---|
| **Status** | Unresolved (the default), Resolved, Ignored, or All Statuses. Hub and cloud. |
| **Release** | **New in** a version: groups first seen while that version was the newest. Shows once you pick a service. |
| **Critical only** | Only groups whose requests answered 5xx or wrote a critical log line |
| **New only** | Only groups first seen in this time range |
| User | A user chip, from a user's page or a link. Remove the chip to see everyone again. |

**Reset** clears them all. Filters are in the address bar, so a filtered list can be shared. Pick a service in the top bar
to filter every page by it.

## One error

Each group has its own page:

- **Occurrences**, **Critical**, **Endpoints**, and **Users Affected** in this range.
- **Occurrences Over Time**, critical and other, against the compared period.
- **Endpoints** it happened on, **Users Affected**, and **Browsers** of the newest 50.
- **Latest Stack Trace**, and the **Newest Occurrences** with time, request, status, user, browser, and duration.
- **Open latest trace**, **Alert on this**, and **Tag this**.

**Alert on this** opens a new [alert rule](/docs/alerts/): the error rate of its endpoint, or new errors in its service when
the error was not part of a request.

## Resolve, ignore, and assign

On the hub and in the cloud, each group has these actions on the details panel and on its page:

| Action | What it does |
|---|---|
| **Resolve** | Marks the group fixed. It leaves the Unresolved list. |
| **Ignore…** | **For 1 hour**, **For 1 day**, **For 1 week**, or **For good**. When the time runs out, the group is unresolved again. |
| **Reopen** | Takes back a resolve or an ignore |
| **Assignee** | Cloud: pick a member of the organization, or Unassigned |

To change many groups at once, tick them (or tick the header to pick every group on the page) and use the bar above the
list: **Resolve**, **Ignore…**, **Reopen**, or, in the cloud, **Assign**. Insights and security risks work the same way.

A resolved group that happens again shows as **Regressed** and comes back to the Unresolved list. A group first seen in
the time range shows as **New**. The Overview's **New and Regressed Errors** panel lists both.

In the cloud, members, admins, and owners change states, and every change writes an audit line. In your app, the Errors
page shows no actions: the hub and the cloud keep these states.

## Browser errors and source maps

Browser errors show next to server errors, marked as browser. When source maps are found, a browser stack shows the
**Original** file, line, and function of each frame, with a few lines of code around it; **Raw** shows the stack as the
browser sent it. See [Source maps](/docs/source-maps/).

## Users and releases

- An error group counts the signed-in users it touched. Click one to open their [user page](/docs/users/).
- [Releases](/docs/releases/) explains **New in** a release, and the service page lists the error groups each
  version brought.

## Elsewhere

- **Ctrl K** finds error groups by type and message.
- An alert rule on **New error types** fires when groups appear that the window before did not have.
- AI tools read groups with `get_errors`. See [AI access](/docs/ai-access/).
