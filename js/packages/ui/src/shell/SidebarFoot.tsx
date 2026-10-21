import { BookOpen } from "lucide-react";
import { useData } from "../data/provider";

const DOCS_URL = "https://wizelens.com/docs";
const CHANGELOG_URL = "https://wizelens.com/changelog";

/** Bottom of the menu: a link to the docs and the version, which opens the changelog. */
export function SidebarFoot() {
  const { info } = useData();
  const version = info?.version ? `v${info.version.replace(/^v/, "")}` : null;
  return (
    <div className="wl-sidebar-foot">
      <a className="wl-foot-docs" href={DOCS_URL} target="_blank" rel="noreferrer" title="WizeLens docs">
        <BookOpen aria-hidden={true} />
        <span>Docs</span>
      </a>
      {version && (
        <a className="wl-foot-version" href={CHANGELOG_URL} target="_blank" rel="noreferrer" title="What's new in WizeLens">
          {version}
        </a>
      )}
    </div>
  );
}
