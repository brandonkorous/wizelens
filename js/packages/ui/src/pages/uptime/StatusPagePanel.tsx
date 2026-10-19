import { useState } from "react";
import { currentProject, useAccount } from "../../data/account";
import { apiSend } from "../../data/api";
import { useHost } from "../../data/host";
import { getScope } from "../../data/prefs";
import { act, useApi } from "../../data/useApi";
import { fmtCount, fmtDate } from "../../format";
import { CopyButton } from "../../ui/Badges";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";

interface Settings {
  enabled: boolean;
  title?: string;
  createdMs?: number;
  views?: number;
}

/** The public status page of the project (cloud): off by default; on, anyone with the link sees check names, uptime, and incident times. */
export function StatusPagePanel() {
  const host = useHost();
  const project = getScope().project;
  const role = currentProject(useAccount())?.org.role;
  const base = `./api/projects/${project}/status-page`;
  const { data, error, reload } = useApi<Settings>(host.has("statusPages") && project ? base : null);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!host.has("statusPages") || !data) return null;
  const canWrite = role !== undefined && role !== "viewer";
  const make = () => void act(() => apiSend<{ url: string }>("POST", base, { title: title || data.title }).then((r) => setLink(r.url)), reload).then(setProblem);
  const off = () => void act(() => apiSend("DELETE", base), reload).then((e) => (setProblem(e), setLink(null)));
  return (
    <Panel title="Public Status Page">
      <p className="wl-muted wl-uptime-status-note">
        {data.enabled
          ? `On since ${fmtDate(data.createdMs!)} as "${data.title}", opened ${fmtCount(data.views ?? 0)} times. It shows check names, whether they are up, uptime, and when incidents happened; never URLs or errors.`
          : "Off. Turn it on to share an unguessable, read-only link with your users: check names, whether they are up, uptime, and when incidents happened. Never URLs or errors."}
      </p>
      {link && (
        <div className="wl-share-link">
          <code>{link}</code>
          <CopyButton text={link} />
          <span className="wl-muted wl-small">Copy it now: the link is shown only once. A new link stops the old one.</span>
        </div>
      )}
      {(error || problem) && <div className="wl-banner wl-banner-error">{error ?? problem}</div>}
      {canWrite && (
        <FormRow>
          <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={data.title ?? "Project name"} />
          <button type="button" className="wl-btn wl-btn-primary" onClick={make}>{data.enabled ? "New link" : "Turn on"}</button>
          {data.enabled && <button type="button" className="wl-btn" onClick={off}>Turn off</button>}
        </FormRow>
      )}
    </Panel>
  );
}
