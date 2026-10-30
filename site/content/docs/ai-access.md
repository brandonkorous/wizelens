---
title: AI access (MCP)
description: WizeLens has no AI of its own. Claude and other AI tools can read what it sees, read-only, only for the projects you allow.
---

## WizeLens Cloud

The MCP address is **`https://mcp.wizelens.com`**. If you run the cloud yourself, it is `https://<your cloud>/_wizelens/mcp`.

### Connect Claude

1. In Claude, open **Settings → Connectors → Add custom connector**, and enter `https://mcp.wizelens.com`.
2. Claude opens WizeLens. Sign in as usual (password, passkey, or single sign-on).
3. Pick the organization, then **all projects** (also ones made later) or **only the projects you tick**. Click **Allow**.

Claude Code connects the same way:

```bash
claude mcp add --transport http wizelens https://mcp.wizelens.com
```

Then run `/mcp` in Claude Code and choose **wizelens** to sign in.

Other MCP clients (Cursor, VS Code, and others) connect the same way: add `https://mcp.wizelens.com` as a remote HTTP
server, and they open the WizeLens sign-in. WizeLens supports OAuth 2.1 with PKCE and dynamic client registration, the
way the MCP spec asks.

### Reports on a schedule

A connection keeps working without you, so an agent that runs on a schedule (for example a Claude scheduled task) can
read WizeLens every morning. Ask it something like:

> Every weekday at 8:00, call `get_overview` for the last 24 hours. Tell me which services need attention, which errors
> are new or growing, and which endpoints got slower. Keep it short.

`get_overview` with no project reads every project the connection may see, so one call covers 20 APIs or more. For
charts, `get_timeseries` gives exact requests, errors, error rate, average, and p95 per bucket (16, 24, or 48 in the
window), and `group_requests` gives the same per endpoint. Both count every request, not a sample.

### What a connected app gets

- **Read only.** The only permission is `wizelens:read`. No tool can change anything.
- **Only what you picked.** One organization, and the projects you chose. "All projects" also covers projects made later.
- **Until you end it.** The access token lasts an hour and the app renews it on its own (the refresh token lasts 30 days
  and renews on each use). Remove an app any time under **Account → My apps**. Admins see and remove everyone's
  apps under **People & access → Connected apps**. Leaving the organization ends it too.
- **Audited.** The audit log shows who connected which app, and every tool call with the person and the app.

### Read keys (scripts and CI)

For a script, a CI job, or an agent with no person to sign in, make a **read key** under **Connect → AI read keys** and send it
as a header:

```json
{
  "mcpServers": {
    "wizelens": { "type": "http", "url": "https://mcp.wizelens.com", "headers": { "Authorization": "Bearer wl_rk_..." } }
  }
}
```

A key for one project reads that project. A key for several adds `list_projects`, and every tool takes a `project`
argument (its id or name); leave it out to read every project together. `?project=<id>` on the address fixes one project.

### Your own cloud

Sign-in for MCP clients works out of the box at `<public-url>/_wizelens/mcp`. To give MCP its own name, as
`mcp.wizelens.com` does, start the cloud with `--mcp-url https://mcp.example.com`, and have your proxy send `/` and
`/mcp` to `/_wizelens/mcp`, and `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server/*`
as they are. People still sign in at the public URL.

## On your own machine

Turn MCP on per service:

```csharp
builder.Services.AddWizeLens(o => o.Mcp = true);
```

```ts
createWizeLens({ service: "orders-api", mcp: true });
```

Then point any MCP client at the service:

```json
{
  "mcpServers": {
    "wizelens-gateway": { "type": "http", "url": "http://localhost:5100/_wizelens/mcp" }
  }
}
```

The **hub** covers every service with one address: start it with `--mcp`, and use `http://localhost:5960/_wizelens/mcp`.
When the hub runs with `--token`, send that token as `Authorization: Bearer <token>`. When it holds more than one
project, the tools take a `project` argument, as on the cloud.

## Tools

Every tool is read-only. "Every host" means the Node add-on, the .NET add-on, the hub, and the cloud.

