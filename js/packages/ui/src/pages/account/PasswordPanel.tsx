import { auth } from "../../data/account";
import { Check, Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { ActionNotes, onForm, useAction } from "./useAction";

/** Change the password; by default, other devices are signed out. */
export function PasswordPanel() {
  const a = useAction();
  const change = onForm((v, form) => {
    if (v.newPassword !== v.again) return void a.run(() => Promise.reject(new Error("The two new passwords are not the same.")));
    const body = { currentPassword: v.currentPassword!, newPassword: v.newPassword!, revokeOtherSessions: v.revoke === "on" };
    void a.run(() => auth((c) => c.changePassword(body)), "Password changed.").then((ok) => ok && form.reset());
  });
  return (
    <Panel title="Password">
      <form className="wl-form" onSubmit={change}>
        <FormRow>
          <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
          <Field label="New password (12 characters or more)" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
          <Field label="New password again" name="again" type="password" autoComplete="new-password" required />
        </FormRow>
        <div className="wl-form-actions wl-form-actions-split">
          <Check label="Sign out my other devices" name="revoke" defaultChecked />
          <button type="submit" className="wl-btn wl-btn-primary" disabled={a.busy}>Change password</button>
        </div>
        <ActionNotes a={a} />
      </form>
    </Panel>
  );
}
