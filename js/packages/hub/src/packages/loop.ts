// The hub's check loop: soon after start, then every few minutes, package versions due go to OSV.
import { checkPackages } from "./check.js";
import type { Fetch } from "./osv.js";
import type { PackageDb } from "./store.js";

const FIRST_MS = 10_000;
const EVERY_MS = 5 * 60_000;

/** Goes up when packages or their checks change, so cached Security pages are not reused. */
let version = 0;
export const packagesVersion = (): number => version;
export const packagesChanged = (): void => void version++;

export interface PackageLoopOptions {
  fetch: Fetch;
  osvUrl: string;
  now: () => number;
}

/** One round, quietly: OSV being down only means the next round tries again. */
export async function runPackageRound(db: PackageDb, o: PackageLoopOptions): Promise<void> {
  try {
    const r = await checkPackages(db, o.fetch, o.now(), o.osvUrl);
    if (r.checked > 0) packagesChanged();
  } catch {
    // The next round tries again.
  }
}

/** Start the loop; returns a stop function. */
export function startPackageChecks(db: PackageDb, o: PackageLoopOptions): () => void {
  const first = setTimeout(() => void runPackageRound(db, o), FIRST_MS);
  const every = setInterval(() => void runPackageRound(db, o), EVERY_MS);
  first.unref();
  every.unref();
  return () => (clearTimeout(first), clearInterval(every));
}
