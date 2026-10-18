import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/** A labeled text, number, email, or URL input for small forms. */
export function Field({ label, hint, ...input }: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="wl-field">
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

/** A form row of fields and a button. */
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
