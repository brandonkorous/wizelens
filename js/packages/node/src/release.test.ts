import { afterEach, describe, expect, it, vi } from "vitest";
import { VERSION_ATTR } from "@wizeworks/lens-core";
import { releaseOf } from "./hub-connect.js";
import { TraceStore } from "./store.js";
import { createTracing } from "./tracing.js";

afterEach(() => vi.unstubAllEnvs());

describe("release", () => {
  it("puts the app's version on every span", async () => {
    const store = new TraceStore({ maxTraces: 10 });
    const { tracer, provider } = createTracing(store, { service: "api", version: "0.3.0", release: "5.1.0", redactKeys: [], fetch: false, http: false }, new Set());
    tracer.startSpan("work").end();
    await provider.forceFlush();
    expect(store.all()[0]!.spans[0]!.attributes[VERSION_ATTR]).toBe("5.1.0");
  });

  it("comes from the option, then WIZELENS_RELEASE, then OTEL_SERVICE_VERSION, then npm_package_version", () => {
    vi.stubEnv("WIZELENS_RELEASE", "");
    vi.stubEnv("OTEL_SERVICE_VERSION", "");
    vi.stubEnv("npm_package_version", "1.0.0");
    expect(releaseOf({ serviceName: "api" })).toBe("1.0.0");
    vi.stubEnv("OTEL_SERVICE_VERSION", "1.5.0");
    expect(releaseOf({ serviceName: "api" })).toBe("1.5.0");
    vi.stubEnv("WIZELENS_RELEASE", "2.0.0");
    expect(releaseOf({ serviceName: "api" })).toBe("2.0.0");
    expect(releaseOf({ serviceName: "api", release: "3.0.0" })).toBe("3.0.0");
  });
});
