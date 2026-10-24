import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { listNodePackages } from "./packages.js";

const root = mkdtempSync(join(tmpdir(), "wl-pkgs-"));
const pkg = (dir: string, name: string, version: string) => (mkdirSync(dir, { recursive: true }), writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version })));

pkg(join(root, "node_modules", "express"), "express", "4.17.1");
pkg(join(root, "node_modules", "express", "node_modules", "qs"), "qs", "6.7.0");
pkg(join(root, "node_modules", "@scope", "tool"), "@scope/tool", "1.2.3");
pkg(join(root, "node_modules", ".pnpm", "lodash@4.17.20", "node_modules", "lodash"), "lodash", "4.17.20");
mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
mkdirSync(join(root, "node_modules", "broken"), { recursive: true });

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("listNodePackages", () => {
  it("finds plain, nested, scoped, and pnpm packages once each", async () => {
    const found = (await listNodePackages(root)).map((p) => `${p.ecosystem}:${p.name}@${p.version}`).sort();
    expect(found).toEqual(["npm:@scope/tool@1.2.3", "npm:express@4.17.1", "npm:lodash@4.17.20", "npm:qs@6.7.0"]);
  });

  it("gives an empty list when there is no node_modules", async () => {
    expect(await listNodePackages(join(root, "nowhere"))).toEqual([]);
  });
});

describe("run-time packages", () => {
  const app = mkdtempSync(join(tmpdir(), "wl-app-"));
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "backend", version: "1.0.0", dependencies: { express: "^4" }, devDependencies: { vitest: "^3" } }));
  const dep = (dir: string, name: string, version: string, deps: Record<string, string> = {}) => (mkdirSync(dir, { recursive: true }), writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version, dependencies: deps, devDependencies: { esbuild: "*" } })));
  dep(join(app, "node_modules", ".pnpm", "express@4.17.1", "node_modules", "express"), "express", "4.17.1", { qs: "^6" });
  dep(join(app, "node_modules", ".pnpm", "express@4.17.1", "node_modules", "qs"), "qs", "6.7.0");
  dep(join(app, "node_modules", ".pnpm", "vitest@3.0.0", "node_modules", "vitest"), "vitest", "3.0.0");
  dep(join(app, "node_modules", ".pnpm", "esbuild@0.25.0", "node_modules", "esbuild"), "esbuild", "0.25.0");
  symlinkSync(join(app, "node_modules", ".pnpm", "express@4.17.1", "node_modules", "express"), join(app, "node_modules", "express"), "junction");
  afterAll(() => rmSync(app, { recursive: true, force: true }));

  it("lists the app's dependencies and theirs, not dev tools left in the store", async () => {
    const found = (await listNodePackages(app)).map((p) => `${p.name}@${p.version}`).sort();
    expect(found).toEqual(["express@4.17.1", "qs@6.7.0"]);
  });
});
