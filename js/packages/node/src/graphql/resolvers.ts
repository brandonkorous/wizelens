import { type Attributes, context, SpanKind, trace, type Tracer } from "@opentelemetry/api";
import { preciseNow } from "../precise.js";
import { recordOn } from "../spans.js";
import { afterCall, type GraphqlOptions, IN_OPERATION, type Method } from "./shared.js";

// Minimal graphql-js schema shapes.
interface FieldLike {
  name?: string;
  type?: unknown;
  resolve?: Method;
}
interface TypeLike {
  name?: string;
  getFields?: () => Record<string, FieldLike>;
}
interface SchemaLike {
  getTypeMap?: () => Record<string, TypeLike>;
}
interface PathLike {
  prev?: PathLike;
  key: string | number;
}
interface InfoLike {
  path?: PathLike;
}

const hooked = new WeakSet<object>();
const WRAPPED = Symbol.for("wizeworks.wizelens.graphql.resolver");

/** "orders.0.items" from graphql-js's linked path. */
function pathText(path: PathLike | undefined): string {
  const keys: (string | number)[] = [];
  for (let p = path; p; p = p.prev) keys.unshift(p.key);
  return keys.join(".");
}

function resolverAttributes(field: string, typeName: string, fieldType: unknown, info: InfoLike | undefined): Attributes {
  const attributes: Attributes = { "graphql.field.name": field, "graphql.parent.type": typeName };
  if (fieldType !== undefined) attributes["graphql.field.type"] = String(fieldType);
  const path = pathText(info?.path);
  if (path) attributes["graphql.field.path"] = path;
  return attributes;
}

/** A resolver that runs inside its own span. For the "all" mode. */
function spanAround(tracer: Tracer, name: string, attrs: (info: InfoLike | undefined) => Attributes, original: Method): Method {
  return function (this: unknown, ...args: unknown[]) {
    if (!context.active().getValue(IN_OPERATION)) return original.apply(this, args);
    const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL, attributes: attrs(args[3] as InfoLike) });
    return context.with(trace.setSpan(context.active(), span), () =>
      afterCall(() => original.apply(this, args), (_result, error) => {
        if (error) recordOn(span, error);
        span.end();
      }),
    );
  };
}

/** A resolver timed in place: only a slow one gets a span, written after it finished. For the "slow" mode. */
function spanWhenSlow(tracer: Tracer, name: string, attrs: (info: InfoLike | undefined) => Attributes, original: Method, slowMs: number): Method {
  return function (this: unknown, ...args: unknown[]) {
    const ctx = context.active();
    if (!ctx.getValue(IN_OPERATION)) return original.apply(this, args);
    const startedMs = preciseNow();
    return afterCall(() => original.apply(this, args), (_result, error) => {
      const endMs = preciseNow();
      // A fast failure is already in the operation's errors.
      if (endMs - startedMs < slowMs) return;
      const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL, startTime: startedMs, attributes: attrs(args[3] as InfoLike) }, ctx);
      if (error) recordOn(span, error);
      span.end(endMs);
    });
  };
}

function wrapField(tracer: Tracer, typeName: string, field: FieldLike, options: GraphqlOptions): void {
  const original = field.resolve;
  if (typeof original !== "function" || (original as unknown as Record<symbol, unknown>)[WRAPPED]) return;
  const fieldName = field.name ?? "field";
  const attrs = (info: InfoLike | undefined) => resolverAttributes(fieldName, typeName, field.type, info);
  const name = `${typeName}.${fieldName}`;
  const wrapped = options.resolvers === "all" ? spanAround(tracer, name, attrs, original) : spanWhenSlow(tracer, name, attrs, original, options.slowResolverMs ?? 50);
  Object.defineProperty(wrapped, WRAPPED, { value: true });
  field.resolve = wrapped;
}

/** Wrap the resolvers of a schema once, by the options. Built-in introspection types are skipped. */
export function hookResolvers(tracer: Tracer, schema: unknown, options: GraphqlOptions): void {
  const s = schema as SchemaLike | null | undefined;
  if (options.resolvers === "none" || !s || typeof s.getTypeMap !== "function" || hooked.has(s)) return;
  hooked.add(s);
  for (const [typeName, type] of Object.entries(s.getTypeMap())) {
    if (typeName.startsWith("__") || typeof type?.getFields !== "function") continue;
    for (const field of Object.values(type.getFields())) wrapField(tracer, typeName, field, options);
  }
}
