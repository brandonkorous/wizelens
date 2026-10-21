import { BookOpen } from "lucide-react";
import { useData } from "../data/provider";

const DOCS_URL = "https://wizelens.com/docs/";
const CHANGELOG_URL = "https://wizelens.com/changelog/";

/** The changelog at this version's entry: the site ids each release `v` + the version with every run of other characters as `-`. */
function changelogUrl(version: string): string {
  const plain = version.replace(/^v/, "").replace(/\+.*$/, "");
  return /^\d+\.\d+\.\d+(-[0-9a-z.-]+)?$/i.test(plain) ? `${CHANGELOG_URL}#v${plain.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : CHANGELOG_URL;
}

/** Bottom of the menu: a link to the docs and the version, which opens the changelog at that release. */
export function SidebarFoot() {
  const { info } = useData();
  const raw = info?.version ?? "";
  const version = raw ? `v${raw.replace(/^v/, "")}` : null;
  return (
    <div className="wl-sidebar-foot">
      <a className="wl-foot-docs" href={DOCS_URL} target="_blank" rel="noreferrer" title="WizeLens docs">
        <BookOpen aria-hidden={true} />
        <span>Docs</span>
      </a>
      {version && (
        <a className="wl-foot-version" href={changelogUrl(raw)} target="_blank" rel="noreferrer" title="What's new in this version">
          {version}
        </a>
      )}
    </div>
  );
}
