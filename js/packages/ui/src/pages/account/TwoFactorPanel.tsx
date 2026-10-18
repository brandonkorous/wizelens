import { useState } from "react";
import { type AccountUser, auth, loadAccount } from "../../data/account";
import { Badge } from "../../ui/Badges";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { BackupCodes, TotpQr } from "./TwoFactorParts";
import { type Action, ActionNotes, onForm, useAction } from "./useAction";

interface Setup {
  totpURI: string;
  backupCodes: string[];
}

/** A password field and one button, for the steps that ask the password again. */
function PasswordStep({ a, submit, onPassword }: { a: Action; submit: string; onPassword: (password: string, form: HTMLFormElement) => void }) {
  return (
    <form className="wl-form" onSubmit={onForm((v, form) => onPassword(v.password!, form))}>
      <FormRow>
        <Field label="Your password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit" className="wl-btn" disabled={a.busy}>{submit}</button>
      </FormRow>
    </form>
  );
}

/** After "Turn on": scan, keep the backup codes, then one code from the app finishes it. */
function Finish({ setup, onDone }: { setup: Setup; onDone: () => void }) {
  const a = useAction();
  const verify = onForm((v) => void a.run(async () => (await auth((c) => c.twoFactor.verifyTotp({ code: v.code!.replace(/\s+/g, "") })), await loadAccount())).then((ok) => ok && onDone()));
  return (
    <>
      <TotpQr totpURI={setup.totpURI} />
      <BackupCodes codes={setup.backupCodes} />
      <form className="wl-form" onSubmit={verify}>
        <FormRow>
          <Field label="Enter a code from your app to finish" name="code" inputMode="numeric" autoComplete="one-time-code" required />
          <button type="submit" className="wl-btn wl-btn-primary" disabled={a.busy}>Finish</button>
        </FormRow>
        <ActionNotes a={a} />
      </form>
    </>
  );
}

/** Turned on: turn it off, or make new backup codes (the old ones stop working). */
function WhenOn() {
  const a = useAction();
  const [codes, setCodes] = useState<string[] | null>(null);
  const off = (password: string) => void a.run(async () => (await auth((c) => c.twoFactor.disable({ password })), await loadAccount()));
  const fresh = (password: string, form: HTMLFormElement) =>
    void a.run(async () => setCodes((await auth((c) => c.twoFactor.generateBackupCodes({ password }))).backupCodes)).then((ok) => ok && form.reset());
  return (
    <>
      <p className="wl-muted">New backup codes replace the old ones.</p>
      <PasswordStep a={a} submit="New backup codes" onPassword={fresh} />
      {codes && <BackupCodes codes={codes} />}
      <PasswordStep a={a} submit="Turn off" onPassword={off} />
      <ActionNotes a={a} />
    </>
  );
}

/** Two-step sign-in with a code from a phone app. */
export function TwoFactorPanel({ user }: { user: AccountUser }) {
  const a = useAction();
  const [setup, setSetup] = useState<Setup | null>(null);
  const on = (password: string) =>
    void a.run(async () => {
      const r = await auth((c) => c.twoFactor.enable({ password }));
      if ("totpURI" in r) setSetup(r);
    });
  const state = user.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>;
  const title = <h2 className="wl-panel-title-row">Two-step sign-in {state}</h2>;
  if (user.twoFactorEnabled) return <Panel title={title}><WhenOn /></Panel>;
  return (
    <Panel title={title}>
      <p className="wl-muted">Sign-in also asks for a code from an app on your phone.</p>
      {setup ? <Finish setup={setup} onDone={() => setSetup(null)} /> : <PasswordStep a={a} submit="Turn on" onPassword={on} />}
      <ActionNotes a={a} />
    </Panel>
  );
}
