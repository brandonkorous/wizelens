import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { withWizeLensSourceMaps } from "./next.js";
import { wizeLensSourceMaps } from "./vite.js";
import { WizeLensSourceMapsPlugin } from "./webpack.js";

// A stand-in hub that records each upload's query.
const seen: string[] = [];
const server = createServer((req: IncomingMessage, res) => {
  seen.push(req.url ?? "");
  req.resume().on("end", () => res.writeHead(201).end("{}"));
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

function folder(sub = "assets"): string {
  const dir = mkdtempSync(join(tmpdir(), "wl-plugin-"));
  mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, sub, "a.js.map"), JSON.stringify({ version: 3, sources: [], names: [], mappings: "" }));
  return dir;
}

describe("vite plugin", () => {
  it("turns on hidden maps, puts the release in the page, and uploads after the client build", async () => {
    const root = folder();
    const plugin = wizeLensSourceMaps({ endpoint: url, release: "1.0.0", log: () => {} });
    expect(plugin.config({ root }, { command: "build" })).toMatchObject({ build: { sourcemap: "hidden" }, define: { "globalThis.__WIZELENS_RELEASE__": '"1.0.0"' } });
    expect(plugin.config({ root, build: { sourcemap: true } }, { command: "build" }).build).toEqual({ sourcemap: true });
    plugin.configResolved({ root, command: "build", build: { outDir: "." } });
    expect(plugin.transformIndexHtml()[0]!.children).toBe('globalThis.__WIZELENS_RELEASE__="1.0.0";');
    seen.length = 0;
    await plugin.closeBundle.call({ environment: { name: "ssr" } });
    expect(seen).toHaveLength(0);
    await plugin.closeBundle.call({ environment: { name: "client" } });
    expect(seen).toEqual(["/_wizelens/api/sourcemaps?release=1.0.0&file=assets%2Fa.js"]);
  });

  it("deletes the maps it turned on once they are uploaded, and keeps maps the site asked for", async () => {
    for (const [build, kept] of [[undefined, false], [{ sourcemap: true }, true]] as const) {
      const root = folder();
      const plugin = wizeLensSourceMaps({ endpoint: url, release: "1.0.1", log: () => {} });
      plugin.config({ root, build }, { command: "build" });
      plugin.configResolved({ root, command: "build", build: { outDir: "." } });
      await plugin.closeBundle.call({ environment: { name: "client" } });
      expect(existsSync(join(root, "assets", "a.js.map"))).toBe(kept);
    }
  });

  it("warns instead of failing the build, unless asked", async () => {
    const root = folder();
    const warnings: string[] = [];
    const plugin = wizeLensSourceMaps({ endpoint: "http://127.0.0.1:1", release: "1", log: (l) => warnings.push(l) });
    plugin.configResolved({ root, command: "build", build: { outDir: "." } });
    await plugin.closeBundle.call(undefined);
    expect(warnings[0]).toContain("were not uploaded");
    const strict = wizeLensSourceMaps({ endpoint: "http://127.0.0.1:1", release: "1", failOnError: true, log: () => {} });
    strict.configResolved({ root, command: "build", build: { outDir: "." } });
    await expect(strict.closeBundle.call(undefined)).rejects.toThrow(/not uploaded/);
  });
});

describe("webpack plugin", () => {
  it("sets hidden maps and the release, and uploads after emit in production", async () => {
    const dir = folder();
    let emit: ((c: { errors: unknown[]; outputOptions: { path?: string } }) => Promise<void>) | undefined;
    const defined: Record<string, string>[] = [];
    const compiler = {
      context: dir,
      options: { mode: "production", devtool: undefined as unknown, output: { path: dir } },
      webpack: { DefinePlugin: class { constructor(d: Record<string, string>) { defined.push(d); } apply() {} } },
      hooks: { afterEmit: { tapPromise: (_n: string, fn: typeof emit) => void (emit = fn) } },
    };
    new WizeLensSourceMapsPlugin({ endpoint: url, release: "2.0.0", log: () => {} }).apply(compiler);
    expect(compiler.options.devtool).toBe("hidden-source-map");
    expect(defined[0]).toMatchObject({ "globalThis.__WIZELENS_RELEASE__": '"2.0.0"' });
    seen.length = 0;
    await emit!({ errors: [], outputOptions: { path: dir } });
    expect(seen[0]).toContain("release=2.0.0&file=assets%2Fa.js");
  });
});

describe("next wrapper", () => {
  it("turns on browser maps, sets the release, and uploads below _next/static after the build", async () => {
    const project = folder(join(".next", "static", "chunks"));
    const config = withWizeLensSourceMaps({ reactStrictMode: true }, { endpoint: url, release: "3.0.0", log: () => {} });
    expect(config).toMatchObject({ reactStrictMode: true, productionBrowserSourceMaps: true, env: { NEXT_PUBLIC_WIZELENS_RELEASE: "3.0.0" } });
    seen.length = 0;
    await config.compiler!.runAfterProductionCompile!({ distDir: ".next", projectDir: project });
    expect(seen).toEqual(["/_wizelens/api/sourcemaps?release=3.0.0&file=_next%2Fstatic%2Fchunks%2Fa.js"]);
  });
});
