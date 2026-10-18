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
- Browser errors and browser `console` lines (at most 500 per page), each in its page view's trace.
- [The HUD](/docs/hud/) in the corner of your page.

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
| `hud` | `true` | Show the in-page HUD. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `slowMs` | `500` | Requests at or over this many ms show as "warning" (orange). |
| `capturePages` | `true` | Send page views, React render stats, and browser errors. |
| `captureConsole` | `true` | Copy browser `console` calls into the page view's trace. |

## Hooks

`useWizeLens()` and `useWizeLensRequests()` give your own components the same data the HUD reads.
