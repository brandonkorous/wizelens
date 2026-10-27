export type RowKind = "server" | "db" | "net" | "render" | "log" | "msg";

// One row of the demo trace. `line` is the code line that makes it appear.
export type TraceRow = { label: string; ms: string; start: number; dur: number; kind: RowKind; depth: number; line: number };

export type Capture = { title: string; items: string[] };

export type Highlight = { title: string; body: string; code?: string };

// A real screenshot of the product on this stack.
export type Shot = { title: string; body: string; src: string; alt: string; width: number; height: number };

export type Stack = {
  slug: string;
  name: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  headline: [string, string];
  lede: string;
  facts: { value: string; label: string }[];
  file: string;
  code: string[];
  traceTitle: string;
  scale: number;
  rows: TraceRow[];
  captures: Capture[];
  highlightsTitle: string;
  highlights: Highlight[];
  docs: { label: string; href: string }[];
  /** How many of the first docs are setup guides, one hero button each. Default 1. */
  setups?: number;
  shot?: Shot;
};
