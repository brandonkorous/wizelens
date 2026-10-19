import { afterAll, describe, expect, it } from "vitest";
import { CH_URL, type ChTest, chTest } from "./test/ch.js";
import { chClient } from "./telemetry/ch/http.js";

const opened: ChTest[] = [];
afterAll(async () => Promise.all(opened.map((t) => t.drop())));

describe.skipIf(!CH_URL)("ClickHouse settle inserts", () => {
  it("land once when a labeled insert is sent again, and twice under two labels", async () => {
    const t = await chTest();
    opened.push(t);
    const ch = chClient({ url: t.url });
    const row = { project_id: "p", env: "", kind: "svc", key: "api", bucket_ms: 1_000_000, n: 1, err: 0, sum_v: 5, c0: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, first_ms: 1, last_ms: 2, top_rank: 0, expire_ms: 9e12 };
    const send = (token: string) => ch.insert("rollup_1h_t (project_id, env, kind, key, bucket_ms, n, err, sum_v, c0, c1, c2, c3, c4, c5, first_ms, last_ms, top_rank, expire_ms)", [row], { insert_deduplication_token: token });
    await send("batch-1:p:rollup_1h");
    await send("batch-1:p:rollup_1h");
    const sum = async () => Number((await ch.query<{ n: number }>("SELECT sum(n) AS n FROM rollup_1h_t WHERE project_id = 'p'"))[0]!.n);
    expect(await sum()).toBe(1);
    await send("batch-2:p:rollup_1h");
    expect(await sum()).toBe(2);
  });
});
