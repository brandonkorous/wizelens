# The HUD on every stack

Today the in-page HUD lives in `@wizeworks/lens-react` only. Vue, Angular, Svelte, the script tag, and pages that a .NET or
Node server renders have no HUD. WizeLens rebuilds Glimpse, and Glimpse was a HUD on server-rendered pages, so every stack
gets the same HUD.

## The decision

One HUD, written once with no framework, as a web component in `@wizeworks/lens-browser`. Every browser package shows it,
and the .NET and Node add-ons put it on the HTML pages they serve in development, with no code in the page.

## Contract

**The element.** `lens-browser` defines `<wizelens-hud>` (custom element, open Shadow DOM, styles inside the shadow root so
the page's CSS cannot reach it). `mountHud(recorder, { slowMs })` adds it to `document.body` and returns an unmount
function. It looks and works like the React HUD did: the same card, details panel (errors, insights, and security risks
apart), settings panel, minimized aperture, hover tips, links into the dashboard, Esc to close, and the same
`localStorage` keys (`wizelens.hud.panel`, `wizelens.hud.live`, `wizelens.hud.min`), so a setting survives a move from
the React HUD.

**The `hud` option.** `boolean | "auto"` on `initWizeLens` (and so on Vue, Angular, Svelte, and the script tag).

| Value | Means |
|---|---|
| `true` | Show the HUD, and read traces back from the server. |
| `false` | No HUD and no reads: works with a send-only server. |
| `"auto"` | Ask `GET {endpoint}/api/info` once. Show the HUD when it answers 200 (the server's read API is on, as in development); stay hidden otherwise. |

Default: `"auto"` in `lens-browser`, Vue, Angular, and Svelte. React keeps `hud` default `true` (its documented behavior),
and its `<Hud>` component now mounts the shared element. `readServer` follows the HUD unless it is set.

**The script tag.** `data-hud="true|false|auto"` (default `auto`) and `data-slow-ms`. A tag that a server put in the page
also has `data-source="inject"`.

**One instance per page.** Every started browser instance registers at `globalThis[Symbol.for("wizelens.browser")]` as
`{ source: "app" | "inject", stop(): Promise<void> }`.
- An injected script starts after the page's `load` event (at once when the page has loaded), and does nothing when an
  instance is already registered.
- An app instance that starts while an injected one runs stops the injected one (capture and HUD) and takes over.

**Serving the script.** The Node and .NET add-ons serve the `lens-browser` script-tag bundle at `GET {base}/wizelens.js`
(and `{base}/wizelens.js.map`), where `{base}` is the dashboard path (default `/_wizelens`), only while they serve the
dashboard.

**Injecting it.** While the add-on serves the dashboard and its `hud` option is on (Node `hud`, .NET `Hud`, both default
true; `WIZELENS_HUD=false` turns it off), a response gets
`<script src="{base}/wizelens.js" data-endpoint="{base}" data-hud="true" data-source="inject" defer></script>` right
before its last `</body>` when all of these hold:
- the request is a `GET`, and the answer is `200`, `4xx` or `5xx` (an error page wants the HUD most) with
  `Content-Type: text/html`;
- the answer has no `Content-Encoding` (a compressed body is left alone);
- the path is not under `{base}`;
- the body has a `</body>` (fragments, such as htmx partials, are left alone).

The body streams through: a small tail is held so a `</body>` split over two chunks is still found, and `Content-Length`
is dropped from an answer that gets the tag.

## Phases

1. **The shared HUD** in `lens-browser`: the element, `mountHud`, the `hud` option, the script tag attributes, the
   instance registry, and tests.
2. **React** mounts the shared element; its own HUD components go. Public API unchanged (`WizeLensProvider`, `hud`,
   `slowMs`, `Hud`, `HudProps`).
3. **Vue, Angular, and Svelte** pass `hud` and `slowMs` through, with docs.
4. **Node add-on**: serves the bundle and injects it, `hud` option and `WIZELENS_HUD`, tests.
5. **.NET add-on**: embeds and serves the bundle and injects it, `Hud` option and `WIZELENS_HUD`, tests.
6. **Docs, site, samples, and changelog**: the HUD docs say every stack; a server-rendered page in a sample.
