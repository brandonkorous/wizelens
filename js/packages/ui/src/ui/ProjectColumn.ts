import { type InProject, isAllProjects } from "../data/projectScope";
import type { Column } from "./Table";

/** Under "All projects": a Project column from each row's project label. None otherwise. */
export function projectColumn<T>(): Column<T>[] {
  if (!isAllProjects()) return [];
  const label = (r: T) => (r as InProject<T>).project ?? "";
  return [{ key: "project", header: "Project", sort: label, cell: label }];
}
