import { gzipSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { type ResolvedFrame, SOURCEMAP_RELEASES_KEPT } from "@wizeworks/lens-core";
import { CART_FILE, CART_MAP, CART_STACK } from "../../core/src/testing/sourcemap.js";
import type { Cloud } from "./server.js";
import { settleCloud } from "./settle.js";
import { setupOwner, startCloud } from "./test/cloud.js";
import { span } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const NOW = 1_800_000_000_000;

const browserError = (spanId: string) =>
  span("e".repeat(32), spanId, {
    name: "Error: Coupon code is empty",
    category: "browser",
    service: "browser",
    status: "error",
    startMs: NOW - 60_000,
    attributes: { "wizelens.browser.type": "error", "service.version": "2.0.0" },
    events: [{ name: "exception", timeMs: NOW - 60_000, attributes: { "exception.type": "Error", "exception.message": "Coupon code is empty", "exception.stacktrace": CART_STACK } }],
  });

it("takes maps with an ingest key, groups browser errors by them, and resolves stacks for the dashboard", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => NOW }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const auth = { Authorization: `Bearer ${key}` };
  const upload = (release: string, headers: Record<string, string> = auth, body: string | Buffer = CART_MAP) =>
    fetch(`${url}/_wizelens/api/sourcemaps?release=${release}&file=${CART_FILE}`, { method: "POST", headers, body });

  expect((await upload("2.0.0", { Authorization: "Bearer wl_ik_wrong" })).status).toBe(401);
  expect((await upload("2.0.0", { ...auth, "Content-Encoding": "gzip" }, gzipSync(CART_MAP))).status).toBe(201);
  expect((await upload("2.0.0", auth, "{}")).status).toBe(400);
  const listed = (await (await fetch(`${url}/_wizelens/api/sourcemaps?release=2.0.0`, { headers: auth })).json()) as { maps: { file: string; bytes: number }[] };
  expect(listed.maps).toEqual([expect.objectContaining({ file: CART_FILE, bytes: CART_MAP.length })]);

  await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: auth, body: JSON.stringify({ sender: { service: "web-api" }, spans: [browserError("1".repeat(16))] }) });
  await settleCloud(cloud.app.db, NOW + 10_000);
  const errors = await owner.call<{ groups: { key: string }[] }>("GET", `api/models/errors?project=${projectId}&range=24h`);
  expect(errors.body.groups.map((g) => g.key)).toEqual(["Web App|Error|Coupon code is empty|src/cart.ts:applyCoupon"]);

  const resolved = await owner.call<{ frames: ResolvedFrame[] }>("POST", `api/sourcemaps/resolve?project=${projectId}`, { stack: CART_STACK, release: "2.0.0" });
  expect(resolved.body.frames[0]).toMatchObject({ source: "src/cart.ts", line: 3, fn: "applyCoupon" });
  expect(resolved.body.frames[0]!.context?.lines.join("\n")).toContain("throw new Error");
  const info = await owner.call<{ capabilities: string[] }>("GET", "api/info");
  expect(info.body.capabilities).toContain("sourcemaps");
});

it("keeps only the newest releases of a project", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => NOW }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  for (let i = 0; i <= SOURCEMAP_RELEASES_KEPT; i++) {
    await fetch(`${url}/_wizelens/api/sourcemaps?release=r${String(i).padStart(2, "0")}&file=${CART_FILE}`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: CART_MAP });
  }
  const rows = await cloud.app.db.query<{ release: string }>("SELECT DISTINCT release FROM sourcemaps WHERE project_id = $1", [projectId]);
  expect(rows).toHaveLength(SOURCEMAP_RELEASES_KEPT);
  expect(rows.some((r) => r.release === "r00")).toBe(false);
});

it("resolves a browser error on another project's trace page by the project the error's span was sent to", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => NOW }));
  const { owner, orgId, projectId: web } = await setupOwner(cloud, url);
  const api = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "API" })).body.id;
  const keyOf = async (id: string) => ({ Authorization: `Bearer ${(await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [id] })).body.token}` });
  const [webAuth, apiAuth] = [await keyOf(web), await keyOf(api)];
  await fetch(`${url}/_wizelens/api/sourcemaps?release=2.0.0&file=${CART_FILE}`, { method: "POST", headers: webAuth, body: CART_MAP });
  const send = (headers: Record<string, string>, service: string, spans: unknown[]) => fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers, body: JSON.stringify({ sender: { service }, spans }) });
  await send(webAuth, "browser", [browserError("1".repeat(16))]);
  await send(apiAuth, "api", [span("e".repeat(32), "2".repeat(16), { service: "api", parentSpanId: "1".repeat(16), startMs: NOW - 59_000 })]);
  const resolve = async (body: Record<string, unknown>) =>
    (await owner.call<{ frames: ResolvedFrame[] }>("POST", `api/sourcemaps/resolve?project=${api}`, { stack: CART_STACK, release: "2.0.0", ...body })).body.frames[0]!;
  expect((await resolve({})).source).toBeNull();
  expect(await resolve({ traceId: "e".repeat(32), spanId: "1".repeat(16) })).toMatchObject({ source: "src/cart.ts", fn: "applyCoupon" });
  expect((await resolve({ traceId: "e".repeat(32), spanId: "2".repeat(16) })).source).toBeNull();
});
