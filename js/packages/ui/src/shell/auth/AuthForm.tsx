import { type FormEvent, type ReactNode, useState } from "react";
import { Logo } from "../Logo";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  value?: string;
  readOnly?: boolean;
}

export interface AuthFormProps {
  title: string;
  intro?: ReactNode;
  fields: Field[];
  submit: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  footer?: ReactNode;
}

/** One centered card with a form. Shows the server's message when the action fails. */
export function AuthForm({ title, intro, fields, submit, onSubmit, footer }: AuthFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)]));
    setBusy(true);
    setError(null);
    onSubmit(values)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="wl-auth">
      <form className="wl-auth-card" onSubmit={send}>
        <div className="wl-brand-row">
          <Logo />
        </div>
        <h1>{title}</h1>
        {intro && <p className="wl-muted">{intro}</p>}
        {fields.map((f) => (
          <label key={f.name} className="wl-auth-field">
            <span>{f.label}</span>
            <input name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} defaultValue={f.value} readOnly={f.readOnly} required />
          </label>
        ))}
        {error && <div className="wl-banner wl-banner-error" role="alert">{error}</div>}
        <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>
          {busy ? "One moment…" : submit}
        </button>
        {footer && <div className="wl-auth-foot">{footer}</div>}
      </form>
    </div>
  );
}
