import { useState } from "react";
import { type AccountState, type AccountUser, auth, loadAccount } from "../../data/account";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { ActionNotes, onForm, useAction } from "./useAction";

/** Where the change-email link goes: the current email first when it is confirmed, else the new one. */
function changeNote(account: AccountState, user: AccountUser): string {
  if (!account.mail) return "The cloud cannot send email; the link is in its log.";
  return user.emailVerified ? `Check your email: we sent a link to ${user.email}. Open it to confirm the change.` : "Check your new email to confirm it.";
}

function EmailRow({ account, user }: { account: AccountState; user: AccountUser }) {
  const [open, setOpen] = useState(false);
  const a = useAction();
  const change = onForm((v, form) => void a.run(() => auth((c) => c.changeEmail({ newEmail: v.newEmail! })), changeNote(account, user)).then((ok) => ok && (form.reset(), setOpen(false))));
  return (
    <div className="wl-form">
      <p className="wl-account-line">
        <span className="wl-muted">Email</span> <strong>{user.email}</strong>{" "}
        {!open && <button type="button" className="wl-btn wl-btn-sm" onClick={() => setOpen(true)}>Change email</button>}
      </p>
      {open && (
        <form onSubmit={change}>
          <FormRow>
            <Field label="New email" name="newEmail" type="email" autoComplete="email" required />
            <button type="submit" className="wl-btn wl-btn-primary" disabled={a.busy}>Send the link</button>
            <button type="button" className="wl-btn" onClick={() => setOpen(false)}>Cancel</button>
          </FormRow>
        </form>
      )}
      <ActionNotes a={a} />
    </div>
  );
}

/** Name and email. */
export function ProfilePanel({ account, user }: { account: AccountState; user: AccountUser }) {
  const a = useAction();
  const save = onForm((v) => void a.run(async () => (await auth((c) => c.updateUser({ name: v.name!.trim() })), await loadAccount()), "Saved."));
  return (
    <Panel>
      <form className="wl-form" onSubmit={save}>
        <FormRow>
          <Field label="Name" name="name" autoComplete="name" required defaultValue={user.name} />
          <button type="submit" className="wl-btn wl-btn-primary" disabled={a.busy}>Save</button>
        </FormRow>
        <ActionNotes a={a} />
      </form>
      <EmailRow account={account} user={user} />
    </Panel>
  );
}
