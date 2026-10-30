import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { ATTR_ERROR_FRAME, type ResolvedFrame, SOURCEMAP_RELEASES_KEPT } from "@wizeworks/lens-core/internal";
import { CART_FILE, CART_MAP, CART_STACK } from "../../core/src/testing/sourcemap.js";
import type { Hub } from "./hub.js";
import { listSourceMaps } from "./sourcemaps.js";
import { post, span, startHub, T1 } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

const upload = (url: string, release: string, body: string | Buffer, headers: Record<string, string> = {}, project = "") =>
  fetch(`${url}/_wizelens/api/sourcemaps?release=${release}&file=${CART_FILE}${project ? `&project=${project}` : ""}`, { method: "POST", headers, body });

const browserError = (spanId: string, release: string) =>
  span(T1, spanId, {
    name: "Error: Coupon code is empty",
    category: "browser",
    service: "browser",
    status: "error",
    attributes: { "wizelens.browser.type": "error", "service.version": release },
    events: [{ name: "exception", timeMs: 1_000_000, attributes: { "exception.type": "Error", "exception.message": "Coupon code is empty", "exception.stacktrace": CART_STACK } }],
  });

describe("hub source maps", () => {
  it("takes uploads (gzip too), lists them, and needs the token", async () => {
    let url: string;
    ({ hub, url } = await startHub({ token: "t" }));
    expect((await upload(url, "1.0.0", CART_MAP)).status).toBe(401);
    const auth = { Authorization: "Bearer t" };
    expect((await upload(url, "1.0.0", gzipSync(CART_MAP), { ...auth, "Content-Encoding": "gzip" })).status).toBe(201);
    expect((await upload(url, "1.0.0", "not a map", auth)).status).toBe(400);
    expect((await fetch(`${url}/_wizelens/api/sourcemaps?file=a.js`, { method: "POST", headers: auth, body: CART_MAP })).status).toBe(400);
    const { maps } = (await (await fetch(`${url}/_wizelens/api/sourcemaps?release=1.0.0`, { headers: auth })).json()) as { maps: { file: string }[] };
    expect(maps.map((m) => m.file)).toEqual([CART_FILE]);
  });

  it("groups ingested browser errors by the uploaded map's frame, and resolves stacks on read", async () => {
    let url: string;
    ({ hub, url } = await startHub({ sourceMaps: { fetch: false } }));
    await upload(url, "1.0.0", CART_MAP, {}, "shop");
    const sender = { service: "web-api", project: "shop" };
    expect((await post(`${url}/_wizelens/api/ingest`, { sender, spans: [browserError("1".repeat(16), "1.0.0"), browserError("2".repeat(16), "0.9.0")] })).status).toBe(204);
    const [trace] = (await (await fetch(`${url}/_wizelens/api/traces?full=true`)).json()) as { spans: { spanId: string; events: { attributes: Record<string, unknown> }[] }[] }[];
    const frameOf = (id: string) => trace!.spans.find((s) => s.spanId === id)!.events[0]!.attributes[ATTR_ERROR_FRAME];
    expect(frameOf("1".repeat(16))).toBe("src/cart.ts:applyCoupon");
    expect(frameOf("2".repeat(16))).toBeUndefined();
    const res = await post(`${url}/_wizelens/api/sourcemaps/resolve?project=shop`, { stack: CART_STACK, release: "1.0.0" });
    const { frames } = (await res.json()) as { frames: ResolvedFrame[] };
    expect(frames[0]).toMatchObject({ source: "src/cart.ts", line: 3, fn: "applyCoupon" });
    expect(frames[0]!.raw.fn).toBe("a");
  });

  it("resolves a stack under All projects by the project of the error's trace", async () => {
    let url: string;
    ({ hub, url } = await startHub({ sourceMaps: { fetch: false } }));
    await upload(url, "1.0.0", CART_MAP, {}, "shop");
    await post(`${url}/_wizelens/api/ingest`, { sender: { service: "web-api", project: "shop" }, spans: [browserError("1".repeat(16), "1.0.0")] });
    const resolve = async (body: Record<string, unknown>) => ((await (await post(`${url}/_wizelens/api/sourcemaps/resolve`, { stack: CART_STACK, release: "1.0.0", ...body })).json()) as { frames: ResolvedFrame[] }).frames;
    expect((await resolve({}))[0]!.source).toBeNull();
    expect((await resolve({ traceId: T1, spanId: "1".repeat(16) }))[0]).toMatchObject({ source: "src/cart.ts", fn: "applyCoupon" });
    expect((await resolve({ traceId: "f".repeat(32) }))[0]!.source).toBeNull();
  });

  it("keeps only the newest releases", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    for (let i = 0; i <= SOURCEMAP_RELEASES_KEPT; i++) await upload(url, `r${i}`, CART_MAP);
    const releases = new Set(listSourceMaps(hub.data.store.db, "").map((m) => m.release));
    expect(releases.size).toBe(SOURCEMAP_RELEASES_KEPT);
    expect(releases.has("r0")).toBe(false);
  });
});
