import { type Attributes as OtelAttributes, context, type Span as OtelSpan, SpanKind, trace, type Tracer } from "@opentelemetry/api";
import { redactParams } from "@wizeworks/lens-core";
import { CATEGORY_ATTR } from "./processor.js";
import { recordOn } from "./spans.js";
import type { DbCallInfo } from "./types.js";

export function parseSql(sql: string): { operation: string; collection: string | undefined } {
  const operation = (/^\s*(\w+)/.exec(sql)?.[1] ?? "QUERY").toUpperCase();
  const collection = /\b(?:FROM|INTO|UPDATE|JOIN)\s+["`[]?([\w.]+)/i.exec(sql)?.[1];
  return { operation, collection };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

function dbAttributes(info: DbCallInfo, sql: string, params: unknown, redactKeys: readonly string[]): OtelAttributes {
  const parsed = parseSql(sql);
  const attributes: OtelAttributes = {
    [CATEGORY_ATTR]: "db",
    "db.system.name": info.system,
    "db.query.text": sql,
    "db.operation.name": info.operation ?? parsed.operation,
    "wizelens.db.adapter": info.adapter ?? info.system,
  };
  const collection = info.collection ?? parsed.collection;
  if (collection) attributes["db.collection.name"] = collection;
  if (info.namespace) attributes["db.namespace"] = info.namespace;
  const p = redactParams(params, redactKeys);
  if (p !== null) attributes["wizelens.db.parameters"] = p;
  return attributes;
}

function spanName(attributes: OtelAttributes): string {
  const op = String(attributes["db.operation.name"]);
  const collection = attributes["db.collection.name"];
  return collection ? `${op} ${String(collection)}` : op;
}

function runInSpan<T>(span: OtelSpan, fn: () => T): T {
  const done = <R>(result: R): R => {
    if (Array.isArray(result)) span.setAttribute("db.response.returned_rows", result.length);
    span.end();
    return result;
  };
  const fail = (err: unknown): never => {
    recordOn(span, err);
    span.end();
    throw err;
  };
  try {
    const result = context.with(trace.setSpan(context.active(), span), fn);
    if (isThenable(result)) return Promise.resolve(result).then(done, fail) as T;
    return done(result);
  } catch (err) {
    return fail(err);
  }
}

/** Build `traceDb`: wraps one database call (sync or async) in a db span. */
export function createTraceDb(tracer: Tracer, redactKeys: readonly string[]) {
  return function traceDb<T>(info: DbCallInfo, sql: string, params: unknown, fn: () => T): T {
    const attributes = dbAttributes(info, sql, params, redactKeys);
    const span = tracer.startSpan(spanName(attributes), { kind: SpanKind.CLIENT, attributes });
    return runInSpan(span, fn);
  };
}
