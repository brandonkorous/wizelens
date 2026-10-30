import type { Span } from "@wizeworks/lens-core/internal";
import { DB_PARAMS } from "./db-params.js";

const text = (s: Span) => s.attributes["db.query.text"];

/** An ORM span (SQLAlchemy) over a driver span is one query: the driver span becomes internal, and its parameters move up. */
export function hideNestedDb(spans: Span[]): Span[] {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  for (const s of spans) {
    if (s.category !== "db" || !s.parentSpanId) continue;
    const parent = byId.get(s.parentSpanId);
    if (parent?.category !== "db") continue;
    if (parent.attributes[DB_PARAMS] === undefined && s.attributes[DB_PARAMS] !== undefined && text(parent) === text(s)) {
      parent.attributes[DB_PARAMS] = s.attributes[DB_PARAMS]!;
    }
    s.category = "internal";
  }
  return spans;
}
