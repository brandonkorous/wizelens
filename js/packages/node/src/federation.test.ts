import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { isTracingSuppressed } from "@opentelemetry/core";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { fetchRemote } from "./federation.js";

beforeAll(() => context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable()));
afterAll(() => context.disable());
afterEach(() => vi.unstubAllGlobals());

it("asks a remote with tracing off, so no wrapper (Next.js fetch) records the call", async () => {
  const suppressed: boolean[] = [];
  vi.stubGlobal("fetch", async () => {
    suppressed.push(isTracingSuppressed(context.active()));
    return new Response(JSON.stringify({ traceId: "a".repeat(32), spans: [] }));
  });
  await fetchRemote("http://other.test/_wizelens", "a".repeat(32), 0);
  expect(suppressed).toEqual([true]);
});
