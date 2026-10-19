---
title: Tags
description: Name a search, and everything it finds wears that name in every list, on old and new data alike.
---

A tag is a search with a name and a color. Every request, trace, span, and log line the search finds shows the tag as a
chip, wherever it is listed. Click a chip to see all of them on the Search page, or type `tag:name` in any search.

WizeLens keeps the tag, not a mark on your data. So a tag works on data from before you made it, it stays when old
traces expire, and changing its search moves it everywhere at once.

## Built-in tags

Three tags come on by default. Turn any of them off under **Settings → Tags**.

| Tag | Shows on |
|---|---|
| `stream` | Responses sent as a stream of events (server-sent events), such as MCP and live updates. They stay open on purpose, so they look slow. |
| `probe` | Health checks from Kubernetes, Google Cloud, and AWS load balancers. |
| `bot` | Crawlers and bots, by their user agent. |

## Make a tag

On the local hub and on WizeLens Cloud:

- **Tag this.** Open a request, a trace, an error, or a service, and press **Tag this**. Pick what to tag: the endpoint,
  the service, the user, or the error. WizeLens fills in a search that keeps finding it after the trace itself is gone,
  and shows what the search finds now. Name it, pick a color, and add it.
- **Settings → Tags → New tag.** Write any search, such as `service:api route:/checkout*` or
  `@http.response.header.content-type:text/event-stream*`.
- **From a search.** On the Search page, **Tag this** saves the current search as a tag.

On the cloud, members, admins, and owners make and change tags; viewers and read keys see them. Every change is in the
audit log. A project holds up to 50 tags.

## In your app's code

The in-app dashboard keeps tags in code:

| Where | Code |
|---|---|
| Node | `createWizeLens({ serviceName: "shop", tags: { rules: [{ name: "checkout", query: "route:/checkout*", color: "green" }], disableBuiltIns: ["bot"] } })` |
| .NET | `AddWizeLens(o => { o.Tags.Rules.Add(new("checkout", "route:/checkout*", "green")); o.Tags.DisableBuiltIns.Add("bot"); })` |

A tag with a bad search stops the app at startup with the reason, so a typo never goes unnoticed. **Tag this** in the
in-app dashboard shows the line to add.

## Search with tags

| Search | Finds |
|---|---|
| `tag:checkout` | What the `checkout` tag finds, and anything your app tagged `checkout` with `wizelens.tag()` |
| `tag:cache:hit` | Requests your app tagged `cache` with the value `hit` |
| `-tag:probe -tag:bot` | Everything but health checks and bots |
| `tag:check*` | Every tag whose name starts with `check` |

If no tag has the name you typed, the Search page says so. AI tools get the same: `list_tags`, `tag:` in every
search, and the tags of each result.

## Lists of endpoints, services, and errors

A row that counts many requests shows a tag only when the tag's search describes the row itself. `service:api
route:/orders/*` shows on that endpoint and its requests; `duration:>1s` shows on slow requests, never on an endpoint.
