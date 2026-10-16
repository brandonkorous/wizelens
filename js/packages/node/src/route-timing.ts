import type { Span as OtelSpan } from "@opentelemetry/api";
import { ATTR_ROUTED_MS } from "@wizeworks/lens-core";

/** Record `wizelens.server.routed_ms` when Express sets `req.route`: the moment the matched route starts its handlers. */
export function watchRoute(req: object, span: OtelSpan, startedAt: number): void {
  if (Object.prototype.hasOwnProperty.call(req, "route")) return;
  let value: unknown;
  let seen = false;
  Object.defineProperty(req, "route", {
    configurable: true,
    enumerable: true,
    get: () => value,
    set: (next: unknown) => {
      value = next;
      if (seen || !next) return;
      seen = true;
      span.setAttribute(ATTR_ROUTED_MS, Math.max(0, performance.now() - startedAt));
    },
  });
}
