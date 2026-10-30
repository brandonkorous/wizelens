import { afterEach, expect, it, vi } from "vitest";
import { disabledWizeLens } from "./disabled.js";

afterEach(() => vi.restoreAllMocks());

it("says it sends nothing when the production default turns it off while a hub is set", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  disabledWizeLens({ service: "panaderia-pedidos", endpoint: "http://localhost:5970" }, "/_wizelens");
  expect(warn.mock.calls[0]?.[0]).toContain("Off in production, so nothing is sent to http://localhost:5970");
});

it("stays quiet as the auto install's stand-in, which is not the app's choice", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  disabledWizeLens({ service: "auto", endpoint: "http://localhost:5970" }, "/_wizelens", true);
  expect(warn).not.toHaveBeenCalled();
});
