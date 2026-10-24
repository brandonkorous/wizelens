import { describe, expect, it } from "vitest";
import { headerAttributes } from "./request-attributes.js";

describe("header attributes", () => {
  it("keeps a long session cookie's flags: its value is hidden before the length cut", () => {
    const cookie = `__Secure-app.session_data=${"x".repeat(3000)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
    const value = headerAttributes({ "set-cookie": [cookie, "theme=dark; Path=/"] }, "h.")["h.set-cookie"];
    expect(value).toBe("__Secure-app.session_data=[redacted]; Path=/; HttpOnly; Secure; SameSite=Lax, theme=[redacted]; Path=/");
  });
});
