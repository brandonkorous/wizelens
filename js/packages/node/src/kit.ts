// Building blocks for the WizeLens hub (@wizeworks/lens-hub). Not a stable public API.
export { handleMcp } from "./mcp.js";
export type { McpDataSource, McpProject, McpProjects, OverviewPage } from "./mcp.js";
export { sanitizeClientSpan } from "./client-spans.js";
export { resolveUiDir, serveUi } from "./ui.js";
export { firstHeader, readJson, sendJson, setCors } from "./http-util.js";
export { fetchRemote } from "./federation.js";
export { parseArray } from "./persist-util.js";
export { CATEGORY_ATTR } from "./processor.js";
export { pointsFromSdk } from "./metrics/otel.js";
export type { SdkResourceMetrics } from "./metrics/otel.js";
export { exponentialToExplicit } from "./metrics/exponential.js";
export type { ExponentialHistogram } from "./metrics/exponential.js";
export { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, VERSION } from "./info.js";
export { dirMapLoader, localMapLoader } from "./sourcemaps.js";
export type { SourceMapOptions } from "./sourcemaps.js";
