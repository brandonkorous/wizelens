import { type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useId } from "react";
import { Dropdown } from "./Dropdown";

/** A field is named by its label alone; its hint describes it, so a screen reader reads the name first. */
function useFieldIds(hint: ReactNode) {
  const id = useId();
  return { label: `${id}-label`, hint: hint ? `${id}-hint` : undefined };
}

/** A labeled text, number, email, or URL input for small forms. */
export function Field({ label, hint, narrow = false, ...input }: { label: string; hint?: ReactNode; narrow?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(hint);
  return (
    <label className={`wl-field${narrow ? " wl-field-narrow" : ""}`}>
      <span id={ids.label}>{label}</span>
      <input aria-labelledby={ids.label} aria-describedby={ids.hint} {...input} />
      {hint && <small id={ids.hint} className="wl-muted">{hint}</small>}
    </label>
  );
}

/** A labeled box for long text, for example a certificate. */
export function TextArea({ label, hint, ...area }: { label: string; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds(hint);
  return (
    <label className="wl-field">
      <span id={ids.label}>{label}</span>
      <textarea aria-labelledby={ids.label} aria-describedby={ids.hint} {...area} />
      {hint && <small id={ids.hint} className="wl-muted">{hint}</small>}
    </label>
  );
}

/** A labeled drop-down for small forms, so it lines up with the fields beside it. */
export function SelectField<T extends string>({ label, value, options, onChange, hint, autoFocus, disabled }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hint?: ReactNode; autoFocus?: boolean; disabled?: boolean }) {
  const ids = useFieldIds(hint);
  return (
    <label className="wl-field">
      <span id={ids.label}>{label}</span>
      <Dropdown value={value} options={options} onChange={onChange} labelledBy={ids.label} describedBy={ids.hint} autoFocus={autoFocus} disabled={disabled} />
      {hint && <small id={ids.hint} className="wl-muted">{hint}</small>}
    </label>
  );
}

/** A form row of fields and a button. Fields line up at the top, so a hint under one never pushes the others down. `half` keeps one field as wide as a field in a row of two. */
export const FormRow = ({ children, half = false }: { children: ReactNode; half?: boolean }) => <div className={`wl-form-row${half ? " wl-form-row-half" : ""}`}>{children}</div>;

/** A labeled check box. */
export function Check({ label, ...input }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="wl-check">
      <input type="checkbox" {...input} />
      <span>{label}</span>
    </label>
  );
}
