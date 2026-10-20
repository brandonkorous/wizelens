// graphql 17 announces each operation on a tracing channel ("graphql:execute"), for CommonJS and ES module apps alike.
import { tracingChannel } from "node:diagnostics_channel";
import { type Context, ROOT_CONTEXT, type Span as OtelSpan, SpanKind, trace } from "@opentelemetry/api";
import type { CaptureDeps } from "../request-capture.js";
import { addOperation } from "../request-naming.js";
import { currentServerSpan, recordOn } from "../spans.js";
import { contextStorage } from "../tracing.js";
import { endpointPartOf, type ExecutionArgsLike, operationAttributes, operationOf, recordResultErrors, spanNameOf } from "./operation.js";
import { hookResolvers } from "./resolvers.js";
import { type GraphqlOptions, IN_OPERATION } from "./shared.js";

/** What graphql 17 publishes: the call, then its result or error. */
interface OperationMessage extends ExecutionArgsLike {
  result?: unknown;
  error?: unknown;
}

const CHANNELS = ["graphql:execute", "graphql:subscribe"];
const subscribed = new WeakSet<CaptureDeps>();
const spans = new WeakMap<object, OtelSpan>();

/** Start the operation span, and return the context its work runs in (so database calls nest under it). */
function startOperation(d: CaptureDeps, options: GraphqlOptions, msg: OperationMessage) {
  const parent = contextStorage()?.getStore();
  if (!parent || !trace.getSpan(parent) || parent.getValue(IN_OPERATION) || !msg.document) return parent;
  const op = operationOf(msg);
  const span = d.tracer.startSpan(spanNameOf(op), { kind: SpanKind.INTERNAL, attributes: operationAttributes(op, msg, options.document !== false) }, parent);
  spans.set(msg, span);
  const server = currentServerSpan();
  if (server) addOperation(server, endpointPartOf(op));
  hookResolvers(d.tracer, msg.schema, options);
  return trace.setSpan(parent, span).setValue(IN_OPERATION, true);
}

function finish(msg: OperationMessage): void {
  const span = spans.get(msg);
  if (!span) return;
  spans.delete(msg);
  if (msg.error !== undefined) recordOn(span, msg.error);
  else recordResultErrors(span, msg.result);
  span.end();
}

/** Listen to graphql 17's operation channels, once per instance. False when the context storage is not WizeLens's own. */
export function subscribeGraphqlChannels(d: CaptureDeps, options: GraphqlOptions): boolean {
  const storage = contextStorage();
  if (!storage) return false;
  if (subscribed.has(d)) return true;
  subscribed.add(d);
  for (const name of CHANNELS) {
    const channel = tracingChannel<Context, OperationMessage>(name);
    channel.start.bindStore(storage, (msg) => startOperation(d, options, msg as OperationMessage) ?? ROOT_CONTEXT);
    const done = (m: unknown) => finish(m as OperationMessage);
    // A sync result or throw arrives with `end`; a promise's with `asyncEnd`.
    const settled = (m: object) => "result" in m || "error" in m;
    channel.subscribe({ start: () => undefined, end: (m) => void (settled(m) && done(m)), asyncStart: () => undefined, asyncEnd: done, error: () => undefined });
  }
  return true;
}
