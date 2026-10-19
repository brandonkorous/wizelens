import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { describe, expect, it } from "vitest";
import { autoServiceName, packageNameAbove, skipped } from "./config.js";
import { esmPatch, transformSource } from "./esm-source.js";

function appDir(name?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "wl-auto-"));
  if (name) writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
  mkdirSync(join(dir, "dist"), { recursive: true });
  return dir;
}

describe("auto install settings", () => {
  it("names the service from OTEL_SERVICE_NAME, then OTEL_RESOURCE_ATTRIBUTES, then package.json without its scope", () => {
    const dir = appDir("@shop/orders-api");
    expect(autoServiceName({ OTEL_SERVICE_NAME: "billing" }, dir)).toBe("billing");
    expect(autoServiceName({ OTEL_RESOURCE_ATTRIBUTES: "team=shop,service.name=carts" }, dir)).toBe("carts");
    expect(autoServiceName({}, join(dir, "dist"))).toBe("orders-api");
  });

  it("finds package.json from the main script when the working folder has none, and skips node_modules", () => {
    const dir = appDir("worker");
    const nested = join(dir, "node_modules", "next");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "package.json"), JSON.stringify({ name: "next" }));
    expect(packageNameAbove(nested)).toBe("worker");
    expect(autoServiceName({}, tmpdir(), join(dir, "dist", "main.js"))).toBe("worker");
  });

  it("falls back to node-app", () => {
    expect(autoServiceName({}, parse(process.cwd()).root, "")).toBe("node-app");
  });

  it("reads WIZELENS_AUTO_SKIP as a comma list", () => {
    expect(skipped("prisma", { WIZELENS_AUTO_SKIP: "pino, Prisma" })).toBe(true);
    expect(skipped("pg", { WIZELENS_AUTO_SKIP: "pino" })).toBe(false);
  });
});

describe("ES module patches", () => {
  const patch = esmPatch(/\/hono\/dist\/hono\.js$/, "hono", "Hono", true);

  it("adds the line to matching ES modules only", () => {
    const source = "var Hono = class {};\nexport { Hono };";
    const out = transformSource("file:///app/node_modules/hono/dist/hono.js", { format: "module", source }, [patch]);
    expect(out.source).toContain('Symbol.for("wizeworks.wizelens.auto.esm")');
    expect(out.source).toContain("Hono = globalThis");
    expect(transformSource("file:///app/other.js", { format: "module", source }, [patch]).source).toBe(source);
    expect(transformSource("file:///app/node_modules/hono/dist/hono.js", { format: "commonjs", source }, [patch]).source).toBe(source);
  });

  it("keeps the module running when the binding is gone", async () => {
    const code = `${patch.code}\nexport const ok = true;`;
    const mod = (await import(`data:text/javascript,${encodeURIComponent(code)}`)) as { ok: boolean };
    expect(mod.ok).toBe(true);
  });
});
