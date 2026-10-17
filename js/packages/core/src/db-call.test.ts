import { describe, expect, it } from "vitest";
import { isDbCall } from "./attributes.js";

describe("isDbCall", () => {
  it("finds a database call by any OTel db attribute", () => {
    expect(isDbCall({ "db.system.name": "postgresql" })).toBe(true);
    expect(isDbCall({ "db.operation.name": "findOne", "db.collection.name": "session" })).toBe(true);
    expect(isDbCall({ "db.query.text": "select 1" })).toBe(true);
  });

  it("ignores spans with no db attribute", () => {
    expect(isDbCall({ "http.route": "/get-session" })).toBe(false);
    expect(isDbCall({ "db.system.name": null })).toBe(false);
  });
});
