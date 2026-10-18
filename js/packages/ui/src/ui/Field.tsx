import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/** A labeled text, number, email, or URL input for small forms. */
export function Field({ label, hint, narrow = false, ...input }: { label: string; hint?: ReactNode; narrow?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`wl-field${narrow ? " wl-field-narrow" : ""}`}>
      <span>{label}</span>
      <input {...input} />
      {hint && <small className="wl-muted">{hint}</small>}
    </label>
  );
}

/** A labeled box for long text, for example a certificate. */
export function TextArea({ label, hint, ...area }: { label: string; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="wl-field">
      <span>{label}</span>
      <textarea {...area} />
      {hint && <small className="wl-muted">{hint}</small>}
    </label>
  );
}

/** A labeled drop-down for small forms, so it lines up with the fields beside it. */
export function SelectField<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hint?: ReactNode }) {
  return (
    <label className="wl-field">
      <span>{label}</span>
      <select className="wl-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      {hint && <small className="wl-muted">{hint}</small>}
    </label>
  );
}

/** A form row of fields and a button. Fields line up at the top, so a hint under one never pushes the others down. */
export const FormRow = ({ children }: { children: ReactNode }) => <div className="wl-form-row">{children}</div>;

/** A labeled check box. */
export function Check({ label, ...input }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="wl-check">
      <input type="checkbox" {...input} />
      <span>{label}</span>
    </label>
  );
}
