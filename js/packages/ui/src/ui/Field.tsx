import type { InputHTMLAttributes, ReactNode } from "react";

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

/** A form row of fields and a button. */
export const FormRow = ({ children }: { children: ReactNode }) => <div className="wl-form-row">{children}</div>;
