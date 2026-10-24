import { describe, expect, it } from "vitest";
import { isBotRequest, isScannerPath, plainPath } from "./bots.js";

describe("scanner paths hidden with percent codes", () => {
  it("decodes them, drops control characters, and collapses slashes", () => {
    expect(plainPath("/%00api/%00shared/%00.env")).toBe("/api/shared/.env");
    expect(plainPath("/%2500.git%252Fconfig")).toBe("/.git/config");
    expect(plainPath("//wp-login.php?x=%00")).toBe("/wp-login.php");
  });

  it("match the scanner rule like the plain paths", () => {
    for (const p of ["/%00.env.swp", "/%00api1/%00.env", "/%2e%65nv", "/%00wp-admin/setup.php", "/%2E%67it/config"]) expect(isScannerPath(p)).toBe(true);
    for (const p of ["/%00aws.json", "/api/orders/%00", "/environment", "/docs/%25"]) expect(isScannerPath(p)).toBe(false);
    expect(isBotRequest({ userAgent: "Mozilla/5.0 Chrome/155.0", path: "/%00.envs/%00.env" })).toBe(true);
  });
});
