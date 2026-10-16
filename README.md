<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/wizelens-dark.svg">
  <img src="docs/images/wizelens-light.svg" alt="WizeLens" width="440">
</picture>

### Inspect. Understand. Build better.

See inside every request — from the React click down to the SQL query, across every service.

The spirit of **Glimpse**, rebuilt for 2026: OpenTelemetry-native, microservice-aware, and readable by AI agents (only when you allow it).

[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb.svg)](LICENSE)
[![.NET 10](https://img.shields.io/badge/.NET-10-512bd4.svg)](https://dotnet.microsoft.com/)
[![Node 22.13+](https://img.shields.io/badge/node-%E2%89%A522.13-3c873a.svg)](https://nodejs.org/)
[![React 18+](https://img.shields.io/badge/react-%E2%89%A518-149eca.svg)](https://react.dev/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-native-f5a800.svg)](https://opentelemetry.io/)
[![MCP](https://img.shields.io/badge/MCP-read--only-14141f.svg)](https://modelcontextprotocol.io/)
![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)

[Quick start](#quick-start) · [Features](#features) · [How it works](#how-it-works) · [AI access](#ai-access) · [Configuration](#configuration) · [Roadmap](#roadmap)

</div>

---

<p align="center">
  <img src="docs/images/overview.jpg" alt="WizeLens dashboard overview: request counts, timing breakdown, services, recent requests, and insights" width="900">
</p>

<p align="center"><sub>One click in React → a .NET gateway → a Node API → two databases. One trace. Every N+1 problem found for you.</sub></p>

## ✨ Why WizeLens?

Glimpse showed us what a request *really* did — and then the ecosystem moved on without a replacement.
Modern apps are worse to debug, not better: a single click fans out across a front end, a gateway, a handful of services, and several data stores.

WizeLens brings back the "open the hood on this request" experience and makes it work for how we build today:

- **Drop-in.** Two lines in .NET, one middleware in Node, one provider in React.
- **End to end.** The browser, every service, and every database call land in **one** timeline.
- **Opinionated insights.** N+1 queries, N+1 HTTP calls, duplicate queries, slow queries, and errors are flagged automatically.
- **Built on open standards.** W3C `traceparent` and OpenTelemetry semantic conventions — no proprietary agent.
- **AI-ready, not AI-bundled.** No built-in AI. Agents get a read-only, redacted MCP endpoint — only if you turn it on.
- **Safe by default.** On in Development only. Secrets are redacted before anything is stored.

<a id="quick-start"></a>

## 🚀 Quick start

> **Alpha:** packages are not on NuGet / npm yet. Use project references, or run the sample below.

### ASP.NET Core (.NET 10)

```csharp
using WizeLens;

builder.Services.AddWizeLens();   // capture, store, dashboard, API
// ...
app.UseWizeLens();                // call early in the pipeline
```

Using EF Core? Add the adapter (`WizeLens.EntityFrameworkCore`):

```csharp
using WizeLens.EntityFrameworkCore;

builder.Services.AddDbContext<AppDb>(o => o.UseSqlServer(cs).UseWizeLens());
```

Using Dapper or raw ADO.NET? Wrap the connection — every command is captured, with any provider:

```csharp
using WizeLens.Data;

await using var db = new ProfiledDbConnection(new SqlConnection(cs));
var rows = await db.QueryAsync<Order>("SELECT * FROM Orders WHERE CustomerId = @id", new { id });
```

### Node (Express)

```ts
import express from "express";
import { createWizeLens } from "@wizeworks/lens-node";

const wizelens = createWizeLens({ serviceName: "orders-api" });
const app = express();

app.use(wizelens.middleware);            // traces requests + serves /_wizelens
// ...your routes...
app.use(wizelens.errorMiddleware);       // ELMAH-style error capture

// Any database, any driver: wrap the call.
const rows = wizelens.traceDb({ system: "postgresql", adapter: "pg" }, sql, params,
  () => pool.query(sql, params));
```

Outgoing `fetch` calls are traced automatically.

### React

```tsx
// main.tsx: this import must come first, before React loads.
import "@wizeworks/lens-react/install";
import { WizeLensProvider } from "@wizeworks/lens-react";

<WizeLensProvider endpoint="/_wizelens" enabled={import.meta.env.DEV}>
  <App />
</WizeLensProvider>
```

Every `fetch` gets a `traceparent` header, so each server trace links back to the click that caused it.
The `install` import lets WizeLens time React renders per component and measure hydration. Without it, everything else still works.

### Open the dashboard

Browse to **`/_wizelens`** on any service. That's it.

<a id="features"></a>

## 🔭 Features

### The in-page HUD

A small card in the corner of every page shows the latest request as you work: **Total**, **Server**, **Database**, and **Render** time, one bar that splits them, and the SQL, fetch, and insight counts.

- **One color tells you the state.** 🔵 info · 🟢 fast, no issues · 🟡 completed, but with optimizations · 🟠 slow or a 4xx · 🔴 failed · ⚪ no data.
- **Hover for a quick peek.** Database shows each query's time, the slowest, and the average. Server splits its own code, its own queries, and calls to other services.
- **Click for a closer look.** A small panel shows the split, the first rows of the timeline, the top insights, and this page's Web Vitals.
- **Everything else is one click away.** Every "view all" link and every footer count opens the full dashboard in a new tab, right on that request's timeline, SQL, HTTP calls, or insights.
- **Render time is real.** WizeLens measures from the response to the next paint: read the body, run your code, render, paint.
- **Stays out of the way.** Minimize it to the aperture mark; its center dot keeps the health color. Pin a request, or follow the newest one live. It survives page refreshes.

<p align="center"><img src="docs/images/hud.png" alt="WizeLens HUD card with Total, Server, Database and Render, and the details panel open" width="640"></p>

### The dashboard

Ten pages, one look. Pick a time range in the top bar; every number compares itself with the range before it.

| Page | What you get |
|---|---|
| **Overview** | Requests, duration, SQL, error rate, and insights at a glance; request activity, timing breakdown, services, recent requests, latest insights |
| **Requests** | Filter by method, status, duration, service, or text; export to CSV; a side panel with summary, headers, response, tags, and timing |
| **Traces** | One request as layers — browser, network, routing, handler, each service, each database, render — plus bottlenecks and the slowest spans |
| **Database** | Slow queries over time, time per operation, top slow queries, table hotspots |
| **Rendering** | Render time per route, SSR, hydration, image loading, layout shift, and the React components that render too often |
| **Errors** | Exceptions over time, top types, errors by service, and the stack trace and request context of each one — browser errors too |
| **Logs** | Every log line from every service, filtered by level, service, or text |
| **Services** | Health of each service, database, and outside host, and a map of who calls whom |
| **Insights** | Every N+1, duplicate query, slow query, and render problem, ranked, with how to fix it |
| **Settings** | How each connected service is set up, and your dashboard preferences |

Open any trace for the full detail: timeline, SQL, HTTP, logs, and errors. Search everything with **Ctrl K** (**⌘ K**). Light and dark themes are built in.

<p align="center"><img src="docs/images/traces.jpg" alt="Traces page: one request as layers across browser, gateway, orders API, and two databases" width="900"></p>

<details>
<summary><b>More screens</b></summary>

<p align="center"><img src="docs/images/requests.jpg" alt="Requests page with filters and the request side panel" width="900"></p>
<p align="center"><img src="docs/images/database.jpg" alt="Database page with slow queries, operations, and table hotspots" width="900"></p>
<p align="center"><img src="docs/images/rendering.jpg" alt="Rendering page with routes, render phases, and component hotspots" width="900"></p>
<p align="center"><img src="docs/images/errors.jpg" alt="Errors page with exception details and stack trace" width="900"></p>

</details>

### What gets captured

| | ASP.NET Core | Node |
|---|---|---|
| Incoming requests | ✅ hosting activity | ✅ middleware |
| Outgoing HTTP | ✅ `HttpClient` | ✅ `fetch` / undici |
| Database (driver level) | ✅ `ProfiledDbConnection` — ADO.NET, Dapper, any provider | ✅ `traceDb()` — any driver |
| Database (ORM) | ✅ EF Core | 🔜 Prisma, Drizzle, TypeORM |
| Logs | ✅ `ILogger` | ✅ `wizelens.logger` |
| Exceptions | ✅ | ✅ |
| Request details | ✅ headers, client IP, user, request id, body sizes, tags | ✅ same; user and tags through `setUser()` / `tag()` |
| Response bodies (opt-in) | ✅ `CaptureResponseBody` | ✅ `captureResponseBody` |
| Routing and handler time | ✅ | 🔜 |
| Browser | ✅ via `@wizeworks/lens-react`: fetch spans, render time, page views (TTFB, SSR, FCP, LCP, INP, CLS), hydration, slow images, React component renders, browser errors | |

### Persistence

Traces survive restarts (hello, `dotnet watch`). Each app keeps a small SQLite file at `.wizelens/traces.db` — the newest 2,000 traces or 24 hours, whichever comes first. If the file can't be written, WizeLens logs one warning and keeps working in memory. It never breaks your app.

<a id="how-it-works"></a>

## 🧭 How it works

```mermaid
flowchart LR
    subgraph Browser
        R["React app<br/>+ WizeLensProvider"]
    end
    subgraph gw[".NET gateway"]
        G["UseWizeLens()"]
        GS[(".wizelens/traces.db")]
    end
    subgraph orders["Node orders API"]
        O["wizelens.middleware"]
        OS[(".wizelens/traces.db")]
    end
    DB1[(SQL)]
    DB2[(SQL)]
    AI["AI agent<br/>(MCP client)"]

    R -- "fetch + traceparent" --> G
    G -- "HttpClient + traceparent" --> O
    G --> DB1
    O --> DB2
    O -. "X-WizeLens-Endpoint" .-> G
    G --- GS
    O --- OS
    R -. "browser spans" .-> G
    AI -. "read-only MCP" .-> G
```

1. **Capture.** Each service records OpenTelemetry-shaped spans: requests, HTTP calls, database calls, logs, and exceptions.
2. **Link.** The W3C `traceparent` header carries one trace id from the browser through every hop.
3. **Discover.** Each response says where its WizeLens lives (`X-WizeLens-Endpoint`), so callers learn about downstream services automatically.
4. **Federate.** When you open a trace, the service you're looking at pulls the matching pieces from every downstream service and merges them into one timeline. No collector to run.
5. **Analyze.** The same rules run in .NET and JS, so the insights match no matter which service you open.

The full wire format — headers, endpoints, types, storage schema, and analysis rules — is in **[docs/CONTRACT.md](docs/CONTRACT.md)**. Any language can implement it.

<a id="ai-access"></a>

## 🤖 AI access (MCP)

WizeLens has no AI of its own. Instead, your AI tools can *read* what WizeLens sees — with your permission.

Turn it on per service:

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

| Tool | What it answers |
|---|---|
| `list_traces` | "What happened recently? Anything slow or failing?" |
| `get_trace` | "Show me everything that happened in this request, across services." |
| `find_slow_queries` | "Which queries are slow?" |
| `find_n_plus_one` | "Where are my N+1 queries and N+1 HTTP calls?" |
| `get_errors` | "What broke, and where?" |

Guardrails:

- **Off by default**, and only available when WizeLens itself is enabled.
- **Read-only.** No tool can change anything.
- **Redacted.** Values for keys like `authorization`, `cookie`, `password`, `token`, `secret`, and `connectionstring` are replaced with `[redacted]` before they are stored — so an agent never sees them.
- **Audited.** Every tool call writes an audit line to the app log.

<a id="configuration"></a>

## ⚙️ Configuration

### .NET — `AddWizeLens(o => { ... })`

| Option | Default | Description |
|---|---|---|
| `Enabled` | Development only | Turn WizeLens on or off. |
| `BasePath` | `/_wizelens` | Where the dashboard and API live. |
| `ServiceName` | app name | Name shown for this service. |
| `Storage` | `Sqlite` | `Sqlite` (survives restarts) or `Memory`. |
| `StoragePath` | `.wizelens/traces.db` | SQLite file, relative to the content root. |
| `MaxTraces` | `2000` | Traces kept in memory and on disk. |
| `MaxAge` | `24h` | Traces older than this are dropped. |
| `EnableMcp` | `false` | Expose the read-only MCP endpoint at `{BasePath}/mcp`. |
| `RedactKeys` | see above | Key fragments whose values are redacted. |
| `NPlusOneThreshold` | `5` | Repeats in one trace that count as N+1. |
| `SlowQueryMs` | `100` | Queries at or above this are slow. |
| `CaptureResponseBody` | `false` | Keep the first 16 KB of text and JSON responses. |

Tag a request from anywhere in it: `WizeLensRequest.Tag("cache", "hit")`. The user comes from `HttpContext.User`.

### Node — `createWizeLens({ ... })`

| Option | Default | Description |
|---|---|---|
| `serviceName` | *(required)* | Name shown for this service. |
| `enabled` | on unless `NODE_ENV=production` | Turn WizeLens on or off. |
| `basePath` | `/_wizelens` | Where the dashboard and API live. |
| `storage` | `"sqlite"` | `"sqlite"` or `"memory"`. |
| `storagePath` | `{cwd}/.wizelens/traces.db` | SQLite file. |
| `maxTraces` / `maxAgeMs` | `2000` / 24 h | Retention. |
| `enableMcp` | `false` | Expose the read-only MCP endpoint. |
| `redactKeys` | see above | Key fragments whose values are redacted. |
| `instrumentFetch` | `true` | Trace outgoing `fetch` / undici calls. |
| `publicEndpoint` | auto | Override `X-WizeLens-Endpoint` (useful behind proxies). |
| `audit` | `console.info` | Where MCP audit lines go. |
| `slowQueryMs` / `nPlusOneThreshold` | `100` / `5` | Analysis thresholds. |
| `captureResponseBody` | `false` | Keep the first 16 KB of text and JSON responses. |

Tag a request and name its user from your handlers: `wizelens.tag("cache", "hit")`, `wizelens.setUser(id)`.

### React — `<WizeLensProvider>`

| Prop | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). |
| `hud` | `true` | Show the in-page HUD. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `slowMs` | `500` | The HUD shows requests at or over this many ms as "warning" (orange). |
| `capturePages` | `true` | Send page views, React render stats, and browser errors. |

Hooks: `useWizeLens()` and `useWizeLensRequests()`.

## 🧪 Run the sample

A React shop → a .NET gateway (EF Core + SQLite) → a Node orders API (`node:sqlite`). The gateway has a deliberate N+1 so you have something to find.

**Needs:** .NET 10 SDK, Node 22.13+ (24 recommended), pnpm 10.

```bash
pnpm install
pnpm build                                   # JS packages + the dashboard UI
dotnet run --project samples/gateway-api     # http://localhost:5100
pnpm dev:orders                              # http://localhost:5200
pnpm dev:web                                 # http://localhost:5173
```

Open http://localhost:5173, click the buttons, then open http://localhost:5173/_wizelens/.

> The .NET add-on embeds the dashboard at build time. After `pnpm build`, rebuild the .NET app to pick up UI changes.

## 📦 Packages

| Package | Platform | What it is |
|---|---|---|
| `WizeLens.AspNetCore` | NuGet | The ASP.NET Core add-on |
| `WizeLens.EntityFrameworkCore` | NuGet | EF Core adapter |
| `@wizeworks/lens-node` | npm | The Node add-on |
| `@wizeworks/lens-react` | npm | Browser tracing + HUD |
| `@wizeworks/lens-core` | npm | Shared types, trace context, analysis |
| `@wizeworks/lens-ui` | npm | The dashboard (served by both add-ons) |

<a id="roadmap"></a>

## 🗺️ Roadmap

| Phase | Shape | Status |
|---|---|---|
| **1. In-app add-on** | A package inside each app, with local SQLite and federation across services | ✅ Alpha |
| **2. Local hub** | One small service on your machine or network; every app sends to it | 🔜 Next |
| **3. Cloud** | Hosted, team-wide history, alerts, and sharing | 🔭 Planned |

Coming up in phase 1.x: more ORM adapters (Prisma, Drizzle, TypeORM, `pg`), routing time for Node, gRPC and message queues (RabbitMQ, Kafka, Azure Service Bus), and more languages.

See **[docs/PLAN.md](docs/PLAN.md)** for the full plan.

## 🛠️ Development

```text
docs/                 PLAN.md, CONTRACT.md, images
dotnet/               WizeLens.slnx — src/ (add-ons), tests/
js/packages/          core · node · react · ui
samples/              web (React) · gateway-api (.NET) · orders-api (Node)
```

```bash
pnpm build && pnpm test                      # JS: build + tests
pnpm check:size                              # size rules, JS and .NET
dotnet build dotnet/WizeLens.slnx            # .NET: build
dotnet test  dotnet/WizeLens.slnx            # .NET: tests
```

Code rules, checked by `pnpm check:size`: at most 250 lines per file, 50 lines per function, and one line per comment. Every CSS class and variable starts with `wl-`.

Changing the wire format? Update **[docs/CONTRACT.md](docs/CONTRACT.md)** first — both add-ons and the dashboard follow it.

## 🙏 Inspired by

[Glimpse](https://github.com/Glimpse/Glimpse) — the original "see inside the request" tool for ASP.NET.
[MiniProfiler](https://miniprofiler.com/) — fast, focused timing.
[ELMAH](https://elmah.github.io/) — error logging done right.

WizeLens is an independent project and is not affiliated with any of them.

## 📄 License

The add-ons are [MIT licensed](LICENSE). © 2026 WizeWorks.
