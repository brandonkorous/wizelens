---
title: React
description: Links every fetch to its server trace, times renders and page loads, and shows the HUD on your page.
---

## Install

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

React 18 or newer. The `install` import lets WizeLens time React renders per component and measure hydration. Without it,
everything else still works.

## What it does

- Every `fetch` gets a `traceparent` header, so each server trace links back to the click that caused it.
- Render time is real: from the response to the next paint, so it counts reading the body, your code, the render, and the paint.
- Page views with TTFB, SSR, FCP, LCP, INP, and CLS, plus hydration, slow images, and React components that render too often.
- Browser errors and browser `console` lines (at most 500 per page), each in its page view's trace. Minified stacks map back to
  your source with [source maps](/docs/source-maps/).
- [The HUD](/docs/hud/) in the corner of your page: the same HUD every stack shows.

![The HUD card in the corner of a page](/shots/hud-card.png)

## Where `endpoint` points

`endpoint` is where your API serves WizeLens. With a dev proxy (Vite or Next.js rewrites), proxy `/_wizelens` to your API too:

```ts
// vite.config.ts
export default defineConfig({
  server: { proxy: { "/api": "http://localhost:5100", "/_wizelens": "http://localhost:5100" } },
});
```

When the page's own server runs WizeLens (Next.js, or any add-on that renders HTML), the page load joins that server's trace.
Calls answered by another WizeLens server on the page's origin work the same way, so the HUD reads each request from the server that holds it.

## Props

| Prop | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). |
| `hud` | `true` | Show the in-page HUD. `false` also stops reading traces back, for a send-only server. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `release` | from the build plugin | The web app's version, kept on browser spans for release markers and version compares, and so stacks find the right [source maps](/docs/source-maps/). |
| `slowMs` | `500` | Requests at or over this many ms show as "warning" (orange). |
| `capturePages` | `true` | Send page views, React render stats, and browser errors. |
| `captureConsole` | `true` | Copy browser `console` calls into the page view's trace. |
| `resolveFrames` | `true` | Read the page's own source maps (dev servers serve them) so errors group by your source. |
| `user` | none | The signed-in user, sent as `enduser.id` on every browser span. The Users page then counts the requests this page makes, also to an API in another project. |
| `userName` | none | The signed-in user's display name, sent as `user.full_name`. |

## The signed-in user

Render `WizeLensUser` where the page knows who is signed in. It can sit anywhere under the root, not only next to the
provider:

```tsx
import { WizeLensUser } from "@wizeworks/lens-react";

<WizeLensUser id={session.user.id} name={session.user.name} />
```

`WizeLensUser` runs in the browser. In Next.js, render it from a client component, or re-export it from a file that starts
with `"use client"`. A server component then passes the session's user to it as props:

```tsx
// app/signed-in-user.tsx
"use client";
export { WizeLensUser } from "@wizeworks/lens-react";
```

```tsx
// app/layout.tsx (a server component)
import { WizeLensUser } from "./signed-in-user";

<WizeLensUser id={session.user.id} name={session.user.name} />
```

Every browser span then carries `enduser.id` and `user.full_name`, and the Users page counts the requests the page makes,
also the ones that go to an API in another project. It clears the user when it unmounts. The provider's `user` and
`userName` props do the same from the root.

## Hooks

`useWizeLensRecorder()` and `useWizeLensRequests()` give your own components the same data the HUD reads.
