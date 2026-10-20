import { useState } from "react";
import { Link2 } from "lucide-react";
import { apiSend } from "../../data/api";
import { getScope } from "../../data/prefs";
import { fmtDate } from "../../format";
import { CopyButton } from "../../ui/Badges";
import { Select } from "../../ui/Controls";
import { Menu } from "../../shell/Menu";
import { isAllProjects } from "../../data/projectScope";

const DAYS: [string, string][] = [
  ["1", "1 day"],
  ["7", "7 days"],
  ["30", "30 days"],
];

/** Make a read-only link to this trace. Anyone with the link can open it until it expires or is revoked. */
export function ShareButton({ traceId }: { traceId: string }) {
  // A link belongs to one project: under "All projects", pick the project first.
  return isAllProjects() ? null : <ShareMenu traceId={traceId} />;
}

function ShareMenu({ traceId }: { traceId: string }) {
  const [days, setDays] = useState("7");
  const [link, setLink] = useState<{ url: string; expiresMs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = () => {
    setError(null);
    apiSend<{ url: string; expiresMs: number }>("POST", `./api/projects/${getScope().project}/shares`, { traceId, days: Number(days) }).then(setLink, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  };
  const label = (
    <>
      <Link2 aria-hidden="true" /> Share
    </>
  );
  return (
    <Menu label={label} title="Share a read-only link" buttonClass="wl-btn">
      {() => (
        <div className="wl-share">
          <div className="wl-menu-head">Read-only link</div>
          <p className="wl-muted wl-small">Anyone with the link sees this trace, and nothing else. Secrets were removed when the trace was stored.</p>
          <div className="wl-share-row">
            <Select small label="Link lasts" value={days} options={DAYS} onChange={setDays} />
            <button type="button" className="wl-btn wl-btn-primary" onClick={create}>
              Create link
            </button>
          </div>
          {link && (
            <div className="wl-share-link">
              <code className="wl-mono wl-small">{link.url}</code>
              <CopyButton text={link.url} label="Copy link" />
              <span className="wl-muted wl-small">Works until {fmtDate(link.expiresMs)}. Revoke it on the Team page.</span>
            </div>
          )}
          {error && <div className="wl-banner wl-banner-error">{error}</div>}
        </div>
      )}
    </Menu>
  );
}
