import { hrTimeToMilliseconds } from "@opentelemetry/core";
import { BasicTracerProvider, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { expect, it } from "vitest";
import { preciseProvider, preciseTracer } from "./precise.js";

const ended: ReadableSpan[] = [];
const provider = new BasicTracerProvider({
  spanProcessors: [{ onStart() {}, onEnd: (s) => ended.push(s), forceFlush: async () => {}, shutdown: async () => {} }],
});

it("keeps sub-ms order for spans started in the same ms", () => {
  ended.length = 0;
  const tracer = preciseTracer(provider.getTracer("t"));
  const a = tracer.startSpan("a");
  const b = tracer.startSpan("b");
  b.end();
  a.end();
  const [sb, sa] = ended.map((s) => hrTimeToMilliseconds(s.startTime));
  expect(sb!).toBeGreaterThan(sa!);
  expect(hrTimeToMilliseconds(ended[1]!.endTime)).toBeGreaterThanOrEqual(hrTimeToMilliseconds(ended[0]!.endTime));
});

it("wraps tracers handed out by a provider", () => {
  ended.length = 0;
  preciseProvider(provider).getTracer("t").startSpan("x").end();
  const start = hrTimeToMilliseconds(ended[0]!.startTime);
  expect(Math.abs(start - (performance.timeOrigin + performance.now()))).toBeLessThan(1000);
});

it("gives startActiveSpan exact times in every call form", () => {
  ended.length = 0;
  const tracer = preciseTracer(provider.getTracer("t"));
  const out = tracer.startActiveSpan("outer", (outer) => {
    tracer.startActiveSpan("inner", { attributes: { k: 1 } }, (inner) => inner.end());
    outer.end();
    return 42;
  });
  expect(out).toBe(42);
  const [inner, outer] = ended;
  expect(inner!.attributes.k).toBe(1);
  expect(hrTimeToMilliseconds(inner!.startTime)).toBeGreaterThan(hrTimeToMilliseconds(outer!.startTime));
  expect(hrTimeToMilliseconds(outer!.endTime)).toBeGreaterThanOrEqual(hrTimeToMilliseconds(inner!.endTime));
});
