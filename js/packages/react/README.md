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
| `hud` | `true` | Show the in-page HUD. |
| `propagateTo` | same origin | Which requests get a `traceparent` header. |
| `release` | from the build plugin | The web app's version, kept on browser spans for release markers and version compares, and so stacks find the right source maps. |
| `slowMs` | `500` | Requests at or over this many ms show as "warning". |
| `capturePages` | `true` | Send page views, React render stats, and browser errors. |
| `captureConsole` | `true` | Copy `console.log`, `info`, `warn`, `error`, `debug`, and `trace` calls into the page view's trace (at most 500 per page). |

MIT licensed.
