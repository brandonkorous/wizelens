import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { startHub } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

const DAY = 86_400_000;

it("answers a named range at the kept age at any minute of the hour, and refuses an older custom window", async () => {
  let url: string;
  const now = 1_800_000_000_000 + 45 * 60_000;
  ({ hub, url } = await startHub({ now: () => now, maxAgeMs: 30 * DAY }));
  expect((await fetch(`${url}/_wizelens/api/models/overview?range=30d`)).status).toBe(200);
  expect((await fetch(`${url}/_wizelens/api/models/overview?from=${now - 31 * DAY}&to=${now}`)).status).toBe(400);
});
