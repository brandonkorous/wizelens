import { afterEach, describe, expect, it } from "vitest";
import type { SecurityModel } from "@wizeworks/lens-core";
import type { Hub } from "../hub.js";
import { post, startHub } from "../test/helpers.js";
import { runPackageRound } from "./loop.js";
import { sqlitePackages } from "./sqlite.js";

let hub: Hub;
afterEach(() => hub?.close());

const VULN = {
  id: "GHSA-29mw-wpgm-hmr9",
  summary: "Prototype pollution in lodash",
  aliases: ["CVE-2020-8203"],
  modified: "2024-01-01T00:00:00Z",
  database_specific: { severity: "HIGH" },
  affected: [{ package: { ecosystem: "npm", name: "lodash" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.19" }] }] }],
};

/** A fake OSV: lodash 4.17.15 has one advisory, everything else none. Counts the calls. */
function fakeOsv() {
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push(url);
    if (url.endsWith("/v1/querybatch")) {
      const { queries } = JSON.parse(String(init?.body)) as { queries: { package: { name: string }; version: string }[] };
      const results = queries.map((q) => (q.package.name === "lodash" && q.version === "4.17.15" ? { vulns: [{ id: VULN.id }] } : {}));
      return Response.json({ results });
    }
    return url.endsWith(`/v1/vulns/${VULN.id}`) ? Response.json(VULN) : new Response("not found", { status: 404 });
  };
  return { calls, fetcher };
}

const report = (packages: unknown[], service = "shop-api") => ({ sender: { service, project: "shop" }, packages });

describe("hub packages", () => {
  it("keeps a report, checks it against OSV, and shows the risk on the Security page", async () => {
    const osv = fakeOsv();
    let url: string;
    ({ hub, url } = await startHub({ fetch: osv.fetcher as typeof fetch, osvUrl: "https://osv.test" }));
    expect((await (await fetch(`${url}/_wizelens/api/info`)).json()).capabilities).toContain("packages");
    const pkgs = [{ ecosystem: "npm", name: "lodash", version: "4.17.15" }, { ecosystem: "npm", name: "express", version: "4.21.0" }];
    expect((await post(`${url}/_wizelens/api/packages`, report(pkgs))).status).toBe(204);
    await runPackageRound(sqlitePackages(hub.data.store.db), { fetch: osv.fetcher, osvUrl: "https://osv.test", now: Date.now });
    expect(osv.calls).toEqual(["https://osv.test/v1/querybatch", `https://osv.test/v1/vulns/${VULN.id}`]);
    const m = (await (await fetch(`${url}/_wizelens/api/models/security?project=shop&range=24h`)).json()) as SecurityModel;
    const g = m.groups.find((x) => x.kind === "vulnerable-package")!;
    expect(g).toMatchObject({ owasp: "A03", severity: "error", shape: "npm lodash@4.17.15", endpoints: ["shop-api"] });
    expect(g.advisories![0]).toMatchObject({ id: VULN.id, aliases: ["CVE-2020-8203"], fixed: ["4.17.19"], url: `https://osv.dev/vulnerability/${VULN.id}` });
    expect(m.scan).toMatchObject({ packages: 2, services: 1 });
    await runPackageRound(sqlitePackages(hub.data.store.db), { fetch: osv.fetcher, osvUrl: "https://osv.test", now: Date.now });
    expect(osv.calls).toHaveLength(2);
  });

  it("replaces a service's set, and refuses a bad report", async () => {
    let url: string;
    ({ hub, url } = await startHub({ osv: false }));
    expect((await (await fetch(`${url}/_wizelens/api/info`)).json()).capabilities).not.toContain("packages");
    await post(`${url}/_wizelens/api/packages`, report([{ ecosystem: "npm", name: "a", version: "1.0.0" }, { ecosystem: "npm", name: "b", version: "1.0.0" }]));
    await post(`${url}/_wizelens/api/packages`, report([{ ecosystem: "npm", name: "b", version: "1.0.0" }, { ecosystem: "bogus", name: "c", version: "1" }]));
    const rows = await sqlitePackages(hub.data.store.db).list("shop");
    expect(rows.map((r) => `${r.name}@${r.version}`)).toEqual(["b@1.0.0"]);
    expect((await post(`${url}/_wizelens/api/packages`, { packages: [] })).status).toBe(400);
    expect((await post(`${url}/_wizelens/api/packages`, { sender: { service: "s" }, packages: "x" })).status).toBe(400);
  });
});
