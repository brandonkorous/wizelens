import { type ReactNode, useState } from "react";
import { currentProject, useAccount } from "../data/account";
import { isAllProjects } from "../data/projectScope";
import { SelectField } from "./Field";

/** Under "All projects", the project a new alert, SLO, or check goes to: the first of the organization's until one is picked. Null otherwise. */
export function useTargetProject(): { id: string | null; field: ReactNode } {
  const projects = currentProject(useAccount())?.org.projects ?? [];
  const [picked, setPicked] = useState("");
  if (!isAllProjects() || !projects.length) return { id: null, field: null };
  const id = projects.some((p) => p.id === picked) ? picked : projects[0]!.id;
  const field = <SelectField label="Project" value={id} options={projects.map((p): [string, string] => [p.id, p.name])} onChange={setPicked} hint="New items belong to one project." />;
  return { id, field };
}
