// The packages an app can load at run time: its package.json dependencies and theirs, resolved as Node resolves them. Dev tools stay out.
import { readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PackageRef } from "@wizeworks/lens-core/internal";

interface Manifest {
  name?: unknown;
  version?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

async function manifestAt(dir: string): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

/** What a package needs at run time; devDependencies are never loaded in production. */
const runtimeDeps = (m: Manifest): string[] => [...new Set(Object.keys({ ...m.peerDependencies, ...m.optionalDependencies, ...m.dependencies }))];

/** The folder `name` resolves to from `from`: its node_modules, then each parent's, with links followed (pnpm). */
async function resolveDep(from: string, name: string): Promise<string | null> {
  for (let dir = from; ; dir = dirname(dir)) {
    const real = await realpath(join(dir, "node_modules", name)).catch(() => null);
    if (real) return real;
    if (dirname(dir) === dir) return null;
  }
}

/** Packages reachable from the app's dependencies, once per name and version; null when the app has no package.json with dependencies. */
export async function runtimePackages(root: string, max: number): Promise<PackageRef[] | null> {
  const app = await manifestAt(root);
  if (!app || runtimeDeps(app).length === 0) return null;
  const found = new Map<string, PackageRef>();
  const seen = new Set<string>();
  const queue: [string, string[]][] = [[await realpath(root).catch(() => root), runtimeDeps(app)]];
  while (queue.length && found.size < max) {
    const [from, deps] = queue.shift()!;
    for (const name of deps) {
      const dir = await resolveDep(from, name);
      if (!dir || seen.has(dir)) continue;
      seen.add(dir);
      const m = await manifestAt(dir);
      if (typeof m?.name !== "string" || typeof m.version !== "string") continue;
      if (found.size < max) found.set(`${m.name}@${m.version}`, { ecosystem: "npm", name: m.name, version: m.version });
      queue.push([dir, runtimeDeps(m)]);
    }
  }
  return [...found.values()];
}
