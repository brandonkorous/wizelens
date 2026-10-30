import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VERSION_ATTR } from "@wizeworks/lens-core";
import { hudTag } from "./hud-bundle.js";
import { releaseOf } from "./hub-connect.js";
import { packageVersionAt, RELEASE_ENV, resetReleaseCache } from "./release.js";
import { TraceStore } from "./store.js";
import { createTracing } from "./tracing.js";

afterEach(() => {
  vi.unstubAllEnvs();
  resetReleaseCache();
});

const clearEnv = () => RELEASE_ENV.forEach((k) => vi.stubEnv(k, ""));

function appWith(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), "wl-release-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", version }));
  mkdirSync(join(dir, "dist", "node_modules", "next", "bin"), { recursive: true });
  writeFileSync(join(dir, "dist", "node_modules", "next", "package.json"), JSON.stringify({ name: "next", version: "15.0.0" }));
  return dir;
}

describe("release", () => {
  it("puts the app's version on every span", async () => {
    const store = new TraceStore({ maxTraces: 10 });
    const { tracer, provider } = createTracing(store, { service: "api", version: "0.3.0", release: "5.1.0", redactKeys: [], fetch: false, http: false }, new Set());
    tracer.startSpan("work").end();
    await provider.forceFlush();
    expect(store.all()[0]!.spans[0]!.attributes[VERSION_ATTR]).toBe("5.1.0");
  });

  it("comes from the option, then WIZELENS_RELEASE, then OTEL_SERVICE_VERSION, then npm_package_version", () => {
    clearEnv();
    vi.stubEnv("npm_package_version", "1.0.0");
    expect(releaseOf({ service: "api" })).toBe("1.0.0");
    vi.stubEnv("OTEL_SERVICE_VERSION", "1.5.0");
    expect(releaseOf({ service: "api" })).toBe("1.5.0");
    vi.stubEnv("WIZELENS_RELEASE", "2.0.0");
    expect(releaseOf({ service: "api" })).toBe("2.0.0");
    expect(releaseOf({ service: "api", release: "3.0.0" })).toBe("3.0.0");
  });

  it("reads the commit a host sets when nothing else names a release", () => {
    clearEnv();
    vi.stubEnv("npm_package_version", "1.0.0");
    vi.stubEnv("GIT_SHA", "abc1234");
    expect(releaseOf({})).toBe("abc1234");
    vi.stubEnv("SOURCE_VERSION", "def5678");
    expect(releaseOf({})).toBe("def5678");
  });

  it("falls back to the app's own package.json under `node server.js`", () => {
    clearEnv();
    const dir = appWith("4.2.0");
    expect(packageVersionAt(join(dir, "dist"))).toBe("4.2.0");
    expect(packageVersionAt(join(dir, "dist", "node_modules", "next", "bin"))).toBe("4.2.0");
    vi.spyOn(process, "cwd").mockReturnValue(join(dir, "dist"));
    const argv = process.argv;
    process.argv = [argv[0]!];
    try {
      expect(releaseOf({})).toBe("4.2.0");
    } finally {
      process.argv = argv;
    }
  });

  it("goes in the injected HUD tag", () => {
    expect(hudTag("/_wizelens", { release: 'a"1' })).toContain('data-release="a&quot;1"');
  });
});
