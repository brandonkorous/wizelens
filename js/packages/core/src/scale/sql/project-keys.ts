// Many projects in one read (the cloud's "All projects"): rows named by a service stay apart per project, shown as "api · Shop".
import { KEY_SEP, type RollupKind } from "../kinds.js";

/** Between a service and its project's label. */
export const PROJECT_MARK = " · ";

/** Each read project's label, unique within the read. */
export type ProjectLabels = Readonly<Record<string, string>>;

/** Kinds whose key names a service, and which of its parts do. Other kinds (levels, layers, routes, queries) add up across projects. */
const SERVICE_PARTS: Readonly<Record<string, readonly number[]>> = {
  svc: [0], "svc.ep": [0], "svc.stream": [0], "req.stream": [0], edge: [0, 1], "err.g": [0], "err.ge": [0], "err.u": [0], "err.s": [0],
  "log.s": [0], "log.p": [0], rel: [0], "ep.u": [0], "req.svc": [0], "sec.auth": [0],
};

/** The parts of a kind's key that name a service: a per-service kind's first part, or the kind's own. */
export const servicePartsOf = (kind: RollupKind): readonly number[] => (kind.endsWith("@svc") ? [0] : (SERVICE_PARTS[kind] ?? []));

/** A shown key and the project it belongs to. */
export interface Unlabeled {
  project: string | null;
  key: string;
}

/** The service text of a part ends at its first "|" (an error group's service, type, and message); the label goes there. */
export function labelPart(part: string, label: string): string {
  const cut = part.indexOf("|");
  return cut < 0 ? `${part}${PROJECT_MARK}${label}` : `${part.slice(0, cut)}${PROJECT_MARK}${label}${part.slice(cut)}`;
}

/** A part back to its project and raw text; null when it carries no label of the read. */
export function unlabelPart(part: string, labels: ProjectLabels): Unlabeled | null {
  const byLength = Object.entries(labels).sort((a, b) => b[1].length - a[1].length);
  for (const [project, label] of byLength) {
    const mark = `${PROJECT_MARK}${label}`;
    const at = part.indexOf(mark);
    const end = at + mark.length;
    if (at >= 0 && (end === part.length || part[end] === "|")) return { project, key: part.slice(0, at) + part.slice(end) };
  }
  return null;
}

/** A stored key as shown: each service part carries its project's label. Empty keys (totals) stay as they are. */
export function labelKey(kind: RollupKind, key: string, label: string): string {
  const parts = servicePartsOf(kind);
  if (!key || !parts.length) return key;
  return key.split(KEY_SEP).map((p, i) => (parts.includes(i) && p ? labelPart(p, label) : p)).join(KEY_SEP);
}

/** A shown key (or key prefix) back to its project and stored key. Unlabeled service parts name no project. */
export function unlabelKey(kind: RollupKind, key: string, labels: ProjectLabels): Unlabeled {
  const parts = servicePartsOf(kind);
  let project: string | null = null;
  const raw = key.split(KEY_SEP).map((p, i) => {
    const u = parts.includes(i) ? unlabelPart(p, labels) : null;
    if (!u) return p;
    project ??= u.project;
    return u.key;
  });
  return { project, key: raw.join(KEY_SEP) };
}

/** Key pieces (`parts` filters; null is any value) back to their project and stored pieces. */
export function unlabelPieces(kind: RollupKind, pieces: readonly (string | null)[], labels: ProjectLabels): { project: string | null; pieces: (string | null)[] } {
  const parts = servicePartsOf(kind);
  let project: string | null = null;
  const raw = pieces.map((p, i) => {
    const u = p !== null && parts.includes(i) ? unlabelPart(p, labels) : null;
    if (!u) return p;
    project ??= u.project;
    return u.key;
  });
  return { project, pieces: raw };
}

/** A list or search row: the fields that name a project and its services. */
export interface LabeledRow {
  project?: string;
  service?: string;
  services?: string[];
}

/** A row of a many-project read: its project's label, and that label on its services. */
export function labelRow<T extends LabeledRow>(item: T, label: string): T {
  const out: T = { ...item, project: label };
  if (item.service) out.service = labelPart(item.service, label);
  if (item.services) out.services = item.services.map((s) => labelPart(s, label));
  return out;
}

/** A row's representative (its top) with the project's label where it names a service, as the row's key does. */
export function labelTop(kind: RollupKind, top: unknown, label: string): unknown {
  if (!top || typeof top !== "object" || Array.isArray(top) || !servicePartsOf(kind).length) return top;
  const t: Record<string, unknown> = { ...(top as Record<string, unknown>) };
  const mark = (field: string) => {
    if (typeof t[field] === "string" && t[field]) t[field] = labelPart(t[field] as string, label);
  };
  mark("service");
  if (kind === "svc") mark("name");
  if (kind === "edge") (mark("from"), mark("to"));
  if (kind.startsWith("err.") && typeof t.key === "string") t.key = labelKey("err.g", t.key, label);
  return t;
}
