import { useState } from "react";
import { type AccountUser, auth, loadAccount } from "../../data/account";
import { Badge } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { BackupCodes, TotpQr } from "./TwoFactorParts";
import { type Action, ActionNotes, onForm, useAction } from "./useAction";

interface Setup {
  totpURI: string;
  backupCodes: string[];
}

/** A button that asks for the password in a dialog, for the steps that need it again. */
function PasswordButton({ a, label, title, danger = false, onPassword }: { a: Action; label: string; title: string; danger?: boolean; onPassword: (password: string) => void }) {
  const { dialog, prompt } = useAsk();
  const ask = async () => {
    const password = await prompt({ title, body: "Enter your password to go on.", confirmLabel: label, danger, input: { label: "Your password", password: true } });
    if (password) onPassword(password);
  };
  return (
    <>
      <button type="button" className={`wl-btn${danger ? " wl-text-error" : ""}`} disabled={a.busy} onClick={() => void ask()}>{label}</button>
      {dialog}
    </>
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

/** Turned on: make new backup codes (the old ones stop working), or turn it off. */
function WhenOn() {
  const a = useAction();
  const [codes, setCodes] = useState<string[] | null>(null);
  const off = (password: string) => void a.run(async () => (await auth((c) => c.twoFactor.disable({ password })), await loadAccount()));
  const fresh = (password: string) => void a.run(async () => setCodes((await auth((c) => c.twoFactor.generateBackupCodes({ password }))).backupCodes));
  return (
    <>
      <p className="wl-panel-text">Sign-in asks for a code from your phone app. Keep your backup codes somewhere safe.</p>
      {codes && <BackupCodes codes={codes} />}
      <div className="wl-form-actions wl-form-actions-start">
        <PasswordButton a={a} label="New backup codes" title="Make new backup codes?" onPassword={fresh} />
        <PasswordButton a={a} label="Turn off" title="Turn off two-step sign-in?" danger onPassword={off} />
      </div>
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
      <p className="wl-panel-text">Sign-in also asks for a code from an app on your phone, so a stolen password is not enough.</p>
      {setup ? <Finish setup={setup} onDone={() => setSetup(null)} /> : <PasswordButton a={a} label="Turn on" title="Turn on two-step sign-in?" onPassword={on} />}
      <ActionNotes a={a} />
    </Panel>
  );
}
