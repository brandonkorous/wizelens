// How to add the browser side of WizeLens, per frontend framework. Shown when the Rendering page has no page views yet.
export type Framework = "react" | "vue" | "angular" | "svelte" | "js";

export interface SetupSnippet {
  label: string;
  intro: string;
  code: string;
  note: string;
}

export const FRAMEWORKS: [Framework, string][] = [
  ["react", "React"],
  ["vue", "Vue"],
  ["angular", "Angular"],
  ["svelte", "Svelte"],
  ["js", "Plain JS"],
];

export const SETUP: Record<Framework, SetupSnippet> = {
  react: {
    label: "@wizeworks/lens-react",
    intro: "Add the WizeLens React package to your app:",
    code: `// main.tsx: first line, before React loads
import "@wizeworks/lens-react/install";

// Wrap your app once
<WizeLensProvider endpoint="/_wizelens">
  <App />
</WizeLensProvider>`,
    note: "Then load a few pages. Component timings need a React development build.",
  },
  vue: {
    label: "@wizeworks/lens-vue",
    intro: "Add the WizeLens Vue plugin to your app:",
    code: `// main.ts
import { WizeLensPlugin } from "@wizeworks/lens-vue";

createApp(App)
  .use(router)
  .use(WizeLensPlugin, { endpoint: "/_wizelens", router })
  .mount("#app");`,
    note: "Then load a few pages. Route changes and component errors are sent too.",
  },
  angular: {
    label: "@wizeworks/lens-angular",
    intro: "Add WizeLens to your app config:",
    code: `// app.config.ts
const lens = initWizeLens({ endpoint: "/_wizelens" });

providers: [
  { provide: ErrorHandler, useValue: createWizeLensErrorHandler(lens) },
  provideAppInitializer(() => void trackAngularRouter(inject(Router), lens)),
]`,
    note: "Then load a few pages. HttpClient calls link to their server traces.",
  },
  svelte: {
    label: "@wizeworks/lens-svelte",
    intro: "Start WizeLens in your client hooks:",
    code: `// src/hooks.client.ts
import { createHandleError, initWizeLens } from "@wizeworks/lens-svelte";

initWizeLens({ endpoint: "/_wizelens" });
export const handleError = createHandleError();

// src/routes/+layout.svelte
trackSvelteKitNavigation(afterNavigate);`,
    note: "Then load a few pages. Plain Svelte apps call trackNavigation() instead.",
  },
  js: {
    label: "@wizeworks/lens-browser",
    intro: "Add one script tag to your pages, or import the package:",
    code: `<script src="https://cdn.jsdelivr.net/npm/@wizeworks/lens-browser/dist/wizelens.iife.js"
        data-endpoint="/_wizelens"></script>

// or, with a bundler
import { initWizeLens } from "@wizeworks/lens-browser";
initWizeLens({ endpoint: "/_wizelens" });`,
    note: "Then load a few pages. Every fetch and XHR call links to its server trace.",
  },
};
