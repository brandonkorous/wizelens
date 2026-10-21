# @wizeworks/lens-react

Browser side of [WizeLens](https://github.com/brandonkorous/wizelens): links every `fetch` to its server trace, measures render time, page views, Web Vitals, hydration, and React component renders, and shows an in-page HUD.

```tsx
// main.tsx: this import must come first, before React loads.
import "@wizeworks/lens-react/install";
import { WizeLensProvider } from "@wizeworks/lens-react";

<WizeLensProvider endpoint="/_wizelens" enabled={import.meta.env.DEV}>
  <App />
</WizeLensProvider>
```

| Prop | Default | Description |
|---|---|---|
| `endpoint` | `/_wizelens` | WizeLens base path or URL on your API. |
| `enabled` | `true` | Pass `import.meta.env.DEV` (or similar). |
| `hud` | `true` | Show the in-page HUD. Off also stops reading traces back, so it works with a send-only server. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `release` | from the build plugin | The web app's version, kept on browser spans for release markers and version compares, and so stacks find the right source maps. |
| `slowMs` | `500` | Requests at or over this many ms show as "warning". |
| `capturePages` | `true` | Send page views, React render stats, and browser errors. |
| `captureConsole` | `true` | Copy `console.log`, `info`, `warn`, `error`, `debug`, and `trace` calls into the page view's trace (at most 500 per page). |
| `resolveFrames` | `true` | Read the page's own source maps (dev servers serve them) so errors group by your source. |
| `user`, `userName` | none | The signed-in user, sent as `enduser.id` and `user.full_name` on every browser span. |

## The HUD

The HUD is the same `<wizelens-hud>` element that every WizeLens browser package shows, from
[@wizeworks/lens-browser](https://github.com/brandonkorous/wizelens/tree/main/js/packages/browser). It lives in its own shadow root, so
your CSS cannot reach it, and it keeps its settings in `localStorage` (`wizelens.hud.*`). It is added to the page after the provider
mounts, so server-rendered HTML has no HUD and hydration matches, and the render stats leave its work out.

The provider renders it for you. For a recorder you made yourself with `createRecorder`, render `<Hud recorder={recorder} slowMs={800} />`:
it renders nothing and mounts the element for that recorder while it is mounted.

When a .NET or Node add-on puts its HUD script into the pages it serves in development, the provider takes over from it: one HUD and
one capture per page.

The browser capture itself (fetch, page views, Web Vitals, errors, console) lives in [@wizeworks/lens-browser](https://github.com/brandonkorous/wizelens/tree/main/js/packages/browser), which this package builds on. Not using React? See that package, or the Vue, Angular, and Svelte packages.

MIT licensed.
