import { describe, expect, it, vi } from "vitest";
import { envKeepSlowMs, envRedactKeys } from "./env-defaults.js";

describe("env defaults", () => {
  it("reads WIZELENS_KEEP_SLOW_MS: blank is unset, off is null, a bad value warns", () => {
    expect(envKeepSlowMs({})).toBeUndefined();
    expect(envKeepSlowMs({ WIZELENS_KEEP_SLOW_MS: "  " })).toBeUndefined();
    expect(envKeepSlowMs({ WIZELENS_KEEP_SLOW_MS: "Off" })).toBeNull();
    expect(envKeepSlowMs({ WIZELENS_KEEP_SLOW_MS: "1500" })).toBe(1500);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(envKeepSlowMs({ WIZELENS_KEEP_SLOW_MS: "slow" })).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("splits WIZELENS_REDACT_KEYS on commas", () => {
    expect(envRedactKeys({})).toEqual([]);
    expect(envRedactKeys({ WIZELENS_REDACT_KEYS: " SSN, account_no ,," })).toEqual(["ssn", "account_no"]);
  });
});
