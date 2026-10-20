// What a page reads besides telemetry, for every project of a read: issue states, Apdex targets, and tags. With many projects, keys carry each project's label.
import { type ApdexTargets, type IssueState, issueStatesOf, type IssueStates, labelKey, labelPart, type TagRule } from "@wizeworks/lens-core";
import type { CloudApp } from "../app.js";
import { listIssues } from "../repo/issues.js";
import { apdexTargets } from "../repo/slos.js";
import { projectTags } from "../repo/tags.js";
import { projectLabels, type ProjectRef } from "./scope.js";

/** Each project's label when there are many; null for one. */
const labelsOf = (projects: readonly ProjectRef[]) => (projects.length > 1 ? projectLabels(projects) : null);

/** Issue states of every project; an error group's key names its service with the project's label. */
export async function scopeIssues(app: CloudApp, projects: readonly ProjectRef[]): Promise<IssueStates> {
  const labels = labelsOf(projects);
  const label = (s: IssueState, id: string): IssueState => (labels && s.kind === "error" ? { ...s, key: labelKey("err.g", s.key, labels[id]!) } : s);
  const lists = await Promise.all(projects.map(async (p) => (await listIssues(app.db, p.id)).map((s) => label(s, p.id))));
  return issueStatesOf(lists.flat());
}

/** Apdex targets of every project, by service as shown. */
export async function scopeApdex(app: CloudApp, projects: readonly ProjectRef[]): Promise<ApdexTargets> {
  const labels = labelsOf(projects);
  const each = await Promise.all(projects.map(async (p) => Object.entries(await apdexTargets(app.db, p.id)).map(([k, v]) => [labels ? labelPart(k, labels[p.id]!) : k, v] as const)));
  return Object.fromEntries(each.flat());
}

/** The tag rules of every project; a name two projects use keeps the first project's rule. */
export async function scopeTags(app: CloudApp, projects: readonly ProjectRef[]): Promise<TagRule[]> {
  const each = await Promise.all(projects.map((p) => projectTags(app.db, p.id)));
  const byName = new Map<string, TagRule>();
  for (const t of each.flat()) if (!byName.has(t.name)) byName.set(t.name, t);
  return [...byName.values()];
}
