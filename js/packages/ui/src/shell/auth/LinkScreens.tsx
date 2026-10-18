import { useEffect, useRef, useState } from "react";
import { type AccountState, auth, AuthError, errorText, loadAccount } from "../../data/account";
import { hrefTo } from "../../routes";
import { AuthCard, AuthForm, EMAIL } from "./AuthForm";
import { AuthScreen } from "./AuthScreen";
import { afterSignIn } from "./flow";

const HOME = <a className="wl-btn" href={hrefTo("overview")}>Go to WizeLens</a>;

/** A link that did not work: send a new one to the email. */
function SendNewLink({ error }: { error: string }) {
  const [sent, setSent] = useState(false);
  if (sent) return <AuthCard title="Check your email" intro="If the email has an account that is not confirmed, a new link is on its way.">{HOME}</AuthCard>;
  const send = async (v: Record<string, string>) => {
    await auth((c) => c.sendVerificationEmail({ email: v.email! }));
    setSent(true);
  };
  return <AuthForm title="This link does not work" intro={`${error.replace(/\.?$/, ".")} Send a new link.`} fields={[EMAIL]} submit="Send a new link" onSubmit={send} footer={<a href={hrefTo("overview")}>Back to sign in</a>} />;
}

/** Opens the email link: it confirms the email and signs the person in. A change of email needs a second link, to the new address. */
export function VerifyEmail({ token }: { token: string }) {
  const [result, setResult] = useState<"changing" | "done" | null>(null);
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !token) return;
    tried.current = true;
    auth((c) => c.verifyEmail({ query: { token } })).then(
      async (data) => {
        if (!("user" in data)) return setResult("changing");
        setResult("done");
        await afterSignIn();
      },
      (e: unknown) => setError({ text: errorText(e), expired: e instanceof AuthError && /TOKEN/.test(e.code) }),
    );
  }, [token]);
  if (!token) return <SendNewLink error="This link is not complete." />;
  if (error?.expired) return <SendNewLink error={error.text} />;
  if (error) return <AuthCard title="This link did not work" intro={error.text}>{HOME}</AuthCard>;
  if (result === "changing") return <AuthCard title="One more step" intro="Now open the link we sent to your new email. It finishes the change.">{HOME}</AuthCard>;
  return <AuthCard title={result === "done" ? "Email confirmed" : "Confirming your email…"} />;
}

/** The emailed link to delete the account. It needs a sign-in first. */
export function DeleteAccount({ token, state, deleted = false }: { token: string; state: AccountState; deleted?: boolean }) {
  const [done, setDone] = useState(deleted);
  if (done) return <AuthCard title="Account deleted" intro="Your account is deleted. Thank you for using WizeLens.">{HOME}</AuthCard>;
  if (!state.signedIn) return <AuthScreen state={state} intro="Sign in to delete your account." />;
  if (!token) return <AuthCard title="This link is not complete" intro="Delete your account from the Account page.">{HOME}</AuthCard>;
  const remove = async () => {
    await auth((c) => c.deleteUser({ token }));
    await loadAccount();
    setDone(true);
  };
  const intro = "This cannot be undone. Organizations where you are the only member go with it, with all their data.";
  return <AuthForm title="Delete your account for good?" intro={intro} fields={[]} submit="Delete my account" onSubmit={remove} footer={<a href={hrefTo("account")}>Keep my account</a>} />;
}
