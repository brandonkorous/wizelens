# @wizeworks/lens-vue

[WizeLens](https://github.com/wizeworksllc/wizelens) for Vue 3 apps: a plugin on top of
[@wizeworks/lens-browser](https://github.com/wizeworksllc/wizelens/tree/main/js/packages/browser) that links every `fetch` and `XMLHttpRequest` to its server trace, sends page views from
vue-router, and reports the errors Vue catches with the component that threw them.

## Install

```bash
npm install @wizeworks/lens-vue
```

```ts
// main.ts
import { createApp } from "vue";
import { WizeLens } from "@wizeworks/lens-vue";
import App from "./App.vue";
import { router } from "./router";

createApp(App)
  .use(router)
  .use(WizeLens, { endpoint: "/_wizelens", router, enabled: import.meta.env.DEV })
  .mount("#app");
```

Vue 3 and vue-router 4. The package does not import `vue`, so it adds nothing to your bundle beyond WizeLens itself.

## What it does

- Starts WizeLens on the page: every `fetch` and `XMLHttpRequest` gets a `traceparent` header, and page views, Web Vitals, browser
  errors, and `console` lines are sent.
- Sets `app.config.errorHandler`, and keeps the handler your app already had (it still runs). Each error carries `vue.component`,
  `vue.component.trail` ("App > Cart > PriceLine"), and Vue's `vue.info`.
- With `router`, each finished navigation is a page view. Failed or cancelled navigations are not.
- Shows the in-page HUD (see below).

## Options

All [@wizeworks/lens-browser options](https://github.com/wizeworksllc/wizelens/tree/main/js/packages/browser#options), plus:

| Option | Description |
|---|---|
| `router` | Your vue-router instance. |
| `lens` | An instance from `initWizeLens` to use instead of starting one. |
| `hud` | The in-page HUD: `true`, `false`, or `"auto"` (default). |
| `slowMs` | The HUD shows requests at or over this many ms as "warning". Default `500`. |

## The HUD

The same HUD as every WizeLens browser package: the last request, its server trace, errors, and links into the dashboard, in a
`<wizelens-hud>` element with its own shadow root, so your CSS cannot reach it.

- `"auto"` (default) asks `{endpoint}/api/info` once and shows the HUD when the server's read API answers, as in development. A
  send-only server shows nothing.
- `true` shows it and reads traces back from the server.
- `false` shows nothing and reads nothing back.

```ts
app.use(WizeLens, { endpoint: "/_wizelens", router, hud: true, slowMs: 800 });
```

When a .NET or Node add-on puts its HUD script into the pages it serves in development, the plugin takes over from it: one HUD and one
capture per page.

## In components

```ts
import { inject } from "vue";
import { WIZELENS_KEY, type WizeLensInstance } from "@wizeworks/lens-vue";

const lens = inject(WIZELENS_KEY) as WizeLensInstance;
lens.setUser(user.id);
```

`this.$wizelens` works in the Options API.

MIT licensed.
