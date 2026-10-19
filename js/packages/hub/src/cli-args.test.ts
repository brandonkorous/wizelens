import { describe, expect, it } from "vitest";
import { optionsFromArgs, parseDuration } from "./cli-args.js";

describe("hub command line", () => {
  it("reads durations", () => {
    expect(parseDuration("30m")).toBe(1_800_000);
    expect(parseDuration("7d")).toBe(604_800_000);
    expect(parseDuration("1500")).toBe(1500);
    expect(parseDuration("soon")).toBeUndefined();
  });

  it("prefers flags, then environment variables", () => {
    const env = { WIZELENS_HUB_PORT: "7000", WIZELENS_HUB_TOKEN: "t", WIZELENS_HUB_MCP: "1", WIZELENS_HUB_RETENTION: "2d", WIZELENS_HUB_MAX_METRIC_POINTS: "900" };
    expect(optionsFromArgs(["--port", "6000", "--data", "memory"], env)).toMatchObject({
      port: 6000,
      storagePath: "memory",
      token: "t",
      enableMcp: true,
      maxAgeMs: 172_800_000,
      maxMetricPoints: 900,
    });
    expect(optionsFromArgs(["--log-retention", "3d"], { WIZELENS_HUB_LOG_RETENTION: "1d" })).toMatchObject({ logMaxAgeMs: 259_200_000 });
    expect(optionsFromArgs([], { WIZELENS_HUB_LOG_RETENTION: "1d" })).toMatchObject({ logMaxAgeMs: 86_400_000 });
    expect(optionsFromArgs(["--help"], {})).toBe("help");
  });
});
