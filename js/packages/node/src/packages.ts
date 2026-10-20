// The npm packages this app runs, from node_modules (npm, yarn, and pnpm layouts), sent to the hub once at start.
import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type HubSender, MAX_PACKAGES, PACKAGES_PATH, type PackageRef } from "@wizeworks/lens-core";

const MAX_DEPTH = 4;
const RETRIES = 5;
const RETRY_MS = 60_000;

async function readPackage(dir: string): Promise<PackageRef | null> {
  try {
    const p = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
    return typeof p.name === "string" && typeof p.version === "string" ? { ecosystem: "npm", name: p.name, version: p.version } : null;
  } catch {
    return null;
  }
}

const entries = async (dir: string): Promise<string[]> => (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name);

/** The package folders inside one node_modules: plain, scoped (`@scope/name`), and pnpm's `.pnpm/<id>/node_modules`. */
async function packageDirs(modules: string): Promise<{ dirs: string[]; stores: string[] }> {
  const dirs: string[] = [];
  const stores: string[] = [];
  for (const name of await entries(modules)) {
    if (name === ".bin") continue;
    if (name === ".pnpm") stores.push(...(await entries(join(modules, name))).map((id) => join(modules, name, id, "node_modules")));
    else if (name.startsWith("@")) dirs.push(...(await entries(join(modules, name))).map((n) => join(modules, name, n)));
    else if (!name.startsWith(".")) dirs.push(join(modules, name));
  }
  return { dirs, stores };
}

/** Every package under `root/node_modules`, once per name and version, at most `MAX_PACKAGES`. */
export async function listNodePackages(root = process.cwd()): Promise<PackageRef[]> {
  const found = new Map<string, PackageRef>();
  const seen = new Set<string>();
  const walk = async (modules: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || seen.has(modules) || found.size >= MAX_PACKAGES) return;
    seen.add(modules);
    const { dirs, stores } = await packageDirs(modules);
    for (const dir of dirs) {
      const p = await readPackage(dir);
      if (p && found.size < MAX_PACKAGES) found.set(`${p.name}@${p.version}`, p);
      await walk(join(dir, "node_modules"), depth + 1);
    }
    for (const store of stores) await walk(store, depth + 1);
  };
  await walk(join(root, "node_modules"), 0);
  return [...found.values()];
}

async function post(url: string, token: string | undefined, body: string): Promise<boolean> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  try {
    const res = await context.with(suppressTracing(ROOT_CONTEXT), () => fetch(`${url}/_wizelens/${PACKAGES_PATH}`, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) }));
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
  } catch {
    return false;
  }
}

/** List the packages after start, send them, and retry a few times while the hub cannot be reached. Never throws. */
export function reportPackages(url: string, token: string | undefined, sender: () => HubSender, root?: string): void {
  const send = async (attempt: number): Promise<void> => {
    const body = JSON.stringify({ sender: sender(), packages: await listNodePackages(root) });
    if (!(await post(url, token, body)) && attempt < RETRIES) setTimeout(() => void send(attempt + 1), RETRY_MS).unref?.();
  };
  setTimeout(() => void send(1).catch(() => undefined), 2000).unref?.();
}
