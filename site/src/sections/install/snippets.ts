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
    id: "vue",
    label: "Vue",
    file: "main.ts",
    note: "One plugin. Route changes are page views, and component errors name the component.",
    code: `import { WizeLens } from "@wizeworks/lens-vue";

createApp(App)
  .use(router)
  .use(WizeLens, { endpoint: "/_wizelens", router })
  .mount("#app");`,
  },
  {
    id: "angular",
    label: "Angular",
    file: "app.config.ts",
    note: "An ErrorHandler and a router tracker. HttpClient calls link to their server traces.",
    code: `const lens = initWizeLens({ endpoint: "/_wizelens" });

providers: [
  { provide: ErrorHandler, useValue: createWizeLensErrorHandler(lens) },
  provideAppInitializer(() => trackAngularRouter(inject(Router), lens)),
]`,
  },
  {
    id: "svelte",
    label: "Svelte",
    file: "hooks.client.ts",
    note: "SvelteKit or plain Svelte. Client errors carry their route.",
    code: `import { dev } from "$app/environment";
import { createHandleError, initWizeLens } from "@wizeworks/lens-svelte";

initWizeLens({ endpoint: "/_wizelens", enabled: dev });
export const handleError = createHandleError();`,
  },
  {
    id: "js",
    label: "Plain JS",
    file: "index.html",
    note: "Any page, no build step. Every fetch and XHR call links to its server trace.",
    code: `<script
  src="https://cdn.jsdelivr.net/npm/@wizeworks/lens-browser/dist/wizelens.iife.js"
  data-endpoint="/_wizelens">
</script>`,
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
