export type Box = { x: number; y: number; w: number; h: number };

// One shape in the story scene, with where it sits in each act: then (A), split (B), and one timeline (D).
export type SceneNode = {
  id: string;
  label: string;
  then?: string;
  color: string;
  A: Box;
  B: Box;
  D: Box;
  showA: boolean;
};

const ROW = (i: number, start: number, dur: number): Box => ({ x: 150 + start * 1.38, y: 70 + i * 40, w: Math.max(4, dur * 1.38), h: 20 });

export const NODES: SceneNode[] = [
  { id: "web", label: "React app", then: "the page", color: "#94a3b8", A: { x: 30, y: 150, w: 150, h: 120 }, B: { x: 20, y: 182, w: 120, h: 56 }, D: ROW(0, 0, 305), showA: true },
  { id: "gw", label: "gateway", then: "the app", color: "#2563eb", A: { x: 240, y: 165, w: 150, h: 90 }, B: { x: 190, y: 182, w: 120, h: 56 }, D: ROW(1, 4, 270), showA: true },
  { id: "orders", label: "orders", color: "#2563eb", A: { x: 240, y: 165, w: 150, h: 90 }, B: { x: 365, y: 96, w: 110, h: 56 }, D: ROW(2, 40, 60), showA: false },
  { id: "queue", label: "queue", color: "#8b5cf6", A: { x: 240, y: 165, w: 150, h: 90 }, B: { x: 365, y: 182, w: 110, h: 56 }, D: ROW(4, 120, 8), showA: false },
  { id: "billing", label: "billing", color: "#2563eb", A: { x: 240, y: 165, w: 150, h: 90 }, B: { x: 365, y: 268, w: 110, h: 56 }, D: ROW(5, 130, 90), showA: false },
  { id: "db1", label: "SQL", then: "SQL", color: "#f4b400", A: { x: 450, y: 180, w: 110, h: 60 }, B: { x: 505, y: 96, w: 75, h: 56 }, D: ROW(3, 50, 30), showA: true },
  { id: "db2", label: "SQL", color: "#f4b400", A: { x: 450, y: 180, w: 110, h: 60 }, B: { x: 505, y: 268, w: 75, h: 56 }, D: ROW(6, 150, 40), showA: false },
];

export const EDGES: [string, string][] = [
  ["web", "gw"],
  ["gw", "orders"],
  ["gw", "queue"],
  ["gw", "billing"],
  ["orders", "db1"],
  ["billing", "db2"],
];

export const PLATFORM: Box = { x: 395, y: 8, w: 185, h: 48 };

// Scroll stops: hold act A, move to B, hold B through act C, fold into the timeline D.
export const STOPS = [0, 0.2, 0.34, 0.66, 0.8, 1];

export const CHAPTERS = [
  {
    title: "Then.",
    body: "Around 2011, a tool called Glimpse put a small bar at the bottom of every ASP.NET page. Click it, and you saw what the server did for that page: the route, the action, the views, and every SQL query. It answered the one question that matters when a page is slow: what did this request actually do?",
  },
  {
    title: "Then everything split.",
    body: "Today one click goes through a React app, a gateway, a few services, a queue, and two or three databases. The question is the same. The answer is spread across ten processes, and the bar at the bottom of the page never made the trip.",
  },
  {
    title: "The tools went big.",
    body: "Observability platforms answer the question for production, at scale, for whole fleets. They are very good at that. They are not made for one developer at a desk who wants to know why this one click was slow, right now, with no account and no collector.",
  },
  {
    title: "So we built it back.",
    body: "WizeLens follows one click through every service and folds it into one timeline, at /_wizelens on your own machine. It is the bar at the bottom of the page again, rebuilt for how we build today.",
  },
];
