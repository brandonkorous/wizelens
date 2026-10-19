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
charts, `get_timeseries` gives exact requests, errors, and p95 per hour (or any bucket), and `group_requests` gives the same
per endpoint. Both count every request, not a sample.

### What a connected app gets

- **Read only.** The only permission is `wizelens:read`. No tool can change anything.
- **Only what you picked.** One organization, and the projects you chose. "All projects" also covers projects made later.
- **Until you end it.** The access token lasts an hour and the app renews it on its own (the refresh token lasts 30 days
  and renews on each use). Remove an app any time under **Account → Connected apps**. Admins see and remove everyone's
  apps under **Team → Connected apps**. Leaving the organization ends it too.
- **Audited.** The audit log shows who connected which app, and every tool call with the person and the app.

### Read keys (scripts and CI)

For a script, a CI job, or an agent with no person to sign in, make a **read key** under **Team → API keys** and send it
as a header:

```json
{
  "mcpServers": {
    "wizelens": { "type": "http", "url": "https://mcp.wizelens.com", "headers": { "Authorization": "Bearer wl_rk_..." } }
  }
}
```

A key for one project reads that project. A key for several adds `list_projects`, and every tool takes a `project`
argument (its id or name). `?project=<id>` on the address fixes one project.

### Your own cloud

Sign-in for MCP clients works out of the box at `<public-url>/_wizelens/mcp`. To give MCP its own name, as
`mcp.wizelens.com` does, start the cloud with `--mcp-url https://mcp.example.com`, and have your proxy send `/` and
`/mcp` to `/_wizelens/mcp`, and `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server/*`
as they are. People still sign in at the public URL.

## On your own machine

Turn MCP on per service:

```csharp
builder.Services.AddWizeLens(o => o.EnableMcp = true);
```

```ts
createWizeLens({ serviceName: "orders-api", enableMcp: true });
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
When the hub runs with `--token`, send that token as `Authorization: Bearer <token>`.

## Tools

| Tool | What it answers |
|---|---|
| `get_overview` | "How is everything doing?" Requests, error rate, and duration against the window before, every service's health, the top errors, and the biggest insights. Hub and cloud. |
| `get_timeseries` | "How did traffic, errors, and latency change over time?" Exact counts per bucket, for everything, one service, or one endpoint, over a range or a custom window. Hub and cloud. |
| `group_requests` | "Which endpoints are busiest, failing most, or slowest?" Count, errors, error rate, and p95 per endpoint, sorted as you ask. Hub and cloud. |
| `list_traces` | "What happened recently? Anything slow or failing?" |
| `get_trace` | "Show me everything that happened in this request, across services." |
| `get_errors` | "What broke, and where?" |
| `find_slow_queries` | "Which queries are slow?" |
| `find_n_plus_one` | "Where are my N+1 queries and N+1 HTTP calls?" |
| `search`, `search_fields` | "Find requests, traces, spans, or logs that match this." Same search language as the dashboard. |
| `list_metrics`, `get_metric` | "How is CPU, memory, or my own counter doing?" |
| `list_projects` | "Which projects can I read?" Cloud, when you may read more than one. |

## Guardrails

- **Off by default** on your own machine, and only there when WizeLens itself is on. In the cloud, nothing reads until you
  allow an app or make a read key.
- **Read-only.** No tool can change anything.
- **Redacted.** Values for keys like `authorization`, `cookie`, `password`, `token`, `secret`, and `connectionstring` are
  replaced with `[redacted]` before they are stored, so an agent never sees them.
- **Audited.** Every tool call writes an audit line to the app log. In the cloud, it goes to the audit log with the key,
  or the person and the app, that made it.
