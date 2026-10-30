import { trace } from "@opentelemetry/api";
import { captureOf, providerOf } from "../adapters/registry.js";
import { isControlFlowError } from "../control-flow.js";
import { preciseProvider } from "../precise.js";
import { currentServerSpan, recordOn } from "../spans.js";
import type { WizeLens, WizeLensOptions } from "../types.js";
import { createWizeLens } from "../wizelens.js";
import { type IgnorePath, traceServers } from "./node-server.js";

export interface WizeLensNextOptions extends WizeLensOptions {
  /** Paths that are not traced. Default `nextIgnore`: build files, dev overlay, and hot reload. */
  ignore?: IgnorePath;
}

/** Next.js build files, dev overlay, and hot reload: many per page, and never app code. */
export const nextIgnore: IgnorePath = (path) =>
  path.startsWith("/_next/static/") || path.startsWith("/_next/webpack-hmr") || path.startsWith("/__nextjs") || path === "/favicon.ico";

const INSTANCE = Symbol.for("wizeworks.wizelens.next");
type Holder = { [INSTANCE]?: WizeLens };

/** Start WizeLens in a Next.js server. Call it from `register()` in instrumentation.ts, in the Node.js runtime only. */
export function registerWizeLens(options: WizeLensNextOptions): WizeLens {
  const g = globalThis as Holder;
  // Next.js can load instrumentation more than once. Keep one instance per process.
  const existing = g[INSTANCE];
  if (existing) return existing;
  const wizelens = createWizeLens(options);
  g[INSTANCE] = wizelens;
  const capture = captureOf(wizelens);
  const provider = providerOf(wizelens);
  if (!capture || !provider) return wizelens;
  // Next.js makes its render, route handler, and fetch spans with the global tracer.
  if (!trace.setGlobalTracerProvider(preciseProvider(provider))) {
    console.warn("[wizelens] Another OpenTelemetry SDK is registered, so Next.js spans go there. WizeLens still traces each request.");
  }
  traceServers(capture, options.ignore ?? nextIgnore);
  return wizelens;
}

/** The instance `registerWizeLens` started in this process, if any. */
export const currentWizeLens = (): WizeLens | undefined => (globalThis as Holder)[INSTANCE];

/** What Next.js passes to `onRequestError`. Only the fields WizeLens reads. */
export interface NextRequestInfo {
  path: string;
  method: string;
}
export interface NextErrorContext {
  routerKind: string;
  routePath: string;
  routeType: string;
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** True when a span of this trace already holds this error. Next.js records some errors on its own spans. */
function alreadyRecorded(wizelens: WizeLens, traceId: string, message: string): boolean {
  const spans = wizelens.store.get(traceId)?.spans ?? [];
  return spans.some((s) => s.events.some((e) => e.name === "exception" && e.attributes["exception.message"] === message));
}

/** Next.js `onRequestError` hook: puts a server error on the request span and in the logs. Re-export it from instrumentation.ts. */
export function onRequestError(err: unknown, request: NextRequestInfo, ctx: NextErrorContext): void {
  const wizelens = currentWizeLens();
  if (!wizelens?.enabled || isControlFlowError(err)) return;
  const message = messageOf(err);
  const span = currentServerSpan();
  if (span && !alreadyRecorded(wizelens, span.spanContext().traceId, message)) recordOn(span, err);
  wizelens.logger.error(message, { "next.route": ctx.routePath, "next.route_type": ctx.routeType, "url.path": request.path });
}
