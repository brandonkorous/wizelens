// Project settings: where the host keeps them (the cloud by project id, the hub by `?project=`), and who may change them.
import type { ProjectSettings, SettingsDefaults } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "./account";
import { useData } from "./hooks";
import { useHost } from "./host";
import { getScope } from "./prefs";
import { ALL_PROJECTS } from "./projectScope";

/** `GET` and `PUT` of the settings route: the host's values, the project's own, and the ones in effect. */
export interface SettingsReply {
  defaults: SettingsDefaults;
  settings: ProjectSettings;
  effective: SettingsDefaults;
}

/** Where one project's settings live. */
export const settingsUrlOf = (cloud: boolean, project: string): string =>
  cloud ? `./api/projects/${encodeURIComponent(project)}/settings` : `./api/settings?project=${encodeURIComponent(project)}`;

/** A PUT body that keeps every setting the project has and changes the ones in `patch`; null or empty falls back to the host. */
export function settingsBody(s: ProjectSettings, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { slowQueryMs: s.slowQueryMs ?? null, nPlusOneThreshold: s.nPlusOneThreshold ?? null, retentionDays: s.retentionDays ?? null, redactKeys: s.redactKeys ?? [], ...patch };
}

/** The projects that keep settings here: their ids and names, who may change each, and where each lives. */
export interface SettingsProjects {
  cloud: boolean;
  options: [string, string][];
  canEdit: (id: string) => boolean;
  url: (id: string) => string;
}

const manages = (role: string | undefined) => role === "owner" || role === "admin";

/** The cloud: the shown organization's projects, changed by its owners and admins (or a project's admins). The hub: its projects, changed by anyone. */
export function useSettingsProjects(): SettingsProjects {
  const cloud = useHost().has("accounts");
  const org = currentProject(useAccount())?.org;
  const registry = useData().registry;
  if (cloud) {
    const projects = org?.projects ?? [];
    const canEdit = (id: string) => manages(projects.find((p) => p.id === id)?.role ?? org?.role);
    return { cloud, options: projects.map((p) => [p.id, p.name]), canEdit, url: (id) => settingsUrlOf(true, id) };
  }
  const scope = getScope().project;
  const names = [...new Set([...(registry?.projects ?? []), ...(scope && scope !== ALL_PROJECTS ? [scope] : [])])];
  const options: [string, string][] = names.length ? names.map((n) => [n, n]) : [["", "Default project"]];
  return { cloud, options, canEdit: () => true, url: (id) => settingsUrlOf(false, id) };
}

/** The project to show first: the one chosen at the top when it is in the list, else the first. */
export function firstProject(options: [string, string][]): string {
  const scope = getScope().project;
  return options.some(([id]) => id === scope) ? scope : (options[0]?.[0] ?? "");
}
