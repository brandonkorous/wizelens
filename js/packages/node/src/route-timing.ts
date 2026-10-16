import type { Span as OtelSpan } from "@opentelemetry/api";
import { ATTR_ROUTED_MS } from "@wizeworks/lens-core";

/** Record `wizelens.server.routed_ms` when the router sets `target[property]`: the moment the matched route starts. */
export function watchRoute(target: object, property: string, span: OtelSpan, startedAt: number): void {
  if (Object.prototype.hasOwnProperty.call(target, property)) return;
  let value: unknown;
  let seen = false;
  Object.defineProperty(target, property, {
    configurable: true,
    enumerable: true,
    get: () => value,
    set: (next: unknown) => {
      value = next;
      if (seen || !next) return;
      seen = true;
      markRouted(span, startedAt);
    },
  });
}

/** Record the routing time now. */
export function markRouted(span: OtelSpan, startedAt: number): void {
  span.setAttribute(ATTR_ROUTED_MS, Math.max(0, performance.now() - startedAt));
}
