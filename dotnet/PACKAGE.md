# WizeLens for .NET

See inside every request: the timeline, every database call, outgoing HTTP and gRPC call, message, log line, and exception, across all your services, with a dashboard at `/_wizelens`. A modern Glimpse.

```csharp
builder.Services.AddWizeLens();
var app = builder.Build();
app.UseWizeLens();
```

- **Databases:** EF Core (`WizeLens.EntityFrameworkCore`), Npgsql, MySqlConnector, and Microsoft.Data.SqlClient with no code, and any ADO.NET provider or Dapper through `ProfiledDbConnection`.
- **gRPC and messaging:** Grpc.AspNetCore, Grpc.Net.Client, RabbitMQ.Client, Azure Service Bus, MassTransit, and Kafka (`WizeLens.Kafka`).
- **Insights:** N+1 queries and HTTP calls, duplicate and slow queries, errors.
- **AI access:** an opt-in, read-only, redacted MCP endpoint.

On in Development only. Full docs: https://github.com/brandonkorous/wizelens

MIT licensed.
