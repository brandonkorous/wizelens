# WizeLens

See inside every request, across every service, from the React click down to the SQL query.
A modern successor to Glimpse, built on OpenTelemetry, with opt-in MCP access for AI agents.

> Status: phase 1 (in-app add-on). See [docs/PLAN.md](docs/PLAN.md) and [docs/CONTRACT.md](docs/CONTRACT.md).

## Add it to an app

**ASP.NET Core (.NET 10)**

```csharp
builder.Services.AddWizeLens();
app.UseWizeLens();
```

EF Core: `options.UseSqlite(cs).UseWizeLens();` (package `WizeLens.EntityFrameworkCore`).

**Node (Express)**

```js
import { createWizeLens } from "@wizeworks/lens-node";
const wizelens = createWizeLens({ serviceName: "orders-api" });
app.use(wizelens.middleware);
```

**React**

```tsx
<WizeLensProvider endpoint="/_wizelens">
  <App />
</WizeLensProvider>
```

Open `/_wizelens` on any service to see the dashboard.

## Run the sample

Needs .NET 10 SDK, Node 24, pnpm 10.

```bash
pnpm install
pnpm build                                   # builds the JS packages and the dashboard UI
dotnet run --project samples/gateway-api     # http://localhost:5100
pnpm dev:orders                              # http://localhost:5200
pnpm dev:web                                 # http://localhost:5173
```

Then open http://localhost:5173, click the buttons, and open http://localhost:5173/_wizelens/.

## AI access (MCP)

Off by default. When on, each service exposes a read-only MCP server at `/_wizelens/mcp`
with tools like `list_traces`, `get_trace`, `find_slow_queries`, `find_n_plus_one`, and `get_errors`.
Secrets are redacted before any agent sees them.

## License

MIT for the add-ons. See [LICENSE](LICENSE).
