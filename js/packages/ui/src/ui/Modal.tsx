import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  title: string;
  /** Escape and the close button call it. Leave it out while the work must not be stopped. */
  onClose?: () => void;
  /** The close button's label, for example "Done" once the work is finished. */
  closeLabel?: string;
  /** Room for a table, for example an import preview. */
  wide?: boolean;
  children: ReactNode;
}

/** A form in its own window over the page. The page behind stays as it was. */
export function Modal({ title, onClose, closeLabel = "Close", wide = false, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    // Start in the first field; with none, on the window itself, so no button shows a focus ring.
    (el?.querySelector<HTMLElement>(".wl-modal-body :is(input:not([type=hidden]), select, textarea)") ?? el)?.focus();
    // Escape asks the owner to close, through the dialog's own cancel event; the owner may say no.
    const cancel = (e: Event) => (e.preventDefault(), closeRef.current?.());
    el?.addEventListener("cancel", cancel);
    return () => (el?.removeEventListener("cancel", cancel), el?.close());
  }, []);
  return (
    <dialog ref={ref} className={`wl-dialog wl-modal${wide ? " wl-modal-wide" : ""}`} aria-labelledby={id} tabIndex={-1}>
      <header className="wl-modal-head">
        <h2 id={id}>{title}</h2>
        {onClose && (
          <button type="button" className="wl-icon-btn wl-modal-close" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
            <X aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="wl-modal-body">{children}</div>
    </dialog>
  );
}
