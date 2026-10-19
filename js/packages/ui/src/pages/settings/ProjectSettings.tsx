import { type FormEvent, useEffect, useState } from "react";
import type { ProjectSettings as Settings } from "@wizeworks/lens-core";
import { apiSend } from "../../data/api";
import { type SettingsReply, useProjectSettingsApi } from "../../data/projectSettings";
import { useApi } from "../../data/useApi";
import { Field, FormRow } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";

interface Draft {
  slowQueryMs: string;
  nPlusOneThreshold: string;
  retentionDays: string;
  redactKeys: string;
}

const draftOf = (s: Settings): Draft => ({
  slowQueryMs: s.slowQueryMs?.toString() ?? "",
  nPlusOneThreshold: s.nPlusOneThreshold?.toString() ?? "",
  retentionDays: s.retentionDays?.toString() ?? "",
  redactKeys: (s.redactKeys ?? []).join(", "),
});

const bodyOf = (d: Draft) => ({
  slowQueryMs: d.slowQueryMs || null,
  nPlusOneThreshold: d.nPlusOneThreshold || null,
  retentionDays: d.retentionDays || null,
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

function SettingsForm({ url, reply, canEdit, onSaved }: { url: string; reply: SettingsReply; canEdit: boolean; onSaved: (r: SettingsReply) => void }) {
  const [draft, setDraft] = useState(() => draftOf(reply.settings));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setDraft(draftOf(reply.settings)), [reply]);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const d = reply.defaults;
  const save = (e: FormEvent) => {
    e.preventDefault();
    apiSend<SettingsReply>("PUT", url, bodyOf(draft)).then(
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
        <Field label="Keep data for (days)" narrow type="number" min={1} max={d.retentionDays} disabled={off} value={draft.retentionDays} onChange={set("retentionDays")} placeholder={String(d.retentionDays)} hint={`At most ${d.retentionDays}. Older data is deleted within minutes.`} />
      </FormRow>
      <Field label="More redacted keys" disabled={off} value={draft.redactKeys} onChange={set("redactKeys")} placeholder="ssn, iban, dob" hint="Comma list. A value whose key contains one of these is stored as [redacted], on top of the keys in effect below." />
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
        <div className="wl-section-title">Redacted keys in effect</div>
        <KeysInEffect reply={reply} />
      </div>
    </form>
  );
}

/** One project's thresholds, extra redacted keys, and retention, kept by the hub or the cloud. */
export function ProjectSettings() {
  const api = useProjectSettingsApi();
  const { data, error, reload } = useApi<SettingsReply>(api.url);
  const [saved, setSaved] = useState<SettingsReply | null>(null);
  const reply = saved ?? data;
  const who = api.canEdit ? "" : " Only owners and admins can change them.";
  return (
    <>
      <SectionHead title="This project" description={`Settings for ${api.label || "this project"}. Thresholds and redacted keys apply to data that arrives after you save.${who}`} />
      <Panel>
        {!api.url && <Empty title="Pick a project first">Choose a project at the top of the page.</Empty>}
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        {api.url && reply && <SettingsForm url={api.url} reply={reply} canEdit={api.canEdit} onSaved={(r) => (setSaved(r), reload())} />}
      </Panel>
    </>
  );
}
