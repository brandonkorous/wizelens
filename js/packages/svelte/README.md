# @wizeworks/lens-svelte

[WizeLens](https://github.com/brandonkorous/wizelens) for Svelte and SvelteKit apps, on top of
[@wizeworks/lens-browser](https://github.com/brandonkorous/wizelens/tree/main/js/packages/browser): links every `fetch` and `XMLHttpRequest` to its server trace, and sends page views, Web Vitals,
browser errors, and `console` lines.

The package does not import `svelte` or `$app/*`; you pass SvelteKit's functions in.

## Install

```bash
npm install @wizeworks/lens-svelte
```

## SvelteKit

```ts
// src/hooks.client.ts
import { dev } from "$app/environment";
import { createHandleError, initWizeLens } from "@wizeworks/lens-svelte";

initWizeLens({ endpoint: "/_wizelens", enabled: dev });

export const handleError = createHandleError(({ error, message }) => ({ message }));
```

`createHandleError(next?, lensOrOptions?)` sends the error with its route id (`sveltekit.route`) and status, then runs `next`. Without
`next` it logs the error, as SvelteKit does. `handleErrorWithWizeLens` is the same with no `next`.

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { afterNavigate } from "$app/navigation";
  import { trackSvelteKitNavigation } from "@wizeworks/lens-svelte";

  trackSvelteKitNavigation(afterNavigate);
</script>

<slot />
```

Each client-side navigation is a page view; the first load already is one. `pageViewOnNavigate()` gives the bare callback for your
own `afterNavigate`.

When the server also runs WizeLens (`@wizeworks/lens-node`), the first page load joins the server's trace of that page.

## Plain Svelte

```ts
// main.ts
import { initWizeLens, trackNavigation } from "@wizeworks/lens-svelte";

initWizeLens({ endpoint: "/_wizelens", enabled: import.meta.env.DEV });
trackNavigation(); // or trackNavigation({ mode: "hash" }) for svelte-spa-router
```

`trackNavigation({ mode, lens })` records back, forward, and (in hash mode) hash changes as page views, and returns a stop function.
`pushState` route changes are seen by WizeLens itself.

## The HUD

The same HUD as every WizeLens browser package: the last request, its server trace, errors, and links into the dashboard, in a
`<wizelens-hud>` element with its own shadow root, so your CSS cannot reach it. Two options set it:

| Option | Default | Description |
|---|---|---|
| `hud` | `"auto"` | `"auto"` asks `{endpoint}/api/info` once and shows the HUD when the server's read API answers, as in development; a send-only server shows nothing. `true` shows it and reads traces back. `false` shows nothing and reads nothing back. |
| `slowMs` | `500` | The HUD shows requests at or over this many ms as "warning". |

```ts
initWizeLens({ endpoint: "/_wizelens", enabled: dev, hud: true, slowMs: 800 });
```

When a .NET or Node add-on puts its HUD script into the pages it serves in development, the app's instance takes over from it: one HUD and one
capture per page.

Options are the [@wizeworks/lens-browser options](https://github.com/brandonkorous/wizelens/tree/main/js/packages/browser#options).

MIT licensed.
