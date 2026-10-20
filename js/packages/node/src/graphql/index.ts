import { createRequire } from "node:module";
import { context, SpanKind, trace } from "@opentelemetry/api";
import { captureOf, patchMethod } from "../adapters/registry.js";
import type { CaptureDeps } from "../request-capture.js";
import { addOperation } from "../request-naming.js";
import { currentServerSpan, recordOn } from "../spans.js";
import type { WizeLens } from "../types.js";
import { callOf, endpointPartOf, operationAttributes, operationOf, recordResultErrors, spanNameOf } from "./operation.js";
import { hookResolvers } from "./resolvers.js";
import { afterCall, type GraphqlOptions, IN_OPERATION, type Method } from "./shared.js";

export type { GraphqlOptions } from "./shared.js";

const require = createRequire(import.meta.url);
// graphql-js entry points, and the executor GraphQL Yoga uses (@graphql-tools/executor).
const ENTRY_POINTS = ["execute", "executeSync", "subscribe", "normalizedExecutor"];
const KIND = "graphql";

/** Wrap one graphql-js entry point: a span per operation inside a request, named like "query GetOrders". */
export function traceOperation(d: CaptureDeps, options: GraphqlOptions, original: Method): Method {
  return function wizelensGraphql(this: unknown, ...args: unknown[]) {
    const call = callOf(args);
    const parent = context.active();
    if (!call || !trace.getSpan(parent) || parent.getValue(IN_OPERATION)) return original.apply(this, args);
    const op = operationOf(call);
    const attributes = operationAttributes(op, call, options.document !== false);
    const span = d.tracer.startSpan(spanNameOf(op), { kind: SpanKind.INTERNAL, attributes }, parent);
    const server = currentServerSpan();
    if (server) addOperation(server, endpointPartOf(op));
    hookResolvers(d.tracer, call.schema, options);
    const ctx = trace.setSpan(parent, span).setValue(IN_OPERATION, true);
    return context.with(ctx, () =>
      afterCall(() => original.apply(this, args), (result, error) => {
        if (error) recordOn(span, error);
        else recordResultErrors(span, result);
        span.end();
      }),
    );
  };
}

const isNamespace = (o: object): boolean => Object.prototype.toString.call(o) === "[object Module]";

function writable(o: object, name: string): boolean {
  const d = Object.getOwnPropertyDescriptor(o, name);
  return !!d && (d.writable === true || typeof d.set === "function") && !isNamespace(o);
}

/** Where `name` can be replaced: the object itself, else the CommonJS file that defines the same function (graphql's index has getters only). */
function holderOf(target: Record<string, unknown>, name: string): Record<string, unknown> | null {
  const fn = target[name];
  if (typeof fn !== "function") return null;
  if (writable(target, name)) return target;
  for (const mod of Object.values(require.cache)) {
    const exports = mod?.exports as Record<string, unknown> | null | undefined;
    if (exports && typeof exports === "object" && exports !== target && exports[name] === fn && writable(exports, name)) return exports;
  }
  return null;
}

const isWrapped = (fn: unknown): boolean => typeof fn === "function" && (fn as unknown as Record<symbol, unknown>)[Symbol.for(`wizeworks.wizelens.${KIND}`)] === true;

/** Trace graphql-js 16+ operations (Apollo, Yoga, Mercurius, Nest): `instrumentGraphql(wizelens, graphql)` before the server is made. False when nothing was patched. */
export function instrumentGraphql(wizelens: WizeLens, graphql: unknown, options: GraphqlOptions = {}): boolean {
  const d = captureOf(wizelens);
  if (!d || !graphql || typeof graphql !== "object") return false;
  let done = false;
  for (const name of ENTRY_POINTS) {
    const holder = holderOf(graphql as Record<string, unknown>, name);
    if (!holder) continue;
    if (isWrapped(holder[name])) done = true;
    else done = patchMethod(holder, name, (original) => traceOperation(d, options, original as Method), KIND) || done;
  }
  return done;
}

/** One graphql-js function, traced. For an ES module build, whose bindings cannot be patched from outside. */
export function traceGraphqlFunction(wizelens: WizeLens, fn: unknown, options: GraphqlOptions = {}): Method | undefined {
  const d = captureOf(wizelens);
  if (!d || typeof fn !== "function" || isWrapped(fn)) return undefined;
  const wrapped = traceOperation(d, options, fn as Method);
  Object.defineProperty(wrapped, Symbol.for(`wizeworks.wizelens.${KIND}`), { value: true });
  return wrapped;
}
