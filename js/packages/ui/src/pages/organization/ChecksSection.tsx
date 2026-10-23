import { type FormEvent, useEffect, useState } from "react";
import type { ProjectSettings as Settings } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "../../data/account";
import { apiSend } from "../../data/api";
import { firstProject, type SettingsReply, settingsBody, useSettingsProjects } from "../../data/projectSettings";
import { useApi } from "../../data/useApi";
import { Field, FormRow, SelectField } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { CopySettings } from "./CopySettings";

interface Draft {
  slowQueryMs: string;
  nPlusOneThreshold: string;
  redactKeys: string;
}

const draftOf = (s: Settings): Draft => ({
  slowQueryMs: s.slowQueryMs?.toString() ?? "",
  nPlusOneThreshold: s.nPlusOneThreshold?.toString() ?? "",
  redactKeys: (s.redactKeys ?? []).join(", "),
});

/** The draft's fields only; retention stays as the project has it. */
const patchOf = (d: Draft) => ({
  slowQueryMs: d.slowQueryMs || null,
  nPlusOneThreshold: d.nPlusOneThreshold || null,
  redactKeys: d.redactKeys.split(",").map((k) => k.trim()).filter(Boolean),
});

/** The keys in effect: the host's in gray, the project's own in color. */
function KeysInEffect({ reply }: { reply: SettingsReply }) {
  const own = new Set(reply.settings.redactKeys ?? []);
  return (
    <div className="wl-chips">
      {reply.effective.redactKeys.map((k) => <span key={k} className={`wl-chip wl-mono${own.has(k) ? " wl-chip-own" : ""}`}>{k}</span>)}
    </div>
  );
}

function ChecksForm({ url, reply, canEdit, onSaved }: { url: string; reply: SettingsReply; canEdit: boolean; onSaved: (r: SettingsReply) => void }) {
  const [draft, setDraft] = useState(() => draftOf(reply.settings));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setDraft(draftOf(reply.settings)), [reply]);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const d = reply.defaults;
  const save = (e: FormEvent) => {
    e.preventDefault();
    apiSend<SettingsReply>("PUT", url, settingsBody(reply.settings, patchOf(draft))).then(
      (r) => (onSaved(r), setNote({ ok: true, text: "Saved. New data uses these settings." })),
      (err: unknown) => setNote({ ok: false, text: err instanceof Error ? err.message : String(err) }),
    );
  };
  const off = !canEdit;
  return (
    <form className="wl-form" onSubmit={save}>
      <FormRow>
        <Field label="Slow query (ms)" narrow type="number" min={1} max={60000} disabled={off} value={draft.slowQueryMs} onChange={set("slowQueryMs")} placeholder={String(d.slowQueryMs)} hint={`A database call this slow or slower counts as slow. Empty: ${d.slowQueryMs}.`} />
        <Field label="N+1 threshold" narrow type="number" min={2} max={1000} disabled={off} value={draft.nPlusOneThreshold} onChange={set("nPlusOneThreshold")} placeholder={String(d.nPlusOneThreshold)} hint={`This many similar calls in one request is an N+1. Empty: ${d.nPlusOneThreshold}.`} />
      </FormRow>
      <Field label="More hidden keys" disabled={off} value={draft.redactKeys} onChange={set("redactKeys")} placeholder="ssn, iban, dob" hint="Comma list. A value whose key contains one of these is stored as [redacted], on top of the keys in effect below." />
      {note && !note.ok && <div className="wl-banner wl-banner-error">{note.text}</div>}
      {canEdit && (
        <div className="wl-form-actions wl-form-actions-split">
          <span className="wl-muted wl-small" role="status">{note?.ok ? note.text : ""}</span>
          <span className="wl-row-actions">
            <button type="button" className="wl-btn" onClick={() => setDraft(draftOf({}))}>Use the defaults</button>
            <button type="submit" className="wl-btn wl-btn-primary">Save settings</button>
          </span>
        </div>
      )}
      <div>
        <div className="wl-section-title">Hidden keys in effect</div>
        <KeysInEffect reply={reply} />
      </div>
    </form>
  );
}

/** One project's settings, loaded fresh for it: a new project never saves over with the last one's values. */
function ProjectChecks({ url, canEdit }: { url: string; canEdit: boolean }) {
  const { data, error, reload } = useApi<SettingsReply>(url);
  const [saved, setSaved] = useState<SettingsReply | null>(null);
  const reply = saved ?? data;
  return (
    <>
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {reply ? <ChecksForm url={url} reply={reply} canEdit={canEdit} onSaved={(r) => (setSaved(r), reload())} /> : !error && <p className="wl-muted">Loading…</p>}
    </>
  );
}

/** Thresholds and extra hidden keys of the project picked here, not the one chosen at the top. */
export function ChecksSection() {
  const sp = useSettingsProjects();
  const orgId = currentProject(useAccount())?.org.id;
  const [picked, setPicked] = useState(() => firstProject(sp.options));
  const [copying, setCopying] = useState(false);
  const canCopy = sp.cloud && !!orgId && sp.canEdit(picked) && sp.options.filter(([id]) => sp.canEdit(id)).length > 1;
  const name = sp.options.find(([id]) => id === picked)?.[1] ?? picked;
  const who = sp.cloud && !sp.canEdit(picked) ? " Only owners and admins can change them." : "";
  return (
    <>
      <SectionHead title="Thresholds and hidden keys" description={`When a database call counts as slow, when repeated calls count as an N+1, and which values are stored as [redacted]. Changes apply to data that arrives after you save.${who}`} />
      <Panel>
        {sp.options.length === 0 ? (
          <Empty title="No projects yet" />
        ) : (
          <>
            <FormRow>
              <SelectField label="Project" value={picked} options={sp.options} onChange={setPicked} />
              {canCopy && <button type="button" className="wl-btn" onClick={() => setCopying(true)}>Copy to other projects</button>}
            </FormRow>
            {copying && orgId && <CopySettings orgId={orgId} from={{ id: picked, name }} targets={sp.options.filter(([id]) => sp.canEdit(id))} onClose={() => setCopying(false)} />}
            <ProjectChecks key={picked} url={sp.url(picked)} canEdit={sp.canEdit(picked)} />
          </>
        )}
      </Panel>
    </>
  );
}
