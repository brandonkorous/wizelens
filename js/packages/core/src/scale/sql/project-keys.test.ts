import { describe, expect, it } from "vitest";
import { joinKey } from "../kinds.js";
import { labelKey, unlabelKey, unlabelPieces } from "./project-keys.js";

const labels = { p1: "Shop", p2: "Shop Admin" };

describe("Project labels on service keys", () => {
  it("label each service part, and only service kinds", () => {
    expect(labelKey("svc", "api:orders", "Shop")).toBe("api:orders · Shop");
    expect(labelKey("edge", joinKey("api:web", "api:orders"), "Shop")).toBe(joinKey("api:web · Shop", "api:orders · Shop"));
    expect(labelKey("err.g", "orders|TypeError|boom #", "Shop")).toBe("orders · Shop|TypeError|boom #");
    expect(labelKey("req@svc", joinKey("orders", "GET /x"), "Shop")).toBe(joinKey("orders · Shop", "GET /x"));
    expect(labelKey("db.op", "SELECT", "Shop")).toBe("SELECT");
    expect(labelKey("svc", "", "Shop")).toBe("");
  });

  it("read a shown key back to its project, the longest label first", () => {
    expect(unlabelKey("svc", "api:orders · Shop Admin", labels)).toEqual({ project: "p2", key: "api:orders" });
    expect(unlabelKey("err.g", "orders · Shop|TypeError|boom", labels)).toEqual({ project: "p1", key: "orders|TypeError|boom" });
    expect(unlabelKey("svc.ep", joinKey("api:orders · Shop", ""), labels)).toEqual({ project: "p1", key: joinKey("api:orders", "") });
    expect(unlabelKey("svc", "api:orders", labels)).toEqual({ project: null, key: "api:orders" });
    expect(unlabelPieces("edge", [null, "api:orders · Shop"], labels)).toEqual({ project: "p1", pieces: [null, "api:orders"] });
  });
});
