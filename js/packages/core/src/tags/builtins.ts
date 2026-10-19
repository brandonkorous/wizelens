// Tags WizeLens ships: on by default, each one can be turned off per project, never edited.
import { checkSearch } from "../search/check.js";
import type { ActiveTag, TagColor, TagRule } from "./types.js";

const UA = "@user_agent.original";

/** Built-in tags in the order the dashboard lists them. The .NET add-on ships the same three (Tags/BuiltInTags.cs). */
export const BUILT_IN_TAGS: readonly { name: string; color: TagColor; query: string }[] = [
  { name: "stream", color: "violet", query: "@http.response.header.content-type:text/event-stream*" },
  { name: "probe", color: "slate", query: `${UA}:kube-probe/* OR ${UA}:GoogleHC/* OR ${UA}:ELB-HealthChecker/* OR ${UA}:GoogleStackdriverMonitoring-UptimeChecks*` },
  { name: "bot", color: "amber", query: `${UA}:*bot* OR ${UA}:*crawler* OR ${UA}:*spider*` },
];

export const BUILT_IN_PREFIX = "builtin:";

export const builtInId = (name: string): string => `${BUILT_IN_PREFIX}${name}`;

export const isBuiltInName = (name: string): boolean => BUILT_IN_TAGS.some((t) => t.name === name);

/** A project's tags: built-ins first (minus those it turned off), then its own rules by name. */
export function tagList(rules: readonly TagRule[], disabled: ReadonlySet<string>): TagRule[] {
  const builtIns = BUILT_IN_TAGS.map((t) => ({ id: builtInId(t.name), ...t, builtIn: true, enabled: !disabled.has(t.name) }));
  const own = rules.filter((r) => !r.builtIn).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return [...builtIns, ...own];
}

/** The enabled tags with a search that parses, ready to run. */
export function activeTags(tags: readonly TagRule[]): ActiveTag[] {
  return tags.flatMap((t) => {
    if (!t.enabled) return [];
    const c = checkSearch(t.query);
    return c.ok && c.node ? [{ name: t.name, color: t.color, node: c.node }] : [];
  });
}
