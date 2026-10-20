import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
