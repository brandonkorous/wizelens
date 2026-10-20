// Rollup keys when one read covers many projects: rows named by a service group by project too, and show its label.
import type { RollupKind } from "../kinds.js";
import type { KeyFilter } from "../needs.js";
import type { SqlSource, SqlText } from "./dialect.js";
import { labelKey, labelTop, servicePartsOf, unlabelKey, unlabelPieces } from "./project-keys.js";

type Row = Record<string, unknown>;

/** The read's project labels when this kind's rows stay apart per project: many projects, and a key that names a service. */
function labelsOf(src: SqlSource, kind: RollupKind): Readonly<Record<string, string>> | null {
  const s = src.scope;
  return s.labels && (s.projects?.length ?? 0) > 1 && servicePartsOf(kind).length ? s.labels : null;
}

/** The key columns: the key, and the project first when rows stay apart per project. */
export const keyCols = (src: SqlSource, kind: RollupKind): string => (labelsOf(src, kind) ? `${src.d.project}, key` : "key");

/** A row's key as shown: with its project's label on each service part when rows stay apart. */
export function shownKey(src: SqlSource, kind: RollupKind, r: Row): string {
  const labels = labelsOf(src, kind);
  return labels ? labelKey(kind, String(r.key), labels[String(r[src.d.project])] ?? "") : String(r.key);
}

/** The key is one of `keys` (shown keys): a labeled one matches in its project only. */
export function keyIn(q: SqlText, src: SqlSource, kind: RollupKind, keys: readonly string[]): string {
  const labels = labelsOf(src, kind);
  if (!labels) return q.in("key", keys);
  const byProject = new Map<string | null, string[]>();
  for (const k of keys) {
    const u = unlabelKey(kind, k, labels);
    byProject.set(u.project, [...(byProject.get(u.project) ?? []), u.key]);
  }
  const conds = [...byProject].map(([p, ks]) => (p === null ? q.in("key", ks) : `(${src.d.project} = ${q.p(p)} AND ${q.in("key", ks)})`));
  return conds.length ? `(${conds.join(" OR ")})` : "1 = 0";
}

/** A prefix or parts filter that names a labeled service reads its project only. */
export function unlabeledFilter(q: SqlText, src: SqlSource, kind: RollupKind, f: KeyFilter | undefined): { f: KeyFilter | undefined; where: string[] } {
  const labels = labelsOf(src, kind);
  if (!labels || !f) return { f, where: [] };
  const prefix = f.prefix === undefined ? null : unlabelKey(kind, f.prefix, labels);
  const parts = f.parts ? unlabelPieces(kind, f.parts, labels) : null;
  const projects = [prefix?.project, parts?.project].filter((p): p is string => !!p);
  const where = [...new Set(projects)].map((p) => `${src.d.project} = ${q.p(p)}`);
  return { f: { ...f, ...(prefix ? { prefix: prefix.key } : {}), ...(parts ? { parts: parts.pieces } : {}) }, where };
}

/** A row's top as shown: with its project's label where it names a service. */
export function shownTop(src: SqlSource, kind: RollupKind, r: Row, top: unknown): unknown {
  const labels = labelsOf(src, kind);
  return labels ? labelTop(kind, top, labels[String(r[src.d.project])] ?? "") : top;
}
