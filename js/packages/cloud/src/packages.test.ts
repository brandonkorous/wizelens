import { afterEach, expect, it } from "vitest";
import { checkPackages } from "@wizeworks/lens-hub/kit";
import type { SecurityModel } from "@wizeworks/lens-core";
import { pgPackages } from "./repo/packages.js";
import type { Cloud } from "./server.js";
import { setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const NOW = 1_800_000_000_000;
const VULN = { id: "GHSA-test-0001", summary: "Bad", aliases: ["CVE-2026-1"], database_specific: { severity: "MODERATE" }, affected: [{ package: { ecosystem: "PyPI", name: "requests" }, ranges: [{ events: [{ fixed: "2.32.0" }] }] }] };

const osv = async (url: string): Promise<Response> =>
  url.endsWith("/v1/querybatch") ? Response.json({ results: [{ vulns: [{ id: VULN.id }] }] }) : Response.json(VULN);

it("takes packages with an ingest key, checks them, and lists the risk on the Security page", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => NOW, osv: false }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const body = JSON.stringify({ sender: { service: "orders", project: "someone-else" }, packages: [{ ecosystem: "PyPI", name: "requests", version: "2.31.0" }] });
  expect((await fetch(`${url}/_wizelens/api/packages`, { method: "POST", body })).status).toBe(401);
  expect((await fetch(`${url}/_wizelens/api/packages`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body })).status).toBe(204);
  expect(await checkPackages(pgPackages(cloud.app.db), osv as typeof fetch, NOW, "https://osv.test")).toEqual({ checked: 1, advisories: 1 });
  const m = (await owner.call<SecurityModel>("GET", `api/models/security?project=${projectId}&range=24h`)).body;
  expect(m.groups).toContainEqual(expect.objectContaining({ kind: "vulnerable-package", owasp: "A03", severity: "warning", shape: "PyPI requests@2.31.0", endpoints: ["orders"] }));
  expect(m.scan).toEqual({ packages: 1, services: 1, checkedMs: NOW });
});
