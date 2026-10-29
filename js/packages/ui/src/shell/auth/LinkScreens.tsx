import { useEffect, useRef, useState } from "react";
import { type AccountState, auth, AuthError, errorText, loadAccount } from "../../data/account";
import { hrefTo } from "../../routes";
import { AuthCard, AuthForm, EMAIL, NoMailCard } from "./AuthForm";
import { AuthScreen } from "./AuthScreen";
import { afterSignIn } from "./flow";

const HOME = <a className="wl-btn" href={hrefTo("overview")}>Go to WizeLens</a>;

/** A link that did not work: send a new one to the email. */
function SendNewLink({ error, mail }: { error: string; mail: boolean }) {
  const [sent, setSent] = useState(false);
  if (sent && !mail) return <NoMailCard back={HOME} />;
  if (sent) return <AuthCard title="Check your email" intro="If the email has an account that is not confirmed, a new link is on its way.">{HOME}</AuthCard>;
  const send = async (v: Record<string, string>) => {
    await auth((c) => c.sendVerificationEmail({ email: v.email! }));
    setSent(true);
  };
  // The reason is the title, so the card names the problem once.
  return <AuthForm title={error.replace(/\.$/, "")} intro="Type your email, and we send a new link." fields={[EMAIL]} submit="Send a new link" onSubmit={send} footer={<a href={hrefTo("overview")}>Back to sign in</a>} />;
}

/** Opens the email link: it confirms the email and signs the person in. A change of email needs a second link, to the new address. */
export function VerifyEmail({ token, mail }: { token: string; mail: boolean }) {
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
  if (!token) return <SendNewLink error="This link is not complete." mail={mail} />;
  if (error?.expired) return <SendNewLink error={error.text} mail={mail} />;
  if (error) return <AuthCard title="This link did not work" intro={error.text}>{HOME}</AuthCard>;
  const next = mail ? "Now open the link we sent to your new email." : "Now open the second link, for your new email. This cloud cannot send email: ask the person who runs it, the link is in the cloud's log.";
  if (result === "changing") return <AuthCard title="One more step" intro={`${next} It finishes the change.`}>{HOME}</AuthCard>;
  return <AuthCard title={result === "done" ? "Email confirmed" : "Confirming your email…"} />;
}

/** The emailed link to delete the account. It needs a sign-in first. */
export function DeleteAccount({ token, state, deleted = false }: { token: string; state: AccountState; deleted?: boolean }) {
  const [done, setDone] = useState(deleted);
  if (done) return <AuthCard title="Account deleted" intro="Your account is deleted. Thank you for using WizeLens.">{HOME}</AuthCard>;
  if (!state.signedIn) return <AuthScreen state={state} title="Sign in to delete your account" intro="Deleting needs you signed in, so no one else can do it from this link." />;
  if (!token) return <AuthCard title="This link is not complete" intro="Delete your account from the Account page.">{HOME}</AuthCard>;
  const remove = async () => {
    await auth((c) => c.deleteUser({ token }));
    await loadAccount();
    setDone(true);
  };
  const intro = "This cannot be undone. Organizations where you are the only member go with it, with all their data.";
  return <AuthForm title="Delete your account for good?" intro={intro} fields={[]} submit="Delete my account" onSubmit={remove} footer={<a href={hrefTo("account")}>Keep my account</a>} />;
}
