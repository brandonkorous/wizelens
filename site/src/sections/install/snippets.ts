export type Snippet = { id: string; label: string; file: string; note: string; code: string };

export const SNIPPETS: Snippet[] = [
  {
    id: "dotnet",
    label: "ASP.NET Core",
    file: "Program.cs",
    note: "Two lines. Add WizeLens.EntityFrameworkCore and one call for EF Core queries.",
    code: `using WizeLens;

builder.Services.AddWizeLens();
builder.Services.AddDbContext<AppDb>(o =>
    o.UseSqlServer(cs).UseWizeLens());

var app = builder.Build();
app.UseWizeLens();`,
  },
  {
    id: "node",
    label: "Node",
    file: "server.ts",
    note: "Express, Fastify, Koa, Hono, or node:http. One line per database driver.",
    code: `import express from "express";
import pg from "pg";
import { createWizeLens, instrumentPg } from "@wizeworks/lens-node";

const wizelens = createWizeLens({ serviceName: "orders-api" });
instrumentPg(wizelens, pg);

const app = express();
app.use(wizelens.middleware);`,
  },
  {
    id: "react",
    label: "React",
    file: "main.tsx",
    note: "Every fetch carries a traceparent, so each server trace links back to its click.",
    code: `import "@wizeworks/lens-react/install";
import { WizeLensProvider } from "@wizeworks/lens-react";

root.render(
  <WizeLensProvider endpoint="/_wizelens" enabled={import.meta.env.DEV}>
    <App />
  </WizeLensProvider>
);`,
  },
  {
    id: "next",
    label: "Next.js",
    file: "instrumentation.ts",
    note: "App Router or Pages. Each request is one trace, named by its route.",
    code: `export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerWizeLens } = await import("@wizeworks/lens-node/next");
    registerWizeLens({ serviceName: "web" });
  }
}`,
  },
  {
    id: "hub",
    label: "Local hub",
    file: "terminal",
    note: "One place for every service, kept for 7 days. Any language can send OpenTelemetry to it.",
    code: `# start the hub
npx @wizeworks/lens-hub

# point each service at it
WIZELENS_HUB=http://localhost:5960`,
  },
];
