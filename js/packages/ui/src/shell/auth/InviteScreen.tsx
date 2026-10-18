import { useEffect, useState } from "react";
import { type AccountState, auth, errorText, loadAccount, pendingInvite, signOut } from "../../data/account";
import { apiFetch } from "../../data/api";
import { hrefTo, navigate } from "../../routes";
import { AuthCard, AuthForm, type Field, LinkButton, NAME, NEW_PASSWORD } from "./AuthForm";
import { SignIn } from "./AuthScreen";

const INVITE_HEADER = "x-wizelens-invite";

/** `GET api/invites/<id>`: who invited which email, to what. */
interface InvitePreview {
  orgName: string;
  email: string;
  role: string;
  inviter: string;
}

async function accept(id: string): Promise<void> {
  await auth((c) => c.organization.acceptInvitation({ invitationId: id }));
  pendingInvite.set(null);
  await loadAccount();
  navigate(hrefTo("overview"));
}

/** Signed in already: join with this account, or sign out when the invite is for another email. */
function SignedIn({ id, invite, state }: { id: string; invite: InvitePreview; state: AccountState }) {
  const intro = `Join ${invite.orgName} as ${invite.role}. ${invite.inviter} invited ${invite.email}.`;
  const email = state.user?.email ?? "";
  if (email.toLowerCase() === invite.email.toLowerCase()) return <AuthForm title={`Join ${invite.orgName}`} intro={intro} fields={[]} submit="Join" onSubmit={() => accept(id)} />;
  return (
    <AuthCard title="This invite is for another email" intro={`You are signed in as ${email}. The invite is for ${invite.email}. Sign out, then sign in or sign up with that email.`}>
      <button type="button" className="wl-btn wl-btn-primary" onClick={() => void signOut()}>Sign out</button>
    </AuthCard>
  );
}

/** Signed out: a new account for the invited email, or a sign-in to an account that has it. */
function SignedOut({ id, invite, state }: { id: string; invite: InvitePreview; state: AccountState }) {
  const [haveAccount, setHaveAccount] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const intro = `Join ${invite.orgName} as ${invite.role}. ${invite.inviter} invited ${invite.email}.`;
  const toggle = <LinkButton onClick={() => setHaveAccount(!haveAccount)}>{haveAccount ? "I need a new account" : "I already have an account"}</LinkButton>;
  if (checkEmail) return <AuthCard title="Check your email" intro="Check your email to confirm it. The link brings you back here." />;
  if (haveAccount) return <SignIn state={state} title="Sign in to accept" intro={intro} email={invite.email} onSignedIn={() => accept(id)} footer={toggle} />;
  const fields: Field[] = [NAME, { name: "email", label: "Email", type: "email", value: invite.email, readOnly: true }, NEW_PASSWORD];
  const signUp = async (v: Record<string, string>) => {
    pendingInvite.set(id);
    await auth((c) => c.signUp.email({ name: v.name!, email: invite.email, password: v.password! }, { headers: { [INVITE_HEADER]: id } }));
    if (state.mail) return setCheckEmail(true);
    await accept(id);
  };
  return <AuthForm title={`Join ${invite.orgName}`} intro={intro} fields={fields} submit="Create account and join" onSubmit={signUp} footer={toggle} />;
}

/** An invite link `#/invite?token=<id>`: see the invite, then join with a new account or an existing one. */
export function InviteScreen({ id, state }: { id: string; state: AccountState }) {
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return setError("This invite link is not complete.");
    pendingInvite.set(id);
    apiFetch<InvitePreview>(`./api/invites/${encodeURIComponent(id)}`).then(setInvite, (e: unknown) => setError(errorText(e)));
  }, [id]);
  if (error) {
    return (
      <AuthCard title="This invite link does not work" intro={`${error} Ask your team for a new one.`}>
        <a className="wl-btn" href={hrefTo("overview")} onClick={() => pendingInvite.set(null)}>Go to WizeLens</a>
      </AuthCard>
    );
  }
  if (!invite) return <AuthCard title="Opening the invite…" />;
  return state.signedIn ? <SignedIn id={id} invite={invite} state={state} /> : <SignedOut id={id} invite={invite} state={state} />;
}
