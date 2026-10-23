import { useState } from "react";
import { Plus } from "lucide-react";
import type { TagInput, TagRule } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { createTag, deleteTag, setTagEnabled, updateTag, useTags } from "../../data/tags";
import { act } from "../../data/useApi";
import { useAsk } from "../../ui/Dialog";
import { Check } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { SectionHead } from "../../ui/Sections";
import { type Column, Table } from "../../ui/Table";
import { TagChip } from "../../ui/TagChips";
import { TagForm } from "../../ui/TagForm";
import { tagCode } from "../../ui/TagThis";

const NEW: TagInput = { name: "", color: "blue", query: "" };

const BUILT_IN_HELP: Record<string, string> = {
  stream: "Responses sent as a stream of events (server-sent events), such as MCP and live updates. They stay open on purpose, so they look slow.",
  probe: "Health checks from Kubernetes, Google Cloud, and AWS load balancers.",
  bot: "Crawlers and bots, by their user agent.",
};

function builtInColumns(editable: boolean, onToggle: (t: TagRule) => void): Column<TagRule>[] {
  return [
    { key: "tag", header: "Tag", cell: (t) => <TagChip tag={t} /> },
    { key: "what", header: "Shows on", className: "wl-wrap", cell: (t) => BUILT_IN_HELP[t.name] ?? <span className="wl-tag-query">{t.query}</span> },
    { key: "on", header: "On", cell: (t) => <Check label={t.enabled ? "On" : "Off"} checked={t.enabled} disabled={!editable} onChange={() => onToggle(t)} /> },
  ];
}

function ruleColumns(editable: boolean, onEdit: (t: TagRule) => void, onDelete: (t: TagRule) => void): Column<TagRule>[] {
  return [
    { key: "tag", header: "Tag", cell: (t) => <TagChip tag={t} /> },
    { key: "query", header: "Search", className: "wl-wrap", cell: (t) => <span className="wl-tag-query">{t.query}</span> },
    ...(editable
      ? [{ key: "actions", header: "", cell: (t: TagRule) => (
          <span className="wl-row-actions">
            <button type="button" className="wl-link-btn" onClick={() => onEdit(t)}>Edit</button>
            <button type="button" className="wl-link-btn wl-text-error" onClick={() => onDelete(t)}>Delete</button>
          </span>
        ) }]
      : []),
  ];
}

/** Where the rules of an in-app add-on come from, and the code for one more. */
function InCodeNote() {
  const code = tagCode({ name: "checkout", query: "route:/checkout*", color: "green" });
  return (
    <Panel title="Add a tag">
      <p>This service keeps its tags in code. Add a rule to the <code>tags</code> option, then restart the service.</p>
      <pre className="wl-tag-code">{`// Node\n${code.node}\n\n// .NET\n${code.dotnet}`}</pre>
    </Panel>
  );
}

/** The tag rules of the project (or hub, or service): built-in tags to turn off, and rules to add, change, and delete. */
export function TagsSettings() {
  const host = useHost();
  const tags = useTags();
  const { confirm, dialog } = useAsk();
  const [editing, setEditing] = useState<TagRule | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = tags?.list;
  const editable = !!list?.editable;
  const own = list?.tags.filter((t) => !t.builtIn) ?? [];
  const run = (f: () => Promise<unknown>) => void act(f, () => undefined).then(setError);
  const toggle = (t: TagRule) => run(() => setTagEnabled(t.id, !t.enabled));
  const remove = async (t: TagRule) => {
    const yes = await confirm({ title: `Delete the tag "${t.name}"?`, body: "It comes off every request, trace, and log line it marks. Your data stays as it is.", confirmLabel: "Delete tag", danger: true });
    if (yes) run(() => deleteTag(t.id));
  };
  const save = (t: TagInput) => act(() => (editing === "new" ? createTag(t) : updateTag((editing as TagRule).id, t)), () => setEditing(null));
  const full = own.length >= (list?.max ?? 50);
  const add = editable && !editing && <button type="button" className="wl-btn wl-btn-primary" onClick={() => setEditing("new")} disabled={full} title={full ? `Up to ${list?.max} tags` : undefined}><Plus aria-hidden="true" /> New tag</button>;
  const why = host.mode === "in-app" ? "Set in this service's code." : editable ? "Anything that matches a tag's search shows the tag, on old and new data alike." : "Your role can see tags but not change them.";
  return (
    <>
      <SectionHead title="Tags" description={`Name a search, and everything it finds wears that name in every list. Search for it with tag:name. ${why}`} action={add} />
      {dialog}
      {error && <div className="wl-banner wl-banner-error" role="alert">{error}</div>}
      {editing && (
        <Panel title={editing === "new" ? "New tag" : `Edit "${editing.name}"`}>
          <TagForm initial={editing === "new" ? NEW : { name: editing.name, color: editing.color, query: editing.query }} saveLabel="Save tag" onSave={save} onCancel={() => setEditing(null)} />
        </Panel>
      )}
      <Panel title="Your tags" flush>
        <Table columns={ruleColumns(editable, setEditing, (t) => void remove(t))} rows={own} rowKey={(t) => t.id} empty={<Empty title={tags ? "No tags yet" : "Loading…"}>{tags && "Add one here, or use Tag this on a request, an error, or a service."}</Empty>} />
      </Panel>
      {host.mode === "in-app" && <InCodeNote />}
      <Panel title="Built-in tags" flush>
        <Table columns={builtInColumns(editable, toggle)} rows={list?.tags.filter((t) => t.builtIn) ?? []} rowKey={(t) => t.id} />
      </Panel>
    </>
  );
}
