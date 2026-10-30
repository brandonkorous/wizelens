# @wizeworks/lens-browser

Browser side of [WizeLens](https://github.com/wizeworksllc/wizelens) for any web page, with no framework: links every `fetch` and
`XMLHttpRequest` call to its server trace, and sends page views, Web Vitals, browser errors, and `console` lines to the WizeLens add-on
on your API. It also shows the in-page HUD.

Using a framework? [Vue](https://github.com/wizeworksllc/wizelens/tree/main/js/packages/vue), [Angular](https://github.com/wizeworksllc/wizelens/tree/main/js/packages/angular), and [Svelte](https://github.com/wizeworksllc/wizelens/tree/main/js/packages/svelte) have small packages on top of this one, and
[React](https://github.com/wizeworksllc/wizelens/tree/main/js/packages/react) adds render stats. All of them show the same HUD.

## Install

```bash
npm install @wizeworks/lens-browser
```

```ts
// main.ts: run this before your app's first request.
import { initWizeLens } from "@wizeworks/lens-browser";

const lens = initWizeLens({ endpoint: "/_wizelens", enabled: import.meta.env.DEV });
```

## Script tag

No build step: load the bundle and give it the endpoint. It starts on its own and sets `window.WizeLens`.

```html
<script src="https://cdn.jsdelivr.net/npm/@wizeworks/lens-browser/dist/wizelens.iife.js" data-endpoint="/_wizelens"></script>
```

| Attribute | Description |
|---|---|
| `data-endpoint` | WizeLens base path or URL on your API. Starts WizeLens when present. |
| `data-release` | Your app's version. |
| `data-enabled="false"` | Load but do not start. |
| `data-console="false"` | Do not copy `console` calls. |
| `data-xhr="false"` | Do not trace `XMLHttpRequest`. |
| `data-hud` | `true`, `false`, or `auto` (default). See [The HUD](#the-hud). |
| `data-slow-ms` | The HUD shows requests at or over this many ms as "warning". Default `500`. |
| `data-source="inject"` | Set by a server that put the tag in the page. The tag waits for the page's `load` and stands aside for an app's own instance. |

Without `data-endpoint`, start it yourself: `WizeLens.initWizeLens({ endpoint: "/_wizelens" })`. An ES module build is at
`@wizeworks/lens-browser/script` (`dist/wizelens.js`).

## Options

| Option | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). Off returns an instance that does nothing. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `release` | from the build plugin | The web app's version, kept on browser spans so stacks find the right source maps. |
| `user` | none | The signed-in user, sent as `enduser.id` on every browser span. |
| `capturePages` | `true` | Send page views and browser errors. |
| `captureConsole` | `true` | Copy `console` calls into the page view's trace (at most 500 per page). |
| `captureXhr` | `true` | Trace `XMLHttpRequest` calls too (Angular's HttpClient, axios). |
| `resolveFrames` | `true` | Read the page's own source maps (dev servers serve them) so errors group by your source. |
| `hud` | `"auto"` | The in-page HUD: `true`, `false`, or `"auto"`. See [The HUD](#the-hud). |
| `slowMs` | `500` | The HUD shows requests at or over this many ms as "warning". |
| `readServer` | follows `hud` | Read traces back from the server, for the HUD. |

## The instance

`initWizeLens` returns the running instance. Calling it again returns the same one.

| Member | Description |
|---|---|
| `pageView(url?)` | Record a route change. History API changes are seen on their own; call this from a router in hash mode. A path that did not change is skipped. |
| `captureError(error, attributes?)` | Send an error you caught, in the current page view's trace. |
| `setUser(id)` | Put this user (`enduser.id`) on every browser span from now on. `null` clears it. |
| `flush()` | Send queued spans now. |
| `shutdown()` | Stop, send what is queued, and put `fetch` and `XMLHttpRequest` back. |
| `recorder` | The lower-level recorder (or `null` when off). |

Uncaught errors and unhandled promise rejections are sent without any call.

## The HUD

A small card in the corner of the page: the last request, its server trace (time in the database, queries, errors, and security
risks), page timings, and links into the dashboard. A details panel, a settings panel, and a minimized mark come off it, and Esc
closes a panel. It is the `<wizelens-hud>` custom element, with its styles inside an open shadow root so the page's CSS cannot reach
it, and it keeps its settings in `localStorage` (`wizelens.hud.panel`, `wizelens.hud.live`, `wizelens.hud.min`).

| `hud` | Means |
|---|---|
| `true` | Show the HUD, and read traces back from the server. |
| `false` | No HUD and no reads: works with a send-only server. |
| `"auto"` | Ask `GET {endpoint}/api/info` once. Show the HUD when it answers 200 with JSON (the server's read API is on, as in development); stay hidden otherwise. |

To show it for a recorder of your own, `mountHud(recorder, { slowMs })` adds the element to the page and returns a function that takes
it away. `defineHud()` defines the element without adding one.

## One instance per page

Each running instance registers on the page, whichever copy of this package started it. The .NET and Node
add-ons put a script tag with `data-source="inject"` into the HTML pages they serve in development, so server-rendered pages get the
HUD with no code. That script does nothing when the app already started WizeLens, and an app that starts later stops it and takes
over, so a page never has two HUDs or traces a call twice.

## Cross-origin APIs

Same-origin calls get a `traceparent` header by default. For an API on another origin, pass
`propagateTo: (url) => url.origin === "https://api.example.com"` and let that API accept the `traceparent` request header in its CORS
settings. The add-on's own endpoint already allows cross-origin posts.

MIT licensed.
