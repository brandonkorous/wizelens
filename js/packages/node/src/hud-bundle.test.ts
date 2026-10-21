import { existsSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { autoOptions } from "./auto/config.js";
import { BodySplicer, lastBodyClose } from "./hud-body.js";
import { hudTag, hudTagFor } from "./hud-bundle.js";
import { hudOn } from "./mode.js";
import { closeServers, fakeBundle, fetchPage, serveWith, TAG } from "./test/hud.js";
import type { WizeLensOptions } from "./types.js";
import { buildWizeLens } from "./wizelens.js";

vi.mock("./hud-bundle.js", async (importOriginal) => {
  const { fakeBundle } = await import("./test/hud.js");
  return { ...(await importOriginal<typeof import("./hud-bundle.js")>()), resolveHudBundle: () => fakeBundle() };
});

afterAll(closeServers);

const options = (o: Partial<WizeLensOptions>): WizeLensOptions => ({ serviceName: "hud-serve", enabled: true, storage: "memory", instrumentFetch: false, captureConsole: false, ...o });

describe("serving the script", () => {
  it("serves wizelens.js and its map, fresh, with the map comment renamed", async () => {
    const base = await serveWith(buildWizeLens(options({ dashboard: true })), (_req, res) => res.end("app"));
    const script = await fetchPage(`${base}/_wizelens/wizelens.js`);
    expect(script.status).toBe(200);
    expect(script.type).toBe("application/javascript; charset=utf-8");
    expect(script.header("cache-control")).toBe("no-cache");
    expect(script.text).toContain("//# sourceMappingURL=wizelens.js.map");
    const map = await fetchPage(`${base}/_wizelens/wizelens.js.map`);
    expect(map.type).toBe("application/json; charset=utf-8");
    expect(map.header("cache-control")).toBe("no-cache");
    expect(JSON.parse(map.text)).toMatchObject({ version: 3 });
  });

  it("serves nothing when the dashboard is off", async () => {
    const base = await serveWith(buildWizeLens(options({ dashboard: false })), (_req, res) => res.end("app"));
    expect((await fetchPage(`${base}/_wizelens/wizelens.js`)).status).toBe(404);
  });
});

describe("the bundle file", () => {
  it("resolves the lens-browser script bundle when it is built", async () => {
    const { resolveHudBundle } = await vi.importActual<typeof import("./hud-bundle.js")>("./hud-bundle.js");
    const file = resolveHudBundle();
    if (file) expect(file.replace(/\\/g, "/")).toMatch(/wizelens\.iife\.js$/);
    if (file) expect(existsSync(file)).toBe(true);
  });

  it("is the tag from the plan, and warns once when the bundle is missing", () => {
    expect(hudTag("/_wizelens")).toBe(TAG);
    const warn = vi.fn();
    expect(hudTagFor(true, fakeBundle(), "/_wizelens", warn)).toBe(TAG);
    expect(hudTagFor(false, fakeBundle(), "/_wizelens", warn)).toBeNull();
    expect(hudTagFor(true, null, "/_wizelens", warn)).toBeNull();
    expect(hudTagFor(true, null, "/_wizelens", warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("the hud option", () => {
  it("is on by default, and the option wins over WIZELENS_HUD", () => {
    vi.stubEnv("WIZELENS_HUD", "");
    expect(hudOn({ serviceName: "s" })).toBe(true);
    vi.stubEnv("WIZELENS_HUD", "0");
    expect(hudOn({ serviceName: "s" })).toBe(false);
    expect(hudOn({ serviceName: "s", hud: true })).toBe(true);
    vi.unstubAllEnvs();
  });

  it("reaches the auto install from WIZELENS_HUD", () => {
    expect(autoOptions({ WIZELENS_HUD: "false" }).hud).toBe(false);
    expect(autoOptions({ WIZELENS_HUD: "true" }).hud).toBe(true);
    expect(autoOptions({}).hud).toBeUndefined();
  });
});

describe("the body splicer", () => {
  const run = (chunks: string[]) => {
    const s = new BodySplicer("<x>");
    const out = chunks.slice(0, -1).map((c) => s.push(Buffer.from(c)).toString("latin1"));
    return out.join("") + s.finish(Buffer.from(chunks.at(-1)!)).toString("latin1");
  };

  it("finds </body> in any case and over any split", () => {
    expect(lastBodyClose(Buffer.from("a</BoDy>b</body>"))).toBe(9);
    for (let at = 1; at < 7; at++) expect(run([`<p>1</p>${"</body>".slice(0, at)}`, `${"</body>".slice(at)}</html>`])).toBe("<p>1</p><x></body></html>");
    expect(run(["<", "/", "b", "o", "d", "y", ">", ""])).toBe("<x></body>");
  });

  it("lets a </body> go when too much follows it, and leaves a body without one as it was", () => {
    const long = "y".repeat(70 * 1024);
    expect(run(["a</body>", long, "z"])).toBe(`a</body>${long}z`);
    expect(run(["a</body>", "b", "c"])).toBe("a<x></body>bc");
    expect(run(["<li>", "one</li>"])).toBe("<li>one</li>");
  });
});
