import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { type Client, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
let owner: Client;

beforeEach(async () => {
  let url: string;
  ({ cloud, url } = await startCloud());
  ({ owner } = await setupOwner(cloud, url));
});

afterEach(async () => {
  await cloud?.close();
});

const prefs = async () => (await owner.call<{ prefs: Record<string, string> }>("GET", "api/me")).body.prefs;

describe("preferences on the account", () => {
  it("keeps the choices sent and leaves the others", async () => {
    expect(await prefs()).toEqual({});
    expect((await owner.call("PATCH", "api/me/prefs", { theme: "dark", clock: "24" })).status).toBe(200);
    expect((await owner.call("PATCH", "api/me/prefs", { range: "7d" })).status).toBe(200);
    expect(await prefs()).toEqual({ theme: "dark", clock: "24", range: "7d" });
  });

  it("refuses a value that is not one of the choices", async () => {
    const res = await owner.call<{ error: string }>("PATCH", "api/me/prefs", { theme: "neon" });
    expect([res.status, JSON.stringify(res.body)]).toEqual([400, expect.stringMatching(/That theme is not one of the choices/)]);
    expect(await prefs()).toEqual({});
  });
});
