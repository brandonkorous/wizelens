---
title: Quick start
description: From nothing to your first trace in about five minutes. Pick the parts that match your stack.
---

The .NET and Node add-ons are on in development only. In production they do nothing until you turn them on, and then
they only send: see [Production](/docs/production/).

> **Alpha:** the packages are prereleases on NuGet and npm. Expect changes between versions.

> **No server?** A static site (Vite, Astro, a Next.js export, plain HTML on a CDN) needs one script tag and a browser
> key from the cloud. See [Static sites](/docs/browser/#static-sites).

## 1. Add it to your API

### ASP.NET Core (.NET 8, 9 or 10)

```bash
dotnet add package WizeLens.AspNetCore --prerelease
```

```csharp
using WizeLens;

builder.Services.AddWizeLens();   // capture, store, dashboard, API
var app = builder.Build();
app.UseWizeLens();                // early in the pipeline
```

### Node

```bash
npm install @wizeworks/lens-node
```

```ts
import express from "express";
import { createWizeLens } from "@wizeworks/lens-node";

const wizelens = createWizeLens({ service: "orders-api" });
const app = express();

app.use(wizelens.middleware);        // first
// ...your routes...
app.use(wizelens.errorMiddleware);   // last
```

On Fastify, Koa, Hono, NestJS, or Next.js, see the [Node](/docs/node/) and [Next.js](/docs/nextjs/) pages.

### Java, Python, and Go

They send to [the hub](/docs/hub/) or [WizeLens Cloud](/docs/cloud/) through OpenTelemetry with WizeLens defaults. See
[Java](/docs/java/), [Python](/docs/python/), and [Go](/docs/go/).

## 2. Add your database

One line, and every query is traced. For example:

```csharp
builder.Services.AddDbContext<AppDb>(o => o.UseSqlServer(cs).UseWizeLens());   // EF Core
```

```ts
import pg from "pg";
import { instrumentPg } from "@wizeworks/lens-node";

instrumentPg(wizelens, pg);
```

Every other driver and ORM is on the [ASP.NET Core](/docs/aspnet-core/) and [Node](/docs/node/) pages.

## 3. Add the browser (optional)

Pages your .NET or Node app renders, such as Razor Pages, MVC views, or Express templates, need nothing here: in
development the add-on puts the browser script and [the HUD](/docs/hud/) on them by itself.

For a React app:

```bash
npm install @wizeworks/lens-react
```

```tsx
// main.tsx: this import must come first, before React loads.
import "@wizeworks/lens-react/install";
import { WizeLensProvider } from "@wizeworks/lens-react";

<WizeLensProvider endpoint="/_wizelens" enabled={import.meta.env.DEV}>
  <App />
</WizeLensProvider>
```

Now each server trace starts at the click that caused it, and the HUD shows in the corner of your page. Vue, Angular,
Svelte, and plain JS show the same HUD: see [Vue, Angular, Svelte, and plain JS](/docs/browser/).

## 4. Open the dashboard

Run your app and browse to **`/_wizelens`** on any service. That is it.

## Next

- Several services? Install WizeLens in each one. They find each other: see [Several services](/docs/several-services/).
- Want every service in one place? Start [the local hub](/docs/hub/).
- Something missing? See [Troubleshooting](/docs/troubleshooting/).
