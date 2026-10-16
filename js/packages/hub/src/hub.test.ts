import { afterEach, describe, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { post, span, startHub, T1 } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

const sender = { service: "gateway", environment: "Development", endpoint: "http://localhost:5100/_wizelens" };

describe("hub API", () => {
  it("says it is a hub", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const info = await (await fetch(`${url}/_wizelens/api/info`)).json();
    expect(info).toMatchObject({ mode: "hub", capabilities: expect.arrayContaining(["registry", "environments"]) });
  });

  it("stores batches and hides remotes it already has", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const remotes = [{ traceId: T1, endpoint: "http://localhost:5100/_wizelens" }, { traceId: T1, endpoint: "http://localhost:9999/_wizelens" }];
    expect((await post(`${url}/_wizelens/api/ingest`, { sender, spans: [span(T1, "1".repeat(16))], remotes })).status).toBe(204);
    const list = (await (await fetch(`${url}/_wizelens/api/traces?full=true&env=Development`)).json()) as { remotes: string[] }[];
    expect(list).toHaveLength(1);
    expect(list[0]!.remotes).toEqual(["http://localhost:9999/_wizelens"]);
    const summaries = await (await fetch(`${url}/_wizelens/api/traces?env=QA`)).json();
    expect(summaries).toEqual([]);
  });

  it("rejects a batch without a sender", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    expect((await post(`${url}/_wizelens/api/ingest`, { spans: [] })).status).toBe(400);
  });

  it("needs the token when one is set", async () => {
    let url: string;
    ({ hub, url } = await startHub({ token: "s3cret" }));
    expect((await fetch(`${url}/_wizelens/api/info`)).status).toBe(401);
    expect((await fetch(`${url}/_wizelens/api/info`, { headers: { Authorization: "Bearer s3cret" } })).status).toBe(200);
    expect((await post(`${url}/v1/traces`, {})).status).toBe(401);
    expect((await fetch(`${url}/_wizelens/`)).status).toBe(401);
    const link = await fetch(`${url}/_wizelens/?token=s3cret`, { redirect: "manual" });
    expect(link.status).toBe(302);
    const cookie = link.headers.get("set-cookie")!.split(";")[0]!;
    expect((await fetch(`${url}/_wizelens/api/info`, { headers: { Cookie: cookie } })).status).toBe(200);
    const wrong = await fetch(`${url}/_wizelens/?token=nope`, { redirect: "manual" });
    expect(wrong.headers.get("location")).toContain("denied=1");
  });

  it("answers the health check and sends / to the dashboard", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    expect(await (await fetch(`${url}/healthz`)).text()).toBe("ok");
    expect((await fetch(`${url}/`, { redirect: "manual" })).headers.get("location")).toBe("/_wizelens/");
  });
});
