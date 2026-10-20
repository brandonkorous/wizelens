import { Fragment } from "react";
import { currentProject, useAccount } from "../data/account";
import { setProjectScope } from "../data/prefs";
import { Empty } from "./Panel";

/** Under "All projects", for what belongs to one project (settings, a status page): the organization's projects, a click switches to one. */
export function PickProject({ what }: { what: string }) {
  const projects = currentProject(useAccount())?.org.projects ?? [];
  return (
    <Empty title="Pick a project">
      {what} belong to one project. Show{" "}
      {projects.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && (i === projects.length - 1 ? " or " : ", ")}
          <button type="button" className="wl-link-btn" onClick={() => setProjectScope(p.id)}>
            {p.name}
          </button>
        </Fragment>
      ))}
      .
    </Empty>
  );
}
