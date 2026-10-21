---
title: Vue, Angular, Svelte, and plain JS
description: Links every fetch and XHR call to its server trace, and sends page views, Web Vitals, errors, and console lines from any web app.
---

Not on React? The browser side of WizeLens works on any page. `@wizeworks/lens-browser` does the work; the Vue, Angular, and Svelte
packages are small layers on top that hook your framework's errors and router. None of them import the framework itself.

## What it does

- Every `fetch` and `XMLHttpRequest` gets a `traceparent` header, so each server trace links back to the click that caused it.
- Page views with TTFB, SSR, FCP, LCP, INP, and CLS, plus slow and oversized images.
- Browser errors and unhandled rejections, and browser `console` lines (at most 500 per page), each in its page view's trace.
  Minified stacks map back to your source with [source maps](/docs/source-maps/).
- A 5xx the server marks with `X-WizeLens-Expected` is not a failed call. See
  [Answers you expect](/docs/dashboard/#answers-you-expect).

React adds per-component render stats and [the HUD](/docs/hud/); see [React](/docs/react/).

## Plain JS

One script tag, no build step:

```html
<script src="https://cdn.jsdelivr.net/npm/@wizeworks/lens-browser/dist/wizelens.iife.js" data-endpoint="/_wizelens"></script>
```

It starts on its own and sets `window.WizeLens`. More attributes:

| Attribute | What it does |
|---|---|
| `data-release="1.4.0"` | Your app's version. |
| `data-enabled="false"` | Load it without starting. |
| `data-console="false"` | Do not copy `console` lines. |
| `data-xhr="false"` | Do not trace `XMLHttpRequest` calls. |

With a bundler:

```bash
npm install @wizeworks/lens-browser
```

```ts
import { initWizeLens } from "@wizeworks/lens-browser";

const lens = initWizeLens({ endpoint: "/_wizelens", enabled: import.meta.env.DEV });

lens.setUser(user.id, { name: user.name }); // enduser.id and user.full_name on every browser span
lens.captureError(err);          // an error you caught
lens.pageView("/orders/7");      // a route change your router makes without the History API
```

## Vue

```bash
npm install @wizeworks/lens-vue
```

```ts
// main.ts
import { WizeLens } from "@wizeworks/lens-vue";

createApp(App)
  .use(router)
  .use(WizeLens, { endpoint: "/_wizelens", router, enabled: import.meta.env.DEV })
  .mount("#app");
```

Errors Vue catches are sent with the component that threw (`vue.component`, and `vue.component.trail` such as
"App > Cart > PriceLine"). An `errorHandler` your app already had still runs. With `router`, each finished navigation is a page view.

## Angular

```bash
npm install @wizeworks/lens-angular
```

```ts
// app.config.ts
import { ApplicationConfig, ErrorHandler, inject, isDevMode, provideAppInitializer } from "@angular/core";
import { provideRouter, Router } from "@angular/router";
import { createWizeLensErrorHandler, initWizeLens, trackAngularRouter } from "@wizeworks/lens-angular";

const lens = initWizeLens({ endpoint: "/_wizelens", enabled: isDevMode() });

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    { provide: ErrorHandler, useValue: createWizeLensErrorHandler(lens) },
    provideAppInitializer(() => void trackAngularRouter(inject(Router), lens)),
  ],
};
```

The error handler sends each error, unwrapping promise rejections that zone.js wraps, then logs it like Angular's own.
`trackAngularRouter` records each `NavigationEnd` as a page view. Before Angular 19, call `trackAngularRouter(router)` from your root
component's constructor. `HttpClient` calls are traced with or without `withFetch()`.

## Svelte and SvelteKit

```bash
npm install @wizeworks/lens-svelte
```

```ts
// src/hooks.client.ts
import { dev } from "$app/environment";
import { createHandleError, initWizeLens } from "@wizeworks/lens-svelte";

initWizeLens({ endpoint: "/_wizelens", enabled: dev });

export const handleError = createHandleError(({ message }) => ({ message }));
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { afterNavigate } from "$app/navigation";
  import { trackSvelteKitNavigation } from "@wizeworks/lens-svelte";

  trackSvelteKitNavigation(afterNavigate);
</script>
```

Client errors carry their route id (`sveltekit.route`). When your SvelteKit server runs [`@wizeworks/lens-node`](/docs/node/), the first
page load joins the server's trace of that page.

Plain Svelte: call `initWizeLens(...)` and then `trackNavigation()` in `main.ts`, or `trackNavigation({ mode: "hash" })` for
svelte-spa-router.

## Options

| Option | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `release` | from the build plugin | Your app's version, kept on browser spans for release markers and [source maps](/docs/source-maps/). |
| `user` | none | The signed-in user, sent as `enduser.id`. |
| `userName` | none | The signed-in user's display name, sent as `user.full_name` for the Users page. |
| `capturePages` | `true` | Send page views and browser errors. |
| `captureConsole` | `true` | Copy browser `console` calls into the page view's trace. |
| `captureXhr` | `true` | Trace `XMLHttpRequest` calls too. |
| `resolveFrames` | `true` | Read the page's own source maps (dev servers serve them) so errors group by your source. |
| `flushIntervalMs` | `1000` | How often browser spans are sent, in ms. |
| `readServer` | `false` | Read traces back from the server after each call. Leave it off with a send-only server. |
| `serverStatsDelayMs` | `400` | With `readServer`, how long to wait after a response before reading its server stats. |
| `maxRecent` | `30` | How many recent requests `lens.recorder` keeps. |

The Vue plugin also takes `router` (a vue-router instance: each finished navigation is a page view) and `lens` (use a
running instance instead of starting one).

## Where `endpoint` points

`endpoint` is where your API serves WizeLens, as for [React](/docs/react/#where-endpoint-points). With a dev proxy, proxy
`/_wizelens` to your API too. For an API on another origin, pass `propagateTo: (url) => url.origin === "https://api.example.com"` and
let that API accept the `traceparent` header in its CORS settings.
