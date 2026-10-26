import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { chClient } from "./telemetry/ch/http.js";
import { concurrencyOf, DEFAULT_CH_CONCURRENCY, Limiter, sharedLimiter } from "./telemetry/ch/limiter.js";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the ClickHouse call limiter", () => {
  it("never runs more than its slots, and runs every call", async () => {
    const limiter = new Limiter(4);
    let running = 0;
    let most = 0;
    const done = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        limiter.run(async () => {
          most = Math.max(most, ++running);
          await tick(i % 3);
          running--;
          return i;
        }),
      ),
    );
    expect(done).toHaveLength(50);
    expect(most).toBe(4);
    expect(limiter.peak).toBe(4);
    expect(limiter.load).toEqual({ active: 0, waiting: 0 });
  });

  it("frees the slot of a call that failed", async () => {
    const limiter = new Limiter(1);
    await expect(limiter.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await limiter.run(async () => "next")).toBe("next");
  });

  it("reads its size from WIZELENS_CLOUD_CLICKHOUSE_CONCURRENCY, else 24", () => {
    expect([concurrencyOf("8"), concurrencyOf(undefined), concurrencyOf("0"), concurrencyOf("x")]).toEqual([8, DEFAULT_CH_CONCURRENCY, 24, 24]);
    expect(sharedLimiter()).toBe(sharedLimiter());
  });
});

describe("the ClickHouse client under a burst", () => {
  let inFlight = 0;
  let peak = 0;
  const server: Server = createServer((req, res) => {
    peak = Math.max(peak, ++inFlight);
    req.resume();
    setTimeout(() => {
      inFlight--;
      res.writeHead(200, { "Content-Type": "text/plain" }).end('{"n":1}\n');
    }, 5);
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("keeps 1200 reads fired at once to the cap at the server", async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://wizelens:x@127.0.0.1:${(server.address() as AddressInfo).port}/wizelens`;
    const ch = chClient({ url, limiter: new Limiter(16) });
    const rows = await Promise.all(Array.from({ length: 1200 }, () => ch.query<{ n: number }>("SELECT 1 AS n")));
    expect(rows.every((r) => r[0]?.n === 1)).toBe(true);
    expect(peak).toBeLessThanOrEqual(16);
    expect(peak).toBeGreaterThan(1);
  });
});
