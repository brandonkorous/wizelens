---
title: The HUD
description: A small card in the corner of your page that shows the page you are on and every call it makes, in every web app.
---

The HUD is a small card in the corner of your page. Like Glimpse, it shows the page you are on, such as `GET /orders`,
and adds up every call the page makes: **Total** and **Render** time of the page load, **Server** and **Database** time
of the page and all its calls, one bar that splits them, and the SQL, fetch, and insight counts. Calls that load panels
or poll a status add to the counts. They never take the page's place, so the card holds still.

It works in every web app: pages your .NET or Node app renders, and React, Vue, Angular, Svelte, and plain JS. It is one
element, `<wizelens-hud>`, with its styles in its own shadow root, so your page's CSS never reaches it.

![The HUD card on a page that ran 17 queries and found 3 insights](/shots/hud-card.png)

## On pages your server renders

The .NET and Node add-ons put the HUD on the HTML pages your app serves. There is no code to add and no browser package
to install. Razor Pages, MVC views, and static `.html` files get it, and so do pages from Express, Fastify, Koa, Hono,
NestJS, and plain `node:http`. Next.js pages are React: add [`WizeLensProvider`](/docs/react/).

It shows while the add-on serves the dashboard, so in development by default. A send-only add-on in production leaves
your pages as they are.

The add-on serves the browser script at `/_wizelens/wizelens.js` and adds one tag before the last `</body>` of a page:

```html
<script src="/_wizelens/wizelens.js" data-endpoint="/_wizelens" data-hud="true" data-source="inject" defer></script>
```

A page gets the tag when all of these hold:

- the request is a `GET`, outside `/_wizelens`;
- the answer is `200` with `Content-Type: text/html`, and no `Content-Encoding`;
- the body has a `</body>`.

JSON, scripts, images, and fragments such as htmx partials are left alone. The page still streams. Its `Content-Length`
is dropped or set to the new length, since the tag makes the page longer.

## Compressed pages

A compressed page cannot take the tag. So a page load (a request whose `Accept` asks for `text/html`) reaches your app
without `Accept-Encoding`, and a compression layer sends that page as plain HTML. Scripts, JSON, and other files stay
compressed.

- **.NET.** With `app.UseResponseCompression()` before `app.UseWizeLens()`, the page gets the tag and is still compressed.
  After it, page loads come back plain.
- **Node.** `compression()`, `@fastify/compress`, `koa-compress`, and `hono/compress` send page loads plain.
- A body your app compresses itself, with its own `Content-Encoding`, gets no HUD.

This happens only while the HUD is on. With it off, `Accept-Encoding` is left alone.

## In your web app

**React.** `WizeLensProvider` shows the HUD. Its `hud` prop is `true` by default. See [React](/docs/react/).

**Vue, Angular, Svelte, and plain JS.** The `hud` option:

| Value | Means |
|---|---|
| `"auto"` (default) | Ask `GET {endpoint}/api/info` once. Show the HUD when it answers, as it does while the server serves the dashboard. Stay hidden when it does not, as with a send-only server. |
| `true` | Show the HUD, and read traces back from the server. |
| `false` | No HUD, and no reads. Works with a send-only server. |

```ts
initWizeLens({ endpoint: "/_wizelens", hud: true, slowMs: 800 });
```

```ts
app.use(WizeLens, { endpoint: "/_wizelens", router, hud: false }); // Vue
```

`readServer` follows `hud` unless you set it. See [Vue, Angular, Svelte, and plain JS](/docs/browser/).

**The script tag.** `data-hud="auto"` (the default), `"true"`, or `"false"`, and `data-slow-ms`:

```html
<script src="https://cdn.jsdelivr.net/npm/@wizeworks/lens-browser/dist/wizelens.iife.js"
  data-endpoint="/_wizelens" data-hud="true" data-slow-ms="800"></script>
```

## One HUD per page

A page has one WizeLens and one HUD. The script a server put in the page waits for the page's `load` event, and does
nothing when your app already started WizeLens. When your app starts WizeLens after it, your app's instance takes over:
the injected one stops, and your options apply. So a page never shows two HUDs.

## One color tells you the state

| Color | Means |
|---|---|
| Blue | Information |
| Green | Fast, no issues |
| Amber | It worked, but there is something to improve |
| Orange | Slow, a 4xx answer, or a 5xx you [marked as expected](/docs/dashboard/#answers-you-expect) |
| Red | It failed |
| Gray | No data |

The card takes the worst color of the page and its calls. A page load or a call at or over `slowMs` (default 500 ms)
shows as orange.

## What the numbers cover

| Number | Covers |
|---|---|
| Total | The page load: navigation start to the first paint. After a route change: the change to the end of the calls that loaded the new page. Calls the page repeats, like a status poll, do not count. |
| Server, Database | The server time and query time of the page and all its calls, added up. The hover tip says how many calls. |
| Render | The page load: the response to the first paint. After a route change: the change to the next paint. |
| SQL | Queries of the page and all its calls. |
| Fetch | Calls the page made: `fetch` and `XMLHttpRequest`, any method. |
| Insights, Errors | Of the page and all its calls. |

A client-side route change (`history.pushState`, the back and forward buttons) starts a new page. A new query string on
the same path does not.

## Look closer

- **Hover** a number for a quick look. Database shows each query's time, the slowest, and the average. Server splits its own
  code, its own queries, and calls to other services.
- **Click** for a small panel: the split; the errors, insights, and security risks of the calls that have them (the
  top three of each), first, so you see what to fix; every call the page made on one timeline with its query count;
  and this page's Web Vitals. New calls land at the bottom as they happen. Click a call to open its trace in the dashboard. The page's
  time stays at the top and its Web Vitals at the bottom; only the calls scroll. "Page load" is the card's Total.
- **Every "view all" link** and the SQL and insight counts open the full dashboard in a new tab, on the page's own
  trace.
- **Esc** closes the panel.

![The HUD panel open on a page of the sample shop, with the timeline and two N+1 insights](/shots/hud-panel.jpg)

## Stay out of the way

- Minimize it to the aperture mark. Its center dot keeps the health color.
- Live follows the page you are on. The pause button holds what you see: new calls and pages wait until you press
  play.
- **Settings** (the gear) turns Live on or off, shows the `slowMs` in effect, the endpoint, and the session, clears
  the page's calls, and opens the dashboard.
- It remembers its state across page refreshes.

## Turn it off

| Where | How |
|---|---|
| Pages a Node app renders | `createWizeLens({ serviceName: "web", hud: false })` |
| Pages a .NET app renders | `builder.Services.AddWizeLens(o => o.Hud = false)` |
| Either add-on, no code | `WIZELENS_HUD=false` |
| React | `<WizeLensProvider hud={false}>` |
| Vue, Angular, Svelte, plain JS | `hud: false` |
| Script tag | `data-hud="false"` |

Off in the add-on, pages are served exactly as your app wrote them. Off in the browser, WizeLens still traces each call,
page load, and error. It just shows no card and reads nothing back.
