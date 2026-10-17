---
title: Introduction
description: WizeLens shows you what one request did, from the click in React to the SQL in your database, across every service.
---

WizeLens is the spirit of Glimpse, rebuilt for how we build today. You add a small package to each app. Then every request
becomes one trace: the browser, every service it touched, every database call, every log line, and the render. A dashboard
at `/_wizelens` shows it, and a small HUD in the corner of your page shows the latest request as you work.

It finds the common problems for you: N+1 queries, N+1 HTTP calls, duplicate queries, slow queries, and errors.

## What you get

- **One timeline per request.** The click, the API, each service after it, each query, and the render.
- **A dashboard on every service.** Ten pages: overview, requests, traces, database, rendering, errors, logs, metrics, services, and insights.
- **Insights.** Problems ranked, with a short note on how to fix them.
- **AI access, only if you allow it.** A read-only MCP endpoint your own agent can use. There is no AI inside WizeLens.
- **Safe by default.** On in development only. Passwords, tokens, and keys are redacted before anything is stored.

## How it works

1. **Capture.** Each service records OpenTelemetry-shaped spans: requests, HTTP calls, database calls, logs, and exceptions.
2. **Link.** The W3C `traceparent` header carries one trace id from the browser through every hop.
3. **Discover.** Each response says where its WizeLens lives (`X-WizeLens-Endpoint`), so callers learn about downstream services by themselves.
4. **Federate.** When you open a trace, the service you are looking at pulls the matching pieces from every downstream service and merges them into one timeline. There is no collector to run.
5. **Analyze.** The same rules run in .NET and in Node, so every service gives the same answer.

## Three ways to run it

| | Where the data lives | For |
|---|---|---|
| **In your app** | A small SQLite file per service: the newest 2,000 traces or 24 hours | One developer, one machine |
| **[The local hub](/docs/hub/)** | One SQLite file for every service, 7 days | A whole system on your machine or team network |
| **[WizeLens Cloud](/docs/cloud/)** | Postgres, 7 and 30 days, computed on the server | A team, with accounts, alerts, and share links |

The add-ons and the hub are MIT licensed. All three are in alpha.

## Next

Start with the [quick start](/docs/quick-start/). It takes about five minutes.
