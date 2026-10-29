import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { useListbox } from "./useListbox";

export interface DropdownProps<T extends string> {
  value: T;
  options: readonly [T, string][];
  onChange: (v: T) => void;
  /** The name, when no label on screen names it. */
  label?: string;
  /** The id of the label on screen that names it. */
  labelledBy?: string;
  describedBy?: string;
  small?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** The one drop-down: a button that shows the choice, and a list in the dashboard's own colors in both themes. */
export function Dropdown<T extends string>({ value, options, onChange, label, labelledBy, describedBy, small = false, autoFocus, disabled }: DropdownProps<T>) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const labels = options.map(([, text]) => text);
  const selected = options.findIndex(([v]) => v === value);
  const box = useListbox(labels, selected, (i) => onChange(options[i]![0]), button);
  // An open dialog sits above the page, so the list goes inside it; anywhere else, on the page itself.
  const host = box.open ? (button.current?.closest("dialog") ?? document.body) : null;
  const list = (
    <ul ref={box.listRef} id={`${id}-list`} role="listbox" className="wl-listbox" style={box.style} aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
      {options.map(([v, text], i) => (
        <li key={v} id={`${id}-${i}`} role="option" aria-selected={i === selected} className={`wl-option${i === box.active ? " wl-active" : ""}`} onMouseDown={(e) => e.preventDefault()} onMouseMove={() => box.setActive(i)} onClick={() => box.pick(i)}>
          <span>{text}</span>
          {i === selected && <Check aria-hidden="true" />}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <button ref={button} type="button" role="combobox" className={`wl-select${small ? " wl-small" : ""}`} aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-haspopup="listbox" aria-expanded={box.open} aria-controls={`${id}-list`} aria-activedescendant={box.open ? `${id}-${box.active}` : undefined} autoFocus={autoFocus} disabled={disabled} onClick={box.toggle} onKeyDown={box.onKey}>
        <span className="wl-select-text">{labels[selected] ?? ""}</span>
      </button>
      {host && createPortal(list, host)}
    </>
  );
}