| Tool | What it answers | Arguments | Hosts |
|---|---|---|---|
| `get_overview` | "How is everything doing?" Requests, error rate, and average duration against the window before, every service's status, traffic, errors, and p95, the top errors, and the biggest insights. | `range` (1h, 6h, 24h, 7d) | Node, hub, cloud |
| `get_timeseries` | "How did traffic, errors, and latency change over time?" Exact requests, errors, error rate, average, and p95 per bucket, for everything, one service, or one endpoint. | `range` (1h to 30d) or `from` and `to`, `service`, `endpoint`, `buckets` (16, 24, 48) | Node, hub, cloud |
| `group_requests` | "Which endpoints are busiest, failing most, or slowest?" Count, errors, error rate, average, and p95 per endpoint, sorted as you ask. | `range` or `from` and `to`, `service`, `sort` (requests, errors, errorRate, p95, avg), `limit`, `minRequests` | Node, hub, cloud |
| `list_problems` | "Is anything wrong right now, and why?" Services and endpoints above their normal error rate, p95, or traffic, grouped into problems, each with a suspected cause: a new release, a new error, a query, or a service further down the calls. | `range` (1h, 6h, 24h, 7d) | Node, hub, cloud |
| `get_page` | "Show me the Database page", "What did user 42 run into?" One of 21 dashboard pages, with the numbers the dashboard shows: overview, services, service, endpoint, requests, traces, errors, error, database, query, insights, security, logs, log-patterns, rendering, route, traffic, problems, uptime, users, and user. | `page`, `params` (the page's filters), `range` | Node, hub, cloud |
| `list_traces` | "What happened recently? Anything slow or failing?" Traces, newest first, from the whole store. | `limit`, `minDurationMs`, `status` (unset, ok, error), `q` (a search), `range` | Every host |
| `get_trace` | "Show me everything that happened in this request, across services." Every span and log line, redacted. | `traceId`, `federate` (default true) | Every host |
| `get_errors` | "What broke, and where?" Errors and exceptions with their stack traces, newest first. | `limit`, `range` | Every host |
| `find_slow_queries` | "Which queries are slow?" The slowest database calls over a threshold, with their SQL. | `thresholdMs`, `limit`, `range` | Every host |
| `find_n_plus_one` | "Where are my N+1 queries and N+1 HTTP calls?" Grouped by query or call shape, the most time first. | `minRepeats`, `limit`, `range` (.NET: `minRepeats`) | Every host |
| `find_security_issues` | "What security risks does real traffic show?" [OWASP Top 10:2025](/docs/security/) risks grouped by kind, the most severe first, each with an example trace. | `severity` (error, warning, info), `limit`, `range` | Every host |
| `search` | "Find requests, traces, spans, or logs that match this." The same [search language](/docs/search/) as the dashboard, with the tags on each result. | `q`, `kind` (requests, traces, spans, logs), `range`, `limit`, `cursor` | Every host |
| `search_fields` | "What can I search on?" The search fields, the attribute keys seen in the data, or the common values of one field. | `field`, `prefix`, `range` | Every host |
| `list_tags` | "Which tags does this project have?" Built-in and custom [tags](/docs/tags/), each a name for a search. Use `tag:name` in any search. | none | Every host |
| `list_metrics` | "Which metrics are there?" CPU, memory, GC, request rates, and your own metrics, with the newest value of each. | `range`, `service`, `q` (.NET: `q`) | Every host |
| `get_metric` | "How is CPU, memory, or my own counter doing?" One metric's newest, lowest, highest, and average values per line. | `name`, `range`, `service`, `group`, `stat` (p50, p95, p99, avg) (.NET: `name`) | Every host |
| `get_alerts` | "Which alerts are firing?" Rules, what each watches, its state, and the newest events. Channel secrets are left out. | none | Hub, cloud |
| `list_projects` | "Which projects can I read?" Their ids and names, for the `project` argument. | none | Hub, when it holds more than one project; cloud, when you may read more than one |

`range` is 15m, 1h, 6h, 24h (the default), 7d, or 30d unless the table says otherwise.

On the Node add-on, the page tools (`get_overview`, `get_timeseries`, `group_requests`, `list_problems`, and `get_page`)
read the traces the app keeps. The metric tools read its own runtime and app metrics, 15 minutes or an hour of them, and
are there unless `captureMetrics` is off. The .NET add-on has `list_traces`, `get_trace`, `get_errors`,
`find_slow_queries`, `find_n_plus_one`, `find_security_issues`, `search`, `search_fields`, `list_tags`, `list_metrics`,
and `get_metric`. `get_alerts` is on the hub and the cloud.

On a host with several projects, every tool takes a `project` argument: its id or name, from `list_projects`. On the cloud,
leave it out to read every project together; `get_overview`, `get_timeseries`, `group_requests`, and `list_problems`
without it cover every project on the hub too.

## Guardrails

- **Off by default** on your own machine, and only there when WizeLens itself is on. In the cloud, nothing reads until you
  allow an app or make a read key.
- **Read-only.** No tool can change anything.
- **Redacted.** Values for keys like `authorization`, `cookie`, `password`, `token`, `secret`, and `connectionstring` are
  replaced with `[redacted]` before they are stored, so an agent never sees them.
- **Audited.** Every tool call writes an audit line to the app log. In the cloud, it goes to the audit log with the key,
  or the person and the app, that made it.
