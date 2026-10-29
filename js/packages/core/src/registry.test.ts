import { describe, expect, it } from "vitest";
import type { HubService } from "./hub.js";
import { groupKeyOf, groupServices, isOldInstance, OLD_INSTANCE_MS } from "./registry.js";

const NOW = 10 * OLD_INSTANCE_MS;
const pod = (host: string, lastSeenMs: number, extra: Partial<HubService> = {}): HubService => ({
  service: "api",
  environment: "prod",
  host,
  via: "addon",
  firstSeenMs: 0,
  lastSeenMs,
  online: NOW - lastSeenMs <= 30_000,
  ...extra,
});

describe("groupServices", () => {
  it("leaves out the uptime runner, which is not an app", () => {
    expect(groupServices([pod("api-1a2b", NOW), pod("cloud", NOW, { service: "wizelens-uptime" })]).map((g) => g.service)).toEqual(["api"]);
  });

  it("makes one group per service and environment, with hosts newest first", () => {
    const groups = groupServices([pod("api-1a2b", NOW - 60_000), pod("api-3c4d", NOW), pod("api-5e6f", NOW, { environment: "staging" })]);
    expect(groups.map((g) => [g.environment, g.instances.length, g.online])).toEqual([["prod", 2, 1], ["staging", 1, 1]]);
    expect(groups[0]!.instances.map((s) => s.host)).toEqual(["api-3c4d", "api-1a2b"]);
    expect(groups[0]!.newest.host).toBe("api-3c4d");
  });

  it("keeps projects apart", () => {
    const groups = groupServices([pod("a", NOW, { project: "shop" }), pod("b", NOW, { project: "admin" })]);
    expect(groups).toHaveLength(2);
    expect(groupKeyOf(groups[0]!.newest)).not.toBe(groupKeyOf(groups[1]!.newest));
  });

  it("puts the group heard from most recently first", () => {
    const groups = groupServices([pod("w", NOW - 5_000, { service: "worker" }), pod("a", NOW)]);
    expect(groups.map((g) => g.service)).toEqual(["api", "worker"]);
  });

  it("is empty for no rows", () => {
    expect(groupServices([])).toEqual([]);
  });
});

describe("isOldInstance", () => {
  it("is true only for hosts offline longer than a day", () => {
    expect(isOldInstance(pod("a", NOW), NOW)).toBe(false);
    expect(isOldInstance(pod("b", NOW - OLD_INSTANCE_MS), NOW)).toBe(false);
    expect(isOldInstance(pod("c", NOW - OLD_INSTANCE_MS - 1), NOW)).toBe(true);
  });
});
