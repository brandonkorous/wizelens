---
title: Search
description: One search language for requests, traces, spans, and logs, on the Search page, in every list, and for AI tools.
---

One search language runs everywhere in WizeLens: the **Search** page, the search box on Requests, Traces, and Logs, tags, and
the `search` tool for [AI agents](/docs/ai-access/). It works the same in your app, on the hub, and in the cloud.

```text
service:api status:>=500 duration:>1s "connection reset" -path:/health
@db.system:postgres @http.route:/orders/* (level:error OR level:critical)
```

## The Search page

Open **Search** in the menu, or pick **Search everything** in Ctrl K.

- **Four kinds:** Requests, Traces, Spans, and Logs. Each tab shows how many results it has (counted up to 1,000, then
  "1000+").
- **Over time:** a chart shows when the chosen kind's results happened.
- **Results:** 50 at a time; **Show more** loads the next 50. **Export** downloads the results shown as CSV.
- **Tag this** saves the search as a [tag](/docs/tags/).
- **Saved searches** show under the box. The star in the top bar saves the one open.

The search and the kind are in the address bar, so a link opens the same results.

## In every list

Requests, Traces, and Logs have the same search box. Free words filter the list as before. Fields and attributes, such as
`status:5xx duration:>1s @user.id:42`, narrow the list to what the search finds.

The box suggests as you type: field names, attribute keys, and the common values of a field, newest data first. **Tab**
or **Enter** picks a suggestion. A search with a mistake is marked where it is wrong, and says why.

## Words and phrases

| You type | It finds |
|---|---|
| `timeout` | The word anywhere in the text, in any case |
| `"connection reset"` | The exact phrase |
| `checkout timeout` | Both words (a space means AND) |
| `checkout OR cart` | Either word |
| `-health` or `NOT health` | Leaves out what has the word |
| `(a OR b) c` | Parentheses group parts |

Free words read the path, endpoint, user, request id, client address, tags, and error text of a request; the root name,
URL, services, and errors of a trace; the name, URL, SQL text, SQL parameter values, and error text of a span; and the message, category, and
trace name of a log line.

Put a backslash before a character to take it literally, or put it in quotes. An address such as `https://shop.test/cart`
is read as text.

## Fields

`field:value` matches one known field. Text values match the whole value in any case. Add `*` for any text:
`service:api*`, `path:/orders/*`.

| Field | Finds | Example |
|---|---|---|
| `service` | Service name | `service:checkout` |
| `env` | Environment | `env:production` |
| `trace` | Trace id, or its start | `trace:4bf92f35` |
| `span` | Span id, or its start (spans, logs) | `span:00f067aa` |
| `name` | Span name, or the trace's root span name | `name:"GET /api/orders"` |
| `method` | HTTP method | `method:POST` |
| `path` | URL path | `path:/api/orders/*` |
| `route` | Route template (requests, spans) | `route:/orders/{id}` |
| `status` | HTTP status or span status | `status:5xx`, `status:404`, `status:error` |
| `duration` | Duration | `duration:>1s` |
| `level` | Log level | `level:>=warn` |
| `category` | Log category, or span category | `category:db` |
| `kind` | Span kind: server, client, internal, producer, consumer | `kind:client` |
| `user` | Signed-in user id (requests, spans) | `user:42` |
| `error` | True when it failed | `error:true` |
| `message` | Log message | `message:*timeout*` |
| `tag` | A tag by name | `tag:bot` |

A field a kind does not have never matches it: `level:error` finds only log lines.

## Attributes

`@key:value` matches any span or log attribute, such as `@http.route:/orders/*`, `@db.system:postgres`, or
`@user.id:42`. A name that is not a field needs the `@`: WizeLens says so when you leave it out.

## Numbers, ranges, and wildcards

| Form | Example | Means |
|---|---|---|
| `>` `>=` `<` `<=` | `duration:>=250ms`, `@http.response.status_code:>=500` | Compare. Attributes compare as numbers. |
| `a..b` | `status:500..599`, `duration:1s..5s` | A range, both ends included |
| `*` | `path:/admin*` | Any text |
| `field:*` | `user:*` | Has any value |

- **Durations:** `250ms`, `1.5s`, `2m`, `1h`, or `us`. A bare number is milliseconds.
- **Statuses:** `500`, a class such as `5xx`, a comparison such as `>=500`, or the span status `ok`, `error`, or `unset`.
- **Levels:** trace, debug, info, warn, error, critical. `warning`, `err`, `fatal`, and `crit` work too.
- **Ranges and comparisons** work on status, duration, level, and attributes. Text fields cannot use them.

## Tags

`tag:name` finds everything a tag finds. A tag is a named search, so `tag:checkout status:5xx` combines both. A name that
no tag has finds the tags your app sets with that name. See [Tags](/docs/tags/).

## Limits

A search can be up to 2,000 characters, with up to 64 parts and 16 levels of parentheses.

## Ctrl K

**Ctrl K** (**⌘ K**) searches more than the search language covers: pages, requests, trace ids, log lines, services,
error groups, queries, insights, security risks, metrics, alerts, SLOs, saved views, and dashboards. See
[The dashboard](/docs/dashboard/#ctrl-k).
