export type Beat =
  | { kind: "ask"; text: string }
  | { kind: "call"; tool: string; args: string }
  | { kind: "result"; lines: string[] }
  | { kind: "answer"; text: string }
  | { kind: "audit"; text: string };

// The session as the .NET add-on runs it: its tool arguments, its JSON, and its audit log lines.
export const BEATS: Beat[] = [
  { kind: "ask", text: "Why is /api/customers-with-orders slow?" },
  { kind: "call", tool: "find_n_plus_one", args: "{}" },
  {
    kind: "result",
    lines: [
      "[{",
      '  "traceId": "e8fa3b92…",',
      '  "kind": "http",',
      '  "shape": "GET localhost:5291/orders?customerId={}",',
      '  "count": 8,',
      '  "totalMs": 45.2',
      "}]",
    ],
  },
  { kind: "call", tool: "get_trace", args: '{ "traceId": "e8fa3b92…" }' },
  {
    kind: "result",
    lines: [
      '"name": "GET /api/customers-with-orders",',
      '"http.request.header.authorization": "[redacted]",',
      '"http.request.header.cookie": "[redacted]",',
    ],
  },
  {
    kind: "answer",
    text: "The gateway calls orders-api once per customer: 8 calls in one request. Ask once for all eight customers.",
  },
  {
    kind: "audit",
    text: 'WizeLens MCP audit: tool find_n_plus_one called with {"minRepeats":null}\nWizeLens MCP audit: tool get_trace called with {"traceId":"e8fa3b92…","federate":true}',
  },
];

export const TOOLS = [
  "get_overview", "list_problems", "get_timeseries", "group_requests", "list_traces", "get_trace", "search", "search_fields",
  "list_tags", "get_errors", "find_slow_queries", "find_n_plus_one", "find_security_issues", "get_page", "list_metrics",
  "get_metric", "get_alerts", "list_projects",
];

export const GUARDS = [
  { title: "Off by default.", body: "Turn it on per service or on the hub, or connect Claude to the cloud at mcp.wizelens.com with a sign-in." },
  { title: "Read-only.", body: "No tool can change anything. It can only look." },
  { title: "Redacted.", body: "Secrets are replaced before they are stored, so an agent never sees them." },
  { title: "Audited.", body: "Every call writes a line to your log. In the cloud, Claude reads only the projects you pick." },
];
