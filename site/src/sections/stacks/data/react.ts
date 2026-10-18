import type { Stack } from "../types";

export const REACT: Stack = {
  slug: "react",
  name: "React and Next.js",
  title: "WizeLens for React and Next.js",
  headline: ["From the click", "to the database."],
  lede: "Every fetch links to the server trace it started. Page loads join the server that rendered them. Renders, hydration, and Web Vitals are timed, and the HUD sits in the corner of your page.",
  facts: [
    { value: "1 provider", label: "in React" },
    { value: "2 files", label: "in Next.js, no route file" },
    { value: "React 18+", label: "App Router or Pages" },
  ],
  file: "instrumentation.ts · layout.tsx",
  code: [
    "// instrumentation.ts",
    'registerWizeLens({ serviceName: "web" });',
    "",
    "// app/layout.tsx",
    'import "@wizeworks/lens-react/install";',
    '<WizeLensProvider endpoint="/_wizelens">',
  ],
  traceTitle: "page load /products/42 · 412 ms",
  scale: 420,
  rows: [
    { label: "page load /products/42", ms: "412 ms", start: 0, dur: 412, kind: "net", depth: 0, line: 5 },
    { label: "GET /products/[id]", ms: "164 ms", start: 6, dur: 164, kind: "server", depth: 1, line: 1 },
    { label: "SELECT * FROM products WHERE id = $1", ms: "3.1 ms", start: 30, dur: 6, kind: "db", depth: 2, line: 1 },
    { label: "render ProductPage (server)", ms: "38 ms", start: 120, dur: 38, kind: "render", depth: 2, line: 1 },
    { label: "hydration", ms: "52 ms", start: 238, dur: 52, kind: "render", depth: 1, line: 4 },
    { label: "fetch /api/reviews", ms: "88 ms", start: 300, dur: 88, kind: "net", depth: 1, line: 5 },
    { label: "<ReviewList /> × 3 renders", ms: "11 ms", start: 392, dur: 11, kind: "render", depth: 1, line: 4 },
  ],
  captures: [
    { title: "Page loads", items: ["TTFB, FCP, LCP, INP, CLS", "SSR and hydration", "Slow images", "Joins the server trace"] },
    { title: "Requests", items: ["traceparent on every fetch", "Real render time, to the next paint", "Same origin, or what you allow"] },
    { title: "Components", items: ["Render time per component", "Components that render too often"] },
    { title: "Next.js", items: ["One trace per request, by route", "Render, route handler, and fetch steps", "Server errors from onRequestError"] },
    { title: "Errors and logs", items: ["Browser errors", "Browser console lines", "Server errors in the same trace"] },
    { title: "The HUD", items: ["Total, server, database, render", "Health color in the corner", "One click to the full trace"] },
  ],
  highlightsTitle: "The front end is half the story.",
  highlights: [
    { title: "The click starts the trace.", body: "Each fetch carries a traceparent, so the server trace begins at the button that was clicked, not at the API." },
    { title: "Render time is real.", body: "Measured from the response to the next paint: reading the body, your code, React's render, and the paint itself." },
    { title: "Next.js steps, not noise.", body: "Each request is one trace named by its route, with Next.js's own render, route handler, and fetch steps inside. Static files and hot reload are left out." },
    { title: "Import it first.", body: "The install import must come before React loads. That is how WizeLens times each component and measures hydration.", code: 'import "@wizeworks/lens-react/install";' },
  ],
  docs: [
    { label: "React setup", href: "/docs/react/" },
    { label: "Next.js setup", href: "/docs/nextjs/" },
    { label: "The HUD", href: "/docs/hud/" },
  ],
};
