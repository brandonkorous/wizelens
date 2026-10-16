import { expect, it } from "vitest";
import { makeRequest } from "../testing/fixtures.js";
import { alertBreached, alertMessage, alertValue } from "./alerts.js";

const ok = makeRequest({ serverMs: 40 });
const failed = makeRequest({ status: 500, error: { type: "DbError", message: "down" } });

it("measures alert metrics over a window", () => {
  expect(alertValue("error_rate", [ok, failed], [])).toBe(50);
  expect(alertValue("requests", [ok, failed], [])).toBe(2);
  expect(alertValue("new_errors", [failed], [])).toBe(1);
  expect(alertValue("new_errors", [failed], [failed])).toBe(0);
  expect(alertValue("p95_ms", [], [])).toBeNull();
});

it("fires on breaches, and on silence only for low traffic", () => {
  expect(alertBreached("error_rate", ">", 50, 5)).toBe(true);
  expect(alertBreached("p95_ms", ">", null, 100)).toBe(false);
  expect(alertBreached("requests", "<", null, 1)).toBe(true);
  expect(alertMessage("error_rate", ">", 7.5, 5)).toBe("Error rate is 7.5% (above 5%)");
});
