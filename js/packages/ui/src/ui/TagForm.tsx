import { type FormEvent, useEffect, useState } from "react";
import { checkSearch, TAG_COLORS, type TagColor, type TagInput, type TagScope, TIME_RANGES, usesTags } from "@wizeworks/lens-core";
import { useHost, useRange } from "../data/host";
import { runSearch } from "../data/search";
import { Field, FormRow } from "./Field";
import "../styles/tags.css";

const PREVIEW_DELAY_MS = 400;
const PREVIEW_LIMIT = 50;

type Preview = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | { state: "done"; paths: string[]; more: boolean };

/** What the search finds now, among requests in the chosen time range; it waits for typing to pause. */
function usePreview(query: string): Preview {
  const [range] = useRange();
  const server = useHost().has("search");
  const [preview, setPreview] = useState<Preview>({ state: "idle" });
  useEffect(() => {
    const c = checkSearch(query.trim());
    if (!query.trim()) return void setPreview({ state: "idle" });
    if (!c.ok) return void setPreview({ state: "error", message: c.error });
    if (usesTags(c.node)) return void setPreview({ state: "error", message: "A tag's search cannot use tag:. Copy the other tag's search in instead." });
    let live = true;
    setPreview({ state: "loading" });
    const timer = setTimeout(() => {
      runSearch({ q: query.trim(), kind: "requests", range, limit: PREVIEW_LIMIT }, null, server).then(
        (p) => live && setPreview({ state: "done", paths: p.items.map((r) => `${(r as { method: string }).method} ${(r as { path: string }).path}`), more: !!p.next }),
        (e: unknown) => live && setPreview({ state: "error", message: e instanceof Error ? e.message : String(e) }),
      );
    }, PREVIEW_DELAY_MS);
    return () => ((live = false), clearTimeout(timer));
  }, [query, range, server]);
  return preview;
}

function PreviewBox({ query }: { query: string }) {
  const p = usePreview(query);
  const [range] = useRange();
  const when = TIME_RANGES[range].label.toLowerCase();
  if (p.state === "idle") return null;
  if (p.state === "loading") return <div className="wl-tag-preview wl-muted">Checking what this finds…</div>;
  if (p.state === "error") return <div className="wl-tag-preview wl-text-error" role="alert">{p.message}</div>;
  if (!p.paths.length) return <div className="wl-tag-preview">No requests match in the {when}. The tag still shows on any that match later.</div>;
  const count = `${p.paths.length}${p.more ? "+" : ""} ${p.paths.length === 1 && !p.more ? "request" : "requests"}`;
  return (
    <div className="wl-tag-preview">
      <span>Matches {count} in the {when}, such as:</span>
      <ul>{p.paths.slice(0, 5).map((path, i) => <li key={i}>{path}</li>)}</ul>
    </div>
  );
}

function ColorPicker({ value, name, onChange }: { value: TagColor; name: string; onChange: (c: TagColor) => void }) {
  return (
    <fieldset className="wl-tag-colors">
      <legend>Color</legend>
      {TAG_COLORS.map((c) => (
        <label key={c}>
          <input type="radio" name="tag-color" value={c} checked={value === c} onChange={() => onChange(c)} aria-label={c} />
          <span className={`wl-tag wl-tag-${c}`}>{name || c}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function ScopePicker({ scopes, picked, onPick }: { scopes: readonly TagScope[]; picked: number; onPick: (i: number) => void }) {
  return (
    <fieldset className="wl-tag-scopes">
      <legend>Tag what</legend>
      {scopes.map((s, i) => (
        <label key={s.label} className="wl-check">
          <input type="radio" name="tag-scope" checked={picked === i} onChange={() => onPick(i)} />
          <span>{s.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export interface TagFormProps {
  initial: TagInput;
  /** "Tag this": the things the tag can stand for; picking one fills in the name and search. */
  scopes?: readonly TagScope[];
  saveLabel: string;
  onSave: (t: TagInput) => Promise<string | null>;
  onCancel: () => void;
}

/** A tag rule: its name, color, and search, with what the search finds now. The host checks it again on save. */
export function TagForm({ initial, scopes, saveLabel, onSave, onCancel }: TagFormProps) {
  const [t, setT] = useState(initial);
  const [picked, setPicked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = (i: number) => {
    setPicked(i);
    setT((x) => ({ ...x, name: scopes![i]!.name, query: scopes![i]!.query }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    void onSave({ ...t, name: t.name.trim().toLowerCase(), query: t.query.trim() }).then((err) => (setError(err), setBusy(false)));
  };
  return (
    <form className="wl-form" onSubmit={submit}>
      {scopes && scopes.length > 1 && <ScopePicker scopes={scopes} picked={picked} onPick={pick} />}
      <FormRow>
        <Field label="Name" required value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="checkout" maxLength={40} hint="Lowercase letters, digits, - and _. Search it with tag:name." />
      </FormRow>
      <ColorPicker value={t.color} name={t.name.trim().toLowerCase()} onChange={(color) => setT({ ...t, color })} />
      <Field label="Search" required value={t.query} onChange={(e) => setT({ ...t, query: e.target.value })} placeholder="service:api route:/checkout*" className="wl-tag-query" hint="Anything that matches this search shows the tag, on old and new data alike." />
      <PreviewBox query={t.query} />
      {error && <div className="wl-banner wl-banner-error" role="alert">{error}</div>}
      <FormRow>
        <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>{saveLabel}</button>
        <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
      </FormRow>
    </form>
  );
}
