---
title: AI access (MCP)
description: WizeLens has no AI of its own. Your AI tools can read what it sees, read-only, only when you turn it on.
---

## Turn it on

Per service:

```csharp
builder.Services.AddWizeLens(o => o.EnableMcp = true);
```

```ts
createWizeLens({ serviceName: "orders-api", enableMcp: true });
```

Then point any MCP client at the streamable HTTP endpoint:

```json
{
  "mcpServers": {
    "wizelens-gateway": { "type": "http", "url": "http://localhost:5100/_wizelens/mcp" }
  }
}
```

## On the hub and the cloud

- **Hub:** start it with `--mcp`. One endpoint, `http://localhost:5960/_wizelens/mcp`, covers every service.
- **Cloud:** make a **read key** on the Team page for the projects the agent may see, and send it as
  `Authorization: Bearer wl_rk_...` to `/_wizelens/mcp`. A key for one project reads that project. A key for several
  adds `list_projects`, and every tool takes a `project` argument (its id or name). `?project=` fixes one project instead.

## Tools

| Tool | What it answers |
|---|---|
| `list_traces` | "What happened recently? Anything slow or failing?" |
| `get_trace` | "Show me everything that happened in this request, across services." |
| `find_slow_queries` | "Which queries are slow?" |
| `find_n_plus_one` | "Where are my N+1 queries and N+1 HTTP calls?" |
| `get_errors` | "What broke, and where?" |
| `list_metrics`, `get_metric` | "How is CPU, memory, or my own counter doing?" |

## Guardrails

- **Off by default,** and only there when WizeLens itself is on.
- **Read-only.** No tool can change anything.
- **Redacted.** Values for keys like `authorization`, `cookie`, `password`, `token`, `secret`, and `connectionstring` are
  replaced with `[redacted]` before they are stored, so an agent never sees them.
- **Audited.** Every tool call writes an audit line to the app log. In the cloud, it goes to the audit log with the key that made it.
