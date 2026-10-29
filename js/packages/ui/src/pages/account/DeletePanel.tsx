import { type AccountState, auth, loadAccount } from "../../data/account";
import { hrefTo, navigate } from "../../routes";
import { useAsk } from "../../ui/Dialog";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { ActionNotes, onForm, useAction } from "./useAction";

/** Delete the account. Refused while it is the last owner of a team; with mail on, an emailed link confirms it. */
export function DeletePanel({ account }: { account: AccountState }) {
  const a = useAction();
  const { dialog, confirm } = useAsk();
  const blocking = account.blockingOrgs ?? [];
  const solo = account.soloOrgs ?? [];
  const goes = solo.length ? `${solo.join(", ")} ${solo.length === 1 ? "is" : "are"} deleted with your account, with all ${solo.length === 1 ? "its" : "their"} data.` : "No organization is deleted: you are not alone in any.";
  const remove = onForm(async (v, form) => {
    if (!(await confirm({ title: "Delete your account?", body: `Your account is deleted.${solo.length ? ` ${goes}` : ""} This cannot be undone.`, confirmLabel: "Delete my account", danger: true }))) return;
    void a.run(async () => {
      await auth((c) => c.deleteUser({ password: v.password! }));
      form.reset();
      if (account.mail) return a.setNote("Check your email to confirm.");
      navigate(hrefTo("delete-account", [], { done: "1" }));
      await loadAccount();
    });
  });
  return (
    <Panel className="wl-panel-danger">
      {dialog}
      <p>{goes}</p>
      {blocking.length > 0 ? (
        <ul className="wl-plain-list">
          {blocking.map((name) => (
            <li key={name}>Make someone else an owner of {name} first, or delete it.</li>
          ))}
        </ul>
      ) : (
        <form className="wl-form" onSubmit={remove}>
          <FormRow>
            <Field label="Your password" name="password" type="password" autoComplete="current-password" required />
            <button type="submit" className="wl-btn wl-btn-danger" disabled={a.busy}>Delete my account</button>
          </FormRow>
          <ActionNotes a={a} />
        </form>
      )}
    </Panel>
  );
}
