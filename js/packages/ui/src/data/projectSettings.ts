// Project settings: where the host keeps them (the cloud by project id, the hub by `?project=`), and who may change them.
import type { ProjectSettings, SettingsDefaults } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "./account";
import { useHost } from "./host";
import { getScope } from "./prefs";

/** `GET` and `PUT` of the settings route: the host's values, the project's own, and the ones in effect. */
export interface SettingsReply {
  defaults: SettingsDefaults;
  settings: ProjectSettings;
  effective: SettingsDefaults;
}

export interface ProjectSettingsApi {
  /** Null while there is no project to ask about, or the host keeps no settings. */
  url: string | null;
  canEdit: boolean;
  /** The project's name in the cloud; the hub's project scope, or "the default project". */
  label: string;
}

/** Owners and admins of the organization, and people made admin of the project, change cloud settings; anyone on the hub. */
export function useProjectSettingsApi(): ProjectSettingsApi {
  const host = useHost();
  const cloud = host.has("accounts");
  const here = currentProject(useAccount());
  const project = getScope().project;
  const role = here?.project.role ?? here?.org.role;
  if (!host.has("settings")) return { url: null, canEdit: false, label: "" };
  if (cloud) return { url: project ? `./api/projects/${encodeURIComponent(project)}/settings` : null, canEdit: role === "owner" || role === "admin", label: here?.project.name ?? "" };
  return { url: `./api/settings?project=${encodeURIComponent(project)}`, canEdit: true, label: project || "the default project" };
}
