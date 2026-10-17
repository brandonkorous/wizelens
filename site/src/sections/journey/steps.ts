export type JourneyStep = { title: string; body: string };

export const STEPS: JourneyStep[] = [
  {
    title: "You click.",
    body: "A button in your React app calls the API. WizeLens adds a traceparent header, so the server knows which click sent it.",
  },
  {
    title: "The gateway answers.",
    body: "Your .NET gateway runs the handler and its EF Core queries. Routing, handler, and every statement are timed.",
  },
  {
    title: "It calls the next service.",
    body: "The Node orders API gets the same trace id. Its response says where its own WizeLens lives, so nothing is set up by hand.",
  },
  {
    title: "Every query is caught.",
    body: "Both databases: each statement, its time, and its parameters. Passwords, tokens, and keys are redacted before anything is stored.",
  },
  {
    title: "One timeline.",
    body: "Open the trace in any service. It pulls the pieces from the others and shows one request, end to end. There is no collector to run.",
  },
];

export type MapNode = { id: string; label: string; sub: string; x: number; y: number; step: number };

export const NODES: MapNode[] = [
  { id: "web", label: "React app", sub: "browser", x: 20, y: 40, step: 0 },
  { id: "gw", label: "gateway-api", sub: ".NET 10", x: 250, y: 40, step: 1 },
  { id: "orders", label: "orders-api", sub: "Node", x: 480, y: 40, step: 2 },
  { id: "db1", label: "SQL main", sub: "EF Core", x: 250, y: 200, step: 3 },
  { id: "db2", label: "SQL orders", sub: "node:sqlite", x: 480, y: 200, step: 3 },
];

export type MapEdge = { from: string; to: string; step: number; label: string };

export const EDGES: MapEdge[] = [
  { from: "web", to: "gw", step: 0, label: "traceparent" },
  { from: "gw", to: "orders", step: 2, label: "traceparent" },
  { from: "gw", to: "db1", step: 3, label: "9 queries" },
  { from: "orders", to: "db2", step: 3, label: "8 queries" },
];

export type LaneBar = { start: number; dur: number };

export type Lane = { label: string; kind: "net" | "server" | "db" | "render"; step: number; bars: LaneBar[] };

const ticks = (from: number, every: number, n: number, dur: number): LaneBar[] =>
  Array.from({ length: n }, (_, i) => ({ start: from + i * every, dur }));

export const LANES: Lane[] = [
  { label: "Browser", kind: "net", step: 0, bars: [{ start: 0, dur: 270 }] },
  { label: "gateway-api", kind: "server", step: 1, bars: [{ start: 5, dur: 263 }] },
  { label: "SQL main", kind: "db", step: 3, bars: ticks(40, 24, 9, 2) },
  { label: "orders-api", kind: "server", step: 2, bars: ticks(64, 24, 8, 9) },
  { label: "SQL orders", kind: "db", step: 3, bars: ticks(68, 24, 8, 2) },
  { label: "Render", kind: "render", step: 4, bars: [{ start: 270, dur: 35 }] },
];

export const TIMELINE_MS = 305;
