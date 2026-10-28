import { type FormEvent, type ReactNode, useState } from "react";
import { errorText } from "../../data/account";
import { Logo } from "../Logo";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "checkbox";
  autoComplete?: string;
  value?: string;
  readOnly?: boolean;
  /** Text fields are required unless this is false. Check boxes never are. */
  required?: boolean;
  /** Check boxes: on at first. */
  checked?: boolean;
  inputMode?: "numeric" | "text";
}

export const EMAIL: Field = { name: "email", label: "Email", type: "email", autoComplete: "email" };
export const PASSWORD: Field = { name: "password", label: "Password", type: "password", autoComplete: "current-password" };
export const NEW_PASSWORD: Field = { name: "password", label: "Password (12 characters or more)", type: "password", autoComplete: "new-password" };
export const NAME: Field = { name: "name", label: "Your name", autoComplete: "name" };

export interface AuthFormProps {
  title: string;
  intro?: ReactNode;
  fields: Field[];
  submit: string;
  /** Values by field name; a check box is "on" when checked. */
  onSubmit: (values: Record<string, string>) => Promise<void>;
  /** More buttons under the main one, for example "Sign in with a passkey". */
  secondary?: ReactNode;
  footer?: ReactNode;
}

function CardHead({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <>
      <div className="wl-brand-row">
        <Logo />
      </div>
      <h1>{title}</h1>
      {intro && <p className="wl-muted">{intro}</p>}
    </>
  );
}

/** One centered card with a message and optional actions. */
export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <main className="wl-auth">
      <div className="wl-auth-card">
        <CardHead title={title} intro={intro} />
        {children}
      </div>
    </main>
  );
}

function FieldInput({ f }: { f: Field }) {
  if (f.type === "checkbox") {
    return (
      <label className="wl-auth-check">
        <input name={f.name} type="checkbox" defaultChecked={f.checked} />
        <span>{f.label}</span>
      </label>
    );
  }
  return (
    <label className="wl-auth-field">
      <span>{f.label}</span>
      <input name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} inputMode={f.inputMode} defaultValue={f.value} readOnly={f.readOnly} required={f.required ?? true} />
    </label>
  );
}

/** One centered card with a form. Shows the server's message when the action fails. */
export function AuthForm({ title, intro, fields, submit, onSubmit, secondary, footer }: AuthFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries([...new FormData(e.currentTarget)].map(([k, v]) => [k, String(v)]));
    setBusy(true);
    setError(null);
    onSubmit(values)
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false));
  };
  return (
    <main className="wl-auth">
      <form className="wl-auth-card" onSubmit={send}>
        <CardHead title={title} intro={intro} />
        {fields.map((f) => (
          <FieldInput key={f.name} f={f} />
        ))}
        {error && <div className="wl-banner wl-banner-error" role="alert">{error}</div>}
        <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>
          {busy ? "One moment…" : submit}
        </button>
        {secondary}
        {footer && <div className="wl-auth-foot">{footer}</div>}
      </form>
    </main>
  );
}

/** A text button for small steps: "Forgot password?", "I have an account". */
export const LinkButton = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" className="wl-link-btn" onClick={onClick}>
    {children}
  </button>
);
