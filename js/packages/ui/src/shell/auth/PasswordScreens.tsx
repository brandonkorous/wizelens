import { useState } from "react";
import { type AccountState, auth, loadAccount } from "../../data/account";
import { hrefTo } from "../../routes";
import { AuthCard, AuthForm, EMAIL, type Field, NoMailCard } from "./AuthForm";

const BACK = <a href={hrefTo("overview")}>Back to sign in</a>;
const NEW: Field = { name: "password", label: "New password (12 characters or more)", type: "password", autoComplete: "new-password" };
const AGAIN: Field = { name: "again", label: "New password again", type: "password", autoComplete: "new-password" };

/** Ask for a reset link. The answer is the same whether or not the email has an account. */
export function ForgotPassword({ state }: { state: AccountState }) {
  const [sent, setSent] = useState(false);
  if (sent && !state.mail) return <NoMailCard back={BACK} />;
  if (sent) return <AuthCard title="Check your email" intro="If the email has an account, a link is on its way.">{BACK}</AuthCard>;
  const send = async (v: Record<string, string>) => {
    await auth((c) => c.requestPasswordReset({ email: v.email! }));
    setSent(true);
  };
  return <AuthForm title="Forgot your password?" intro="Enter your email. We send a link to choose a new password." fields={[EMAIL]} submit="Send the link" onSubmit={send} footer={BACK} />;
}

/** Choose a new password from the emailed link. Every session of the account ends. */
export function ResetPassword({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  if (!token) return <AuthCard title="This link is not complete" intro="Ask for a new link."><a className="wl-btn wl-btn-primary" href={hrefTo("forgot-password")}>Send a new link</a><span className="wl-auth-links">{BACK}</span></AuthCard>;
  if (done) return <AuthCard title="Password changed" intro="Every device that was signed in is now signed out. Sign in with the new password."><a className="wl-btn wl-btn-primary" href={hrefTo("overview")}>Sign in</a></AuthCard>;
  const reset = async (v: Record<string, string>) => {
    if (v.password !== v.again) throw new Error("The two passwords are not the same.");
    await auth((c) => c.resetPassword({ newPassword: v.password!, token }));
    await loadAccount();
    setDone(true);
  };
  const footer = (
    <span className="wl-auth-links">
      <a href={hrefTo("forgot-password")}>Send a new link</a>
      {BACK}
    </span>
  );
  return <AuthForm title="Choose a new password" fields={[NEW, AGAIN]} submit="Change password" onSubmit={reset} footer={footer} />;
}
