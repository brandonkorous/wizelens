export type Beat =
  | { kind: "ask"; text: string }
  | { kind: "call"; tool: string; args: string }
  | { kind: "result"; lines: string[] }
  | { kind: "answer"; text: string }
  | { kind: "audit"; text: string };

export const BEATS: Beat[] = [
  { kind: "ask", text: "Why is /api/customers-with-orders slow?" },
  { kind: "call", tool: "find_n_plus_one", args: '{ "service": "gateway-api" }' },
  {
    kind: "result",
    lines: [
      "{",
      '  "trace": "e8fa3b92",',
      '  "statement": "SELECT id, product, amount FROM orders WHERE customer_id = ?",',
      '  "count": 8,',
      '  "headers": { "authorization": "[redacted]" }',
      "}",
    ],
  },
  {
    kind: "answer",
    text: "The gateway asks orders-api for each customer's orders: 8 calls in one request. Ask once for all eight customers.",
  },
  { kind: "audit", text: "audit  mcp  find_n_plus_one  read-only  12 ms" },
];

export const TOOLS = ["get_overview", "get_timeseries", "group_requests", "list_traces", "get_trace", "find_slow_queries", "find_n_plus_one", "get_errors", "search", "get_metric"];

export const GUARDS = [
  { title: "Off by default.", body: "Nothing is reachable until you turn it on, per service." },
  { title: "Read-only.", body: "No tool can change anything. It can only look." },
  { title: "Redacted.", body: "Secrets are replaced before they are stored, so an agent never sees them." },
  { title: "Audited.", body: "Every call writes a line to your log. In the cloud, Claude signs in and reads only the projects you pick." },
];
