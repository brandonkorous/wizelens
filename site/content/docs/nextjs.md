---
title: Next.js
description: Two files and no route file. Each request is one trace, named by its route, with Next.js's own steps inside it.
---

Works with the App Router or Pages, under `next dev` or `next start`.

## Install

```bash
npm install @wizeworks/lens-node
```

## instrumentation.ts

Put this file at the app root:

```ts
import type { Instrumentation } from "next";

export async function register() {
  // The runtime check must wrap the import, so the Edge build leaves the package out.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerWizeLens } = await import("@wizeworks/lens-node/next");
    registerWizeLens({ serviceName: "web" });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onRequestError } = await import("@wizeworks/lens-node/next");
    onRequestError(...args);
  }
};
```

## next.config.mjs

```js
const nextConfig = {
  serverExternalPackages: ["@wizeworks/lens-node"],
};

export default nextConfig;
```

After you add or update the package, delete `.next` once.

## What you get

- The dashboard on the Next.js port at `/_wizelens`.
- One trace per request, named by its route (`GET /items/[id]`), with render, route handler, and fetch steps inside it.
- Server errors from `onRequestError`.
- Static files, hot reload, and the dev overlay are left out.

`registerWizeLens(options)` takes the same options as `createWizeLens`, plus `ignore(path)` to skip paths you do not want.

## With the browser

Add [`@wizeworks/lens-react`](/docs/react/) to your root layout. Because the page's own server runs WizeLens, the page load
joins the server's trace: the server sends its trace id in `Server-Timing`, and the browser's page-load spans go to that server.

## Databases

Use the same one-line adapters as any Node app (`instrumentPg`, Prisma, Drizzle, and more). See [Node](/docs/node/#databases).
