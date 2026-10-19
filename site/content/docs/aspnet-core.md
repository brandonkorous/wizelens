---
title: ASP.NET Core
description: Two lines in Program.cs. Databases, gRPC, messaging, logs, and metrics follow with little or no code.
---

## Install

```bash
dotnet add package WizeLens.AspNetCore --prerelease
```

```csharp
using WizeLens;

builder.Services.AddWizeLens();   // capture, store, dashboard, API
var app = builder.Build();
app.UseWizeLens();                // early in the pipeline
```

Open `https://localhost:<port>/_wizelens`. WizeLens targets .NET 10. No access to the code? A startup hook adds the same
with no code: see [Install with no code change](/docs/auto-install/).

## Databases

| You use | Do this |
|---|---|
| EF Core | `dotnet add package WizeLens.EntityFrameworkCore --prerelease`, then `options.UseSqlServer(cs).UseWizeLens()` |
| Npgsql, MySqlConnector, Microsoft.Data.SqlClient | Nothing. WizeLens listens to them. |
| Dapper, or any other ADO.NET provider | Wrap the connection: `new ProfiledDbConnection(new SqliteConnection(cs))` |
| Redis (StackExchange.Redis) | `dotnet add package WizeLens.Redis --prerelease`, then `ConnectionMultiplexer.Connect(cs).UseWizeLens()` |
| MongoDB (MongoDB.Driver 3) | `dotnet add package WizeLens.MongoDB --prerelease`, then `new MongoClient(MongoClientSettings.FromConnectionString(cs).UseWizeLens())` |
| Elasticsearch (Elastic.Clients.Elasticsearch 8.10+) | `dotnet add package WizeLens.Elasticsearch --prerelease`, then `builder.Services.AddWizeLensElasticsearch()` before `builder.Build()` |

```csharp
using WizeLens.EntityFrameworkCore;

builder.Services.AddDbContext<AppDb>(o => o.UseSqlServer(cs).UseWizeLens());
```

```csharp
using WizeLens.Data;

await using var db = new ProfiledDbConnection(new SqlConnection(cs));
var rows = await db.QueryAsync<Order>("SELECT * FROM Orders WHERE CustomerId = @id", new { id });
```

An ORM and the driver under it never count the same query twice.

Redis, MongoDB, and Elasticsearch calls join the trace of the request that sent them, so they show on the **Database** page
and in the N+1, duplicate, and slow query insights: `GET user:?`, `{"find":"orders","filter":{"customerId":?}}`, or
`GET /orders/_doc/?`. WizeLens never stores Redis values, MongoDB filter values, or Elasticsearch bodies; two reads with the
same values are found by a one-way fingerprint. Redis `MULTI`, `EXEC`, and `PING`, and MongoDB cursor batches (`getMore`), are
never N+1. The Elasticsearch HTTP call under each request is not counted twice. `WizeLens.Redis` uses the multiplexer's
profiler, so it replaces any other profiler on the same multiplexer. Calls outside a request are not recorded.

## gRPC and messaging

Captured with no extra code: Grpc.AspNetCore, Grpc.Net.Client, RabbitMQ.Client 7+, Azure Service Bus, and MassTransit.
For Kafka, add `WizeLens.Kafka` and use its produce and consume helpers. Messages carry the trace, so the consumer's work
joins the trace of the request that sent it.

## Logs

Every `ILogger` line written during a request goes into its trace. Serilog and NLog need one package:

- **Serilog** (`UseSerilog()` replaces the `ILogger` providers): `dotnet add package WizeLens.Serilog --prerelease`, then
  `.WriteTo.WizeLens()` in your logger setup. In appsettings: `"Using": ["WizeLens.Serilog"]` and `"WriteTo": [{ "Name": "WizeLens" }]`.
- **NLog:** `dotnet add package WizeLens.NLog --prerelease`, then `LogManager.Setup().SetupExtensions(e => e.RegisterWizeLens())`
  and a `<target xsi:type="WizeLens" name="wizelens"/>` in `nlog.config` (or `new WizeLensTarget()` in code).

A line is never stored twice, even when `ILogger` also writes to Serilog or NLog.

## Metrics

Every `Meter` is read with no code: the .NET runtime (CPU, memory, GC, thread pool), ASP.NET Core (request duration,
Kestrel), `HttpClient`, and your own meters. Taken every 10 seconds and kept for 1 hour in memory. They show on the
**Metrics** page and are sent to the hub too. Options: `CaptureMetrics`, `MetricsInterval`, `MetricsMaxAge`.

## Tags and users

Tag a request from anywhere inside it: `WizeLensRequest.Tag("cache", "hit")`. The user comes from `HttpContext.User`.

## Options

Pass options to `AddWizeLens(o => { ... })`. The full list is on [Configuration](/docs/configuration/#aspnet-core).

```csharp
builder.Services.AddWizeLens(o =>
{
    o.ServiceName = "gateway-api";
    o.SlowQueryMs = 50;
    o.EnableMcp = true;
});
```
