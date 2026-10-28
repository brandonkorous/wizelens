import { closeMissedProject, currentProject, useAccount, useMissedProject } from "../data/account";

/** A link named a project this person cannot open: say so, and name what is shown instead. */
export function MissedProjectBanner() {
  const here = currentProject(useAccount());
  if (!useMissedProject() || !here) return null;
  return (
    <div className="wl-banner wl-banner-info wl-banner-thin" role="status">
      The link was for a project you cannot open, so you see {here.project?.name ?? `all projects of ${here.org.name}`}.{" "}
      <button type="button" className="wl-link-btn" onClick={closeMissedProject}>Close</button>
    </div>
  );
}
