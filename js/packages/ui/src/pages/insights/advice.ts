import type { InsightGroup } from "@wizeworks/lens-core";

export interface Advice {
  why: string;
  fix: string[];
}

const ADVICE: Record<string, Advice> = {
  "n+1-db": {
    why: "The request runs the same query once per item. Each round trip adds latency, so the request gets slower as the data grows.",
    fix: ["Load the related rows in one query: eager loading (Include in EF Core) or a JOIN.", "Or collect the ids and run one query with IN (…).", "Check the result with WizeLens: the query should run once."],
  },
  "n+1-http": {
    why: "The request calls another service once per item. Every call pays network time and the other service's work.",
    fix: ["Add a batch endpoint that takes many ids at once.", "Or cache the answers for the length of the request.", "Run independent calls in parallel when they cannot be merged."],
  },
  "duplicate-query": {
    why: "The same query with the same parameters runs more than once in one request. The second run returns nothing new.",
    fix: ["Keep the first result and pass it along.", "Use a per-request cache or a unit of work that tracks loaded rows."],
  },
  "slow-query": {
    why: "One query takes a large part of the request. Users wait for it, and it holds a connection while it runs.",
    fix: ["Look at the query plan (EXPLAIN) for full scans.", "Add an index on the columns in WHERE, JOIN, and ORDER BY.", "Read fewer rows or columns, and page large results."],
  },
  "render-route": {
    why: "Users see this page late or watch it move. Slow paints and layout shift both hurt how fast the page feels.",
    fix: ["Send less JavaScript on this route: split code and defer what is not needed for the first paint.", "Give images and embeds a fixed size so the layout does not jump.", "Use loading=\"lazy\" and right-sized images below the fold."],
  },
  "render-component": {
    why: "This component takes a large share of the browser's render time, or renders when nothing changed.",
    fix: ["Wrap it in React.memo and keep its props stable (useMemo, useCallback).", "Split context so a change only reaches components that use that value.", "Move expensive work out of render, or into useMemo."],
  },
};

/** Why an insight matters and how to fix it. */
export function adviceFor(g: InsightGroup): Advice {
  if (g.kind === "render") return ADVICE[g.key.startsWith("render|component|") ? "render-component" : "render-route"]!;
  return ADVICE[g.kind]!;
}

export const AREA_LABEL: Record<InsightGroup["area"], string> = { database: "Database", http: "HTTP", render: "Rendering" };
