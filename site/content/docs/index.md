---
title: Introduction
description: WizeLens shows you what one request did, from the click in React to the SQL in your database, across every service.
---

WizeLens is the spirit of Glimpse, rebuilt for how we build today. You add a small package to each app. Then every request
becomes one trace: the browser, every service it touched, every database call, every log line, and the render. In .NET
and Node, a dashboard at `/_wizelens` shows it, and a small HUD in the corner of your page shows the latest request as
you work, on pages your server renders and in React, Vue, Angular, Svelte, and plain JS. Java, Python, and Go services send to [the hub](/docs/hub/) or [the cloud](/docs/cloud/) through
OpenTelemetry, and Vue, Angular, Svelte, and plain JS pages link each click to its server trace.

It finds the common problems for you: N+1 queries and HTTP calls, duplicate and slow queries, database waits, errors,
render problems, security risks from the OWASP Top 10, and services running above their normal.

## What you get

- **One timeline per request.** The click, the API, each service after it, each query, and the render.
- **A dashboard on every service.** Overview, Problems, Search, Requests, Traces, Errors, Logs, Database, Rendering,
  Metrics, Services, Insights, Security, and Users in every app. The hub and the cloud add Hosts, Kubernetes, Alerts,
  Uptime, SLOs, and Dashboards. See [The dashboard](/docs/dashboard/).
- **The HUD on your page.** The latest request's timing, queries, and insights in the corner of every web app. Pages a
  .NET or Node app renders get it in development with no code. See [The HUD](/docs/hud/).
- **Insights.** Problems ranked, with a short note on how to fix them.
- **AI access, only if you allow it.** A read-only MCP endpoint your own agent can use. There is no AI inside WizeLens.
- **Safe by default.** On in development only. Passwords, tokens, and keys are redacted before anything is stored.

## How it works

1. **Capture.** Each service records OpenTelemetry-shaped spans: requests, HTTP calls, database calls, logs, and exceptions.
2. **Link.** The W3C `traceparent` header carries one trace id from the browser through every hop.
3. **Discover.** Each response says where its WizeLens lives (`X-WizeLens-Endpoint`), so callers learn about downstream services by themselves.
4. **Federate.** When you open a trace, the service you are looking at pulls the matching pieces from every downstream service and merges them into one timeline. There is no collector to run.
5. **Analyze.** The same rules run in .NET, in Node, and on the hub and the cloud for OpenTelemetry services (Java,
   Python, Go), so every service gives the same answer.

## Three ways to run it

| Where it runs | Where the data lives | For |
|---|---|---|
| **In your app** | A small SQLite file per service: the newest 2,000 traces or 24 hours | One developer, one machine |
| **[The local hub](/docs/hub/)** | One SQLite file for every service, 7 days | A whole system on your machine or team network |
| **[WizeLens Cloud](/docs/cloud/)** | Postgres, and ClickHouse at scale: 14, 30, or 90 days by plan (up to 400 on Enterprise), 30 by default when you host it | A team, with accounts, alerts, and share links |

The add-ons, the hub, and the cloud are MIT licensed. All three are in alpha.

## Next

Start with the [quick start](/docs/quick-start/). It takes about five minutes.
