// Building blocks for the WizeLens hub (@wizeworks/lens-hub). Not a stable public API.
export { handleMcp } from "./mcp.js";
export type { McpDataSource } from "./mcp.js";
export { sanitizeClientSpan } from "./client-spans.js";
export { resolveUiDir, serveUi } from "./ui.js";
export { firstHeader, readJson, sendJson, setCors } from "./http-util.js";
export { fetchRemote } from "./federation.js";
export { parseArray } from "./persist-util.js";
export { CATEGORY_ATTR } from "./processor.js";
export { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, VERSION } from "./info.js";
