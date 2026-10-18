import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Field } from "./Field";

export interface AskOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** The person types this exact text before the button works, for actions that cannot be undone. */
  typeToConfirm?: string;
  /** Ask for a text value (a rename). The answer is the trimmed text. */
  input?: { label: string; initial?: string; password?: boolean };
}

interface Pending extends AskOptions {
  id: number;
  resolve: (answer: string | null) => void;
}

function AskDialog({ ask, onClose }: { ask: Pending; onClose: (answer: string | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(ask.input?.initial ?? "");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    // Escape closes it as Cancel, through the dialog's own cancel event.
    const cancel = (e: Event) => (e.preventDefault(), closeRef.current(null));
    el?.addEventListener("cancel", cancel);
    return () => el?.removeEventListener("cancel", cancel);
  }, []);
  const ready = ask.typeToConfirm ? text === ask.typeToConfirm : ask.input ? text.trim() !== "" : true;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onClose(ask.input ? (ask.input.password ? text : text.trim()) : "yes");
  };
  const typed = ask.typeToConfirm !== undefined || ask.input !== undefined;
  return (
    <dialog ref={ref} className="wl-dialog" aria-labelledby={`wl-dialog-${ask.id}`} onClick={(e) => e.target === ref.current && onClose(null)} onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), onClose(null))}>
      <form onSubmit={submit}>
        <h2 id={`wl-dialog-${ask.id}`}>{ask.title}</h2>
        {ask.body && <div className="wl-dialog-body">{ask.body}</div>}
        {typed && <Field label={ask.input?.label ?? `Type ${ask.typeToConfirm} to confirm`} value={text} onChange={(e) => setText(e.target.value)} autoFocus type={ask.input?.password ? "password" : "text"} autoComplete={ask.input?.password ? "current-password" : "off"} />}
        <div className="wl-dialog-actions">
          <button type="button" className="wl-btn" onClick={() => onClose(null)}>Cancel</button>
          <button type="submit" className={`wl-btn ${ask.danger ? "wl-btn-danger" : "wl-btn-primary"}`} disabled={!ready} autoFocus={!typed}>
            {ask.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

let nextId = 1;

/** A modal question in the dashboard's own style, in place of window.confirm and window.prompt. Render `dialog` once in the component. */
export function useAsk() {
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = (o: AskOptions) => new Promise<string | null>((resolve) => setPending({ ...o, id: nextId++, resolve }));
  const close = (answer: string | null) => {
    pending?.resolve(answer);
    setPending(null);
  };
  return {
    dialog: pending && <AskDialog key={pending.id} ask={pending} onClose={close} />,
    /** True when the person confirms. */
    confirm: async (o: AskOptions) => (await ask(o)) !== null,
    /** The text typed, or null when cancelled. */
    prompt: (o: AskOptions) => ask(o),
  };
}
