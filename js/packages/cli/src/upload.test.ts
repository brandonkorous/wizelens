import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createHub } from "@wizeworks/lens-hub";
import { commandOf } from "./cli-args.js";
import { baseOf, resolveRelease, resolveTarget } from "./options.js";
import { findSourceMaps } from "./find.js";
import { listUploadedMaps, uploadSourceMaps } from "./upload.js";

const MAP = JSON.stringify({ version: 3, sources: ["../src/a.ts"], names: [], mappings: "AAAA" });

function buildFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), "wl-cli-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "index-abc.js"), "x()");
  writeFileSync(join(dir, "assets", "index-abc.js.map"), MAP);
  writeFileSync(join(dir, "assets", "vendor.mjs.map"), MAP);
  writeFileSync(join(dir, "assets", "style.css.map"), MAP);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "4.5.6" }));
  return dir;
}

const hub = createHub({ port: 0, storagePath: "memory", token: "hub-token", audit: () => undefined });
const hubUrl = await hub.listen();
afterAll(() => hub.close());

describe("options and arguments", () => {
  it("finds the target and the release from flags, then the environment", () => {
    expect(baseOf("https://cloud.test/")).toBe("https://cloud.test/_wizelens");
    expect(baseOf("http://h:5960/_wizelens")).toBe("http://h:5960/_wizelens");
    expect(resolveTarget({}, { WIZELENS_ENDPOINT: "http://hub:1", WIZELENS_TOKEN: "t" })).toEqual({ base: "http://hub:1/_wizelens", token: "t", project: undefined });
    expect(resolveTarget({ endpoint: "https://c.test", token: "wl_ik_1" }, { WIZELENS_TOKEN: "x" }).token).toBe("wl_ik_1");
    expect(resolveRelease(undefined, "/nowhere", { WIZELENS_RELEASE: "9" })).toBe("9");
    expect(resolveRelease(undefined, buildFolder(), {})).toBe("4.5.6");
  });

  it("reads commands", () => {
    expect(commandOf([])).toEqual({ kind: "help" });
    expect(commandOf(["sourcemaps", "upload", "dist", "--release", "1", "--url-prefix", "_next/static/"])).toMatchObject({ kind: "upload", options: { dir: "dist", release: "1", urlPrefix: "_next/static/" } });
    expect(commandOf(["sourcemaps", "list", "--release", "1"])).toMatchObject({ kind: "list", options: { release: "1" } });
    expect(() => commandOf(["sourcemaps", "upload"])).toThrow(/build folder/);
    expect(() => commandOf(["deploy"])).toThrow(/Unknown command/);
  });
});

describe("upload", () => {
  it("finds JavaScript maps and keys them by the generated file", async () => {
    const dir = buildFolder();
    expect((await findSourceMaps(dir)).map((m) => m.file)).toEqual(["assets/index-abc.js", "assets/vendor.mjs"]);
    expect((await findSourceMaps(dir, "/_next/static/"))[0]!.file).toBe("_next/static/assets/index-abc.js");
  });

  it("keys a map by the script that names it, as Turbopack names them apart", async () => {
    const dir = buildFolder();
    mkdirSync(join(dir, "chunks"));
    writeFileSync(join(dir, "chunks", "1ycw.js"), "x()\n//# sourceMappingURL=0rk.js.map");
    writeFileSync(join(dir, "chunks", "0rk.js.map"), MAP);
    expect((await findSourceMaps(dir)).map((m) => m.file)).toContain("chunks/1ycw.js");
    expect((await findSourceMaps(dir)).map((m) => m.file)).not.toContain("chunks/0rk.js");
  });

  it("uploads to a real hub, lists, and deletes maps when asked", async () => {
    const dir = buildFolder();
    const log: string[] = [];
    const result = await uploadSourceMaps({ dir, release: "4.5.6", endpoint: hubUrl, token: "hub-token", project: "shop", deleteAfterUpload: true, log: (l) => log.push(l) });
    expect(result).toMatchObject({ release: "4.5.6", files: ["assets/index-abc.js", "assets/vendor.mjs"] });
    expect(log[0]).toContain("Uploaded 2 source maps for release 4.5.6");
    expect(existsSync(join(dir, "assets", "index-abc.js.map"))).toBe(false);
    const listed = await listUploadedMaps({ endpoint: hubUrl, token: "hub-token", project: "shop", release: "4.5.6" });
    expect(listed.map((m) => m.file).sort()).toEqual(["assets/index-abc.js", "assets/vendor.mjs"]);
  });

  it("stops with the server's answer when it refuses", async () => {
    await expect(uploadSourceMaps({ dir: buildFolder(), endpoint: hubUrl, token: "wrong", log: () => {} })).rejects.toThrow(/401/);
  });
});
