// The packages a service runs, as SDKs report them (`POST {hub}/_wizelens/api/packages`), for the known-vulnerability check.
import type { HubSender } from "./hub.js";

/** OSV ecosystem names. */
export const PACKAGE_ECOSYSTEMS = ["npm", "NuGet", "PyPI", "Maven", "Go"] as const;
export type PackageEcosystem = (typeof PACKAGE_ECOSYSTEMS)[number];

export interface PackageRef {
  ecosystem: PackageEcosystem;
  /** As the ecosystem names it: `express`, `Newtonsoft.Json`, `requests`, `org.yaml:snakeyaml`, `golang.org/x/net`. */
  name: string;
  version: string;
}

/** `POST {hub}/_wizelens/api/packages`: the whole set a service runs now. Sent at start; it replaces the last set. */
export interface PackagesReport {
  sender: HubSender;
  packages: PackageRef[];
}

export const PACKAGES_PATH = "api/packages";
/** Most packages one report may hold. */
export const MAX_PACKAGES = 5000;

const isEcosystem = (v: unknown): v is PackageEcosystem => PACKAGE_ECOSYSTEMS.includes(v as PackageEcosystem);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

/** One package from a request body, or null when it is not usable. */
function packageOf(raw: unknown): PackageRef | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const name = text(p.name, 300);
  const version = text(p.version, 100);
  return isEcosystem(p.ecosystem) && name && version ? { ecosystem: p.ecosystem, name, version } : null;
}

/** A report from a request body, or a message saying what is wrong. Duplicates are dropped. */
export function parsePackagesReport(body: unknown): PackagesReport | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const sender = b.sender as HubSender | undefined;
  if (!sender || typeof sender.service !== "string" || !sender.service) return "Set sender.service.";
  if (!Array.isArray(b.packages)) return "Set packages to a list of { ecosystem, name, version }.";
  if (b.packages.length > MAX_PACKAGES) return `Send at most ${MAX_PACKAGES} packages.`;
  const seen = new Map<string, PackageRef>();
  for (const raw of b.packages) {
    const p = packageOf(raw);
    if (p) seen.set(packageKey(p), p);
  }
  return { sender, packages: [...seen.values()] };
}

/** `ecosystem|name|version`, one package version anywhere. */
export const packageKey = (p: PackageRef): string => `${p.ecosystem}|${p.name}|${p.version}`;
