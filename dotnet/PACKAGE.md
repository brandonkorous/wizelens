# WizeLens for .NET

See inside every request: the timeline, every database call, outgoing HTTP and gRPC call, message, log line, and exception, across all your services, with a dashboard at `/_wizelens`. A modern Glimpse.

```csharp
builder.Services.AddWizeLens();
var app = builder.Build();
app.UseWizeLens();
```

- **Databases:** EF Core (`WizeLens.EntityFrameworkCore`), Npgsql, MySqlConnector, and Microsoft.Data.SqlClient with no code, and any ADO.NET provider or Dapper through `ProfiledDbConnection`.
- **Redis, MongoDB, Elasticsearch:** `WizeLens.Redis` (`multiplexer.UseWizeLens()`), `WizeLens.MongoDB` (`settings.UseWizeLens()`), and `WizeLens.Elasticsearch` (`services.AddWizeLensElasticsearch()`). Keys and paths keep their shape with ids as `?`; values and bodies are never stored.
- **gRPC and messaging:** Grpc.AspNetCore, Grpc.Net.Client, RabbitMQ.Client, Azure Service Bus, MassTransit, and Kafka (`WizeLens.Kafka`).
- **Logs:** every `ILogger` line, plus Serilog (`WizeLens.Serilog`: `.WriteTo.WizeLens()`) and NLog (`WizeLens.NLog`: the `WizeLens` target), each in the trace of the request that wrote it. Browser console lines from `@wizeworks/lens-react` too.
- **Metrics:** every meter in the app with no code: the .NET runtime (CPU, memory, GC, thread pool), ASP.NET Core (request duration, Kestrel), HttpClient, and your own `Meter`s. Taken every 10 seconds and kept for 1 hour in memory; sent to the hub too. Options: `CaptureMetrics`, `MetricsInterval`, `MetricsMaxAge`.
- **HUD:** while the dashboard is served, the app's HTML pages (Razor Pages, MVC views, static `.html`) get the in-page HUD with no page code, with or without response compression. `Hud = false` or `WIZELENS_HUD=false` turns it off.
- **Insights:** N+1 queries and HTTP calls, duplicate and slow queries, errors.
- **AI access:** an opt-in, read-only, redacted MCP endpoint.

On in Development only. Full docs: https://github.com/wizeworksllc/wizelens

MIT licensed.
