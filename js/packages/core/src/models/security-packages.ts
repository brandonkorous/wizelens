// Known-vulnerable packages (A03) as security groups: one per package version, with its advisories.
import type { PackageAdvisory, PackageRisk } from "../packages.js";
import type { SecurityGroup, SecuritySeverity } from "./security-groups.js";

const RANK: Record<SecuritySeverity, number> = { error: 0, warning: 1, info: 2 };
const IMPACT = { error: "high", warning: "medium", info: "low" } as const;

/** The worst severity of a package's advisories. */
const worst = (list: readonly PackageAdvisory[]): SecuritySeverity => list.reduce<SecuritySeverity>((w, a) => (RANK[a.severity] < RANK[w] ? a.severity : w), "info");

/** The highest fixed version named (it fixes every advisory that names one), or null when none does. */
function fixedIn(list: readonly PackageAdvisory[]): string | null {
  const all = list.flatMap((a) => a.fixed);
  return all.length ? all.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[all.length - 1]! : null;
}

function describe(r: PackageRisk): string {
  const n = r.advisories.length;
  const fix = fixedIn(r.advisories);
  const ids = r.advisories.slice(0, 3).map((a) => a.aliases.find((x) => x.startsWith("CVE-")) ?? a.id).join(", ");
  return `${r.name} ${r.version} has ${n} known ${n === 1 ? "advisory" : "advisories"} (${ids}${n > 3 ? ", …" : ""}).${fix ? ` Update to ${fix} or later.` : " No fixed version is published yet."}`;
}

/** A package risk as a security group. Its "endpoints" are the services that run it. */
export function packageGroup(r: PackageRisk): SecurityGroup & { advisories: PackageAdvisory[] } {
  const severity = worst(r.advisories);
  return {
    key: `vulnerable-package|${r.ecosystem}|${r.name}|${r.version}`, kind: "vulnerable-package", owasp: "A03", severity, impact: IMPACT[severity],
    title: "A package has a known vulnerability", description: describe(r), shape: `${r.ecosystem} ${r.name}@${r.version}`,
    occurrences: r.services.length, count: r.advisories.length, endpoints: r.services, firstSeenMs: r.firstSeenMs, lastSeenMs: r.lastSeenMs,
    exampleTraceId: null, addresses: null, advisories: r.advisories,
  };
}

/** The groups of the packages with advisories, for one service or all. */
export const packageGroupsOf = (risks: readonly PackageRisk[] | undefined, service?: string): SecurityGroup[] =>
  (risks ?? []).filter((r) => r.advisories.length > 0 && (!service || r.services.includes(service))).map(packageGroup);
