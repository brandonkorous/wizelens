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
    registerWizeLens({ service: "web" });
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

## Update WizeLens

An app that already has WizeLens needs no change to its two files. To move to a new release:

1. Read the [changelog](/changelog/) for the release, in case a setting changed.
2. Stop `next dev`.
3. Update the package, and the browser package if the app has one:

   ```bash
   npm install @wizeworks/lens-node@latest
   npm install @wizeworks/lens-react@latest
   ```

4. Delete the `.next` folder. Next.js keeps a built copy of the old package there, and the old copy can make every
   route answer 404.
5. Start `next dev` again, and open a page. `npm ls @wizeworks/lens-node` shows the version the app now uses.

## What you get

- The dashboard on the Next.js port at `/_wizelens`.
- One trace per request, named by its route (`GET /items/[id]`), with render, route handler, and fetch steps inside it.
- Server errors from `onRequestError`.
- Static files, hot reload, and the dev overlay are left out.

`registerWizeLens(options)` takes the same options as `createWizeLens`, plus `ignore(path)` to skip paths you do not want.
`ignore` replaces the default, so keep `nextIgnore` in it, or static files and hot reload are traced again:

```ts
// inside register(), in the nodejs branch
const { registerWizeLens, nextIgnore } = await import("@wizeworks/lens-node/next");
registerWizeLens({ service: "web", ignore: (p) => nextIgnore(p) || p === "/health" });
```

## Tags, users, and expected answers

`registerWizeLens` returns the instance. Anywhere else in server code, `currentWizeLens()` from `@wizeworks/lens-node/next`
gives you the same one:

```ts
import { currentWizeLens } from "@wizeworks/lens-node/next";

const wizelens = currentWizeLens();
wizelens?.setUser(session.user.id, { name: session.user.name });
wizelens?.tag("plan", "pro");
wizelens?.expected(); // a 503 you send on purpose is not a failure
```

They work in any server code that runs during a request, and do nothing outside one. See
[Node](/docs/node/#tags-and-users).

## With the browser

The root layout is a server component, so put [`@wizeworks/lens-react`](/docs/react/) in a client component and render that
from the layout:

```tsx
// app/providers.tsx
"use client";
import "@wizeworks/lens-react/install"; // first import: lets WizeLens see every React render
import type { ReactNode } from "react";
import { WizeLensProvider } from "@wizeworks/lens-react";

export function Providers({ children }: { children: ReactNode }) {
  return <WizeLensProvider endpoint="/_wizelens">{children}</WizeLensProvider>;
}
```

```tsx
// app/layout.tsx
import type { ReactNode } from "react";
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Because the page's own server runs WizeLens, the page load joins the server's trace: the server sends its trace id in
`Server-Timing`, and the browser's page-load spans go to that server.

## Source maps

For production browser stacks, wrap the config with `withWizeLensSourceMaps` from `@wizeworks/lens-cli/next` and keep
`serverExternalPackages` inside it. It turns on browser source maps, puts the release in the bundle, and uploads the maps
after `next build`:

```js
import { withWizeLensSourceMaps } from "@wizeworks/lens-cli/next";

export default withWizeLensSourceMaps({
  serverExternalPackages: ["@wizeworks/lens-node"],
});
```

See [Source maps](/docs/source-maps/).

## Databases

Use the same one-line adapters as any Node app (`instrumentPg`, Prisma, Drizzle, and more). See [Node](/docs/node/#databases).
