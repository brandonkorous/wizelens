import { useEffect, useState } from "react";
import { type AccountState, authAction, loadAccount } from "../../data/account";
import { apiFetch, apiSend } from "../../data/api";
import { hrefTo, navigate } from "../../routes";
import { AuthForm } from "./AuthForm";

interface Invite {
  orgName: string;
  email: string;
  role: string;
}

async function accept(token: string): Promise<void> {
  await apiSend("POST", `./api/auth/invites/${token}/accept`);
  await loadAccount();
  navigate(hrefTo("overview"));
}

/** An invite link: join with a new account, or with the one you are signed in to. */
export function JoinScreen({ token, state }: { token: string; state: AccountState }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [haveAccount, setHaveAccount] = useState(false);
  useEffect(() => {
    apiFetch<Invite>(`./api/auth/invites/${token}`).then(setInvite, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);
  if (error) return <AuthForm title="This invite link does not work" intro={error} fields={[]} submit="Go to sign in" onSubmit={async () => navigate(hrefTo("overview"))} />;
  if (!invite) return <div className="wl-auth"><p className="wl-muted">Opening the invite…</p></div>;
  const intro = `Join ${invite.orgName} as ${invite.role}.`;
  if (state.signedIn) return <AuthForm title={`Join ${invite.orgName}`} intro={intro} fields={[]} submit="Join" onSubmit={() => accept(token)} />;
  const toggle = (
    <button type="button" className="wl-link-btn" onClick={() => setHaveAccount(!haveAccount)}>
      {haveAccount ? "I need a new account" : "I already have an account"}
    </button>
  );
  if (haveAccount) {
    const login = async (v: Record<string, string>) => authAction("login", v);
    return <AuthForm title="Sign in to accept" intro={intro} fields={[{ name: "email", label: "Email", type: "email", value: invite.email }, { name: "password", label: "Password", type: "password" }]} submit="Sign in" onSubmit={login} footer={toggle} />;
  }
  const fields = [
    { name: "name", label: "Your name" },
    { name: "email", label: "Email", type: "email" as const, value: invite.email, readOnly: true },
    { name: "password", label: "Password (10 characters or more)", type: "password" as const },
  ];
  const signup = async (v: Record<string, string>) => (await authAction("signup", { ...v, invite: token }), navigate(hrefTo("overview")));
  return <AuthForm title={`Join ${invite.orgName}`} intro={intro} fields={fields} submit="Create account and join" onSubmit={signup} footer={toggle} />;
}
