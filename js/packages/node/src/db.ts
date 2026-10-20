import { type Attributes as OtelAttributes, type Context, context, createContextKey, ROOT_CONTEXT, SpanKind, trace, type Tracer } from "@opentelemetry/api";
import { redactParams } from "@wizeworks/lens-core";
import { CATEGORY_ATTR } from "./processor.js";
import { recordOn } from "./spans.js";
import type { DbCallInfo } from "./types.js";

/** Set inside any database span: driver calls below it (a pool calling its connection, a driver under an ORM) are part of it. */
const INSIDE_DB = createContextKey("wizelens.db.inside");
/** Set by a library that runs on a driver (Drizzle): the driver spans carry its name as the adapter. */
const ADAPTER_LABEL = createContextKey("wizelens.db.adapter-label");

export function parseSql(sql: string): { operation: string; collection: string | undefined } {
  const operation = (/^\s*(\w+)/.exec(sql)?.[1] ?? "QUERY").toUpperCase();
  const collection = /\b(?:FROM|INTO|UPDATE|JOIN)\s+["`[]?([\w.]+)/i.exec(sql)?.[1];
  return { operation, collection };
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

function dbAttributes(info: DbCallInfo, sql: string, params: unknown, redactKeys: readonly string[]): OtelAttributes {
  const parsed = parseSql(sql);
  const label = context.active().getValue(ADAPTER_LABEL);
  const attributes: OtelAttributes = {
    [CATEGORY_ATTR]: "db",
    "db.system.name": info.system,
    "db.query.text": sql,
    "db.operation.name": info.operation ?? parsed.operation,
    "wizelens.db.adapter": typeof label === "string" ? label : (info.adapter ?? info.system),
  };
  const collection = info.collection ?? parsed.collection;
  if (collection) attributes["db.collection.name"] = collection;
  if (info.namespace) attributes["db.namespace"] = info.namespace;
  const p = redactParams(params, redactKeys);
  if (p !== null) attributes["wizelens.db.parameters"] = p;
  return info.attributes ? { ...info.attributes, ...attributes } : attributes;
}

function spanName(attributes: OtelAttributes): string {
  const op = String(attributes["db.operation.name"]);
  const collection = attributes["db.collection.name"];
  return collection ? `${op} ${String(collection)}` : op;
}

/** One open database span. `ctx` makes it the parent of anything started inside the call. */
export interface DbSpan {
  ctx: Context;
  end(result: unknown): void;
  fail(err: unknown): void;
}

/** Start a database span, or null when the call runs inside another database span. ORM calls (`outermost`) always start one. */
export type StartDbSpan = (info: DbCallInfo, sql: string, params: unknown) => DbSpan | null;

function rowsIn(info: DbCallInfo, result: unknown): number | undefined {
  if (info.rowsOf) return info.rowsOf(result);
  return Array.isArray(result) ? result.length : undefined;
}

export function createDbSpans(tracer: Tracer, redactKeys: readonly string[], outsideRequests = false): StartDbSpan {
  return (info, sql, params) => {
    if (!info.outermost && context.active().getValue(INSIDE_DB)) return null;
    if (info.requireParent && !outsideRequests && !trace.getSpan(context.active())) return null;
    const attributes = dbAttributes(info, sql, params, redactKeys);
    const span = tracer.startSpan(spanName(attributes), { kind: SpanKind.CLIENT, attributes });
    const ctx = trace.setSpan(context.active(), span).setValue(INSIDE_DB, true);
    const end = (result: unknown) => {
      const rows = rowsIn(info, result);
      if (rows !== undefined) span.setAttribute("db.response.returned_rows", rows);
      span.end();
    };
    const fail = (err: unknown) => {
      recordOn(span, err);
      span.end();
    };
    return { ctx, end, fail };
  };
}

/** Run a call (sync, promise, or with a trailing callback) inside a database span. Returns what the call returns. */
export function runTraced(span: DbSpan | null, args: unknown[], invoke: (args: unknown[]) => unknown): unknown {
  if (!span) return invoke(args);
  const last = args[args.length - 1];
  if (typeof last === "function") {
    const callback = (err: unknown, ...rest: unknown[]) => {
      if (err) span.fail(err);
      else span.end(rest[0]);
      return (last as (...a: unknown[]) => unknown)(err, ...rest);
    };
    return context.with(span.ctx, () => invoke([...args.slice(0, -1), callback]));
  }
  try {
    const out = context.with(span.ctx, () => invoke(args));
    if (isThenable(out)) out.then(span.end, span.fail);
    else span.end(out);
    return out;
  } catch (err) {
    span.fail(err);
    throw err;
  }
}

/** Run WizeLens's own database work (its trace storage) so the adapters never trace it. */
export const untraced = <T>(fn: () => T): T => context.with(ROOT_CONTEXT.setValue(INSIDE_DB, true), fn);

/** Run `fn` so that driver spans inside it carry `label` as their adapter. */
export const withAdapterLabel = <T>(label: string, fn: () => T): T => context.with(context.active().setValue(ADAPTER_LABEL, label), fn);

/** Build `traceDb`: wraps one database call (sync or async) in a db span. */
export function createTraceDb(start: StartDbSpan) {
  return function traceDb<T>(info: DbCallInfo, sql: string, params: unknown, fn: () => T): T {
    return runTraced(start(info, sql, params), [], () => fn()) as T;
  };
}
