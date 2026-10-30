import { useEffect, useRef, useState } from "react";
import { Tag } from "lucide-react";
import type { TagInput, TagScope } from "@wizeworks/lens-core/internal";
import { act } from "../data/useApi";
import { useHost } from "../data/host";
import { createTag, useTags } from "../data/tags";
import { CopyButton } from "./Badges";
import { CodeBox } from "./StackBox";
import { ScopePicker, TagForm } from "./TagForm";
import "../styles/tags.css";

/** How to add a rule in code, for in-app add-ons: their tags live in the `tags` option. */
export function tagCode(t: Pick<TagInput, "name" | "query" | "color">): { node: string; dotnet: string } {
  const js = JSON.stringify;
  return {
    node: `tags: { rules: [{ name: ${js(t.name)}, query: ${js(t.query)}, color: ${js(t.color)} }] }`,
    dotnet: `o.Tags.Rules.Add(new(${js(t.name)}, ${js(t.query)}, ${js(t.color)}));`,
  };
}

function InCode({ scopes, onClose }: { scopes: readonly TagScope[]; onClose: () => void }) {
  const [picked, setPicked] = useState(0);
  const code = tagCode({ ...scopes[picked]!, color: "blue" });
  return (
    <div className="wl-form">
      {scopes.length > 1 && <ScopePicker scopes={scopes} picked={picked} onPick={setPicked} />}
      <p>Tags here come from the <code>tags</code> option in the app&apos;s code. Add this rule, then restart the service.</p>
      <strong>Node</strong>
      <CodeBox text={code.node} label="Node code" className="wl-tag-code" />
      <CopyButton text={code.node} label="Copy for Node" asLink />
      <strong>.NET</strong>
      <CodeBox text={code.dotnet} label=".NET code" className="wl-tag-code" />
      <CopyButton text={code.dotnet} label="Copy for .NET" asLink />
      <div className="wl-dialog-actions">
        <button type="button" className="wl-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function TagDialog({ scopes, onClose }: { scopes: readonly TagScope[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const editable = useTags()?.list.editable ?? false;
  useEffect(() => ref.current?.showModal(), []);
  const save = (t: TagInput) => act(() => createTag(t), onClose);
  const first = scopes[0]!;
  return (
    <dialog ref={ref} className="wl-dialog wl-tag-dialog" aria-labelledby="wl-tag-this" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <h2 id="wl-tag-this">Tag this</h2>
      {editable ? <TagForm initial={{ name: first.name, color: "blue", query: first.query }} scopes={scopes} saveLabel="Add tag" onSave={save} onCancel={onClose} /> : <InCode scopes={scopes} onClose={onClose} />}
    </dialog>
  );
}

/** "Tag this": a tag for something that outlives its traces. Hidden where the caller cannot add tags (a viewer on the cloud). */
export function TagThis({ scopes }: { scopes: readonly TagScope[] }) {
  const host = useHost();
  const tags = useTags();
  const [open, setOpen] = useState(false);
  if (!host.has("tags") || !scopes.length || !(tags?.list.editable || host.mode === "in-app")) return null;
  return (
    <>
      <button type="button" className="wl-btn" onClick={() => setOpen(true)} title="Make a tag for this, so it stands out everywhere">
        <Tag aria-hidden="true" /> Tag this
      </button>
      {open && <TagDialog scopes={scopes} onClose={() => setOpen(false)} />}
    </>
  );
}
