import { type ReactNode, useState } from "react";
import { type AccountState, auth, AuthError, errorText, loadAccount } from "../../data/account";
import { hrefTo, navigate, toTwoFactor } from "../../routes";
import { AuthCard, AuthForm, EMAIL, LinkButton, NAME, NEW_PASSWORD, PASSWORD } from "./AuthForm";
import { SsoSignIn, takeSsoError } from "./SsoSignIn";

const SETUP_HEADER = "x-wizelens-setup-token";

/** After sign-up with mail on: the person confirms the email before the first sign-in. */
function CheckEmail({ text }: { text: string }) {
  return (
    <AuthCard title="Check your email" intro={text}>
      <a className="wl-btn" href={hrefTo("overview")}>Go to sign in</a>
    </AuthCard>
  );
}

/** The very first account on a new cloud, with the token from the setup link. Its organization can be renamed under Organization, General. */
export function SetupScreen({ token, state }: { token: string; state: AccountState }) {
  const [done, setDone] = useState(false);
  if (!token) return <AuthCard title="Set up WizeLens Cloud" intro="This cloud has no account yet. Open the setup link printed in the cloud's log." />;
  if (done) return <CheckEmail text="Check your email to confirm it, then sign in." />;
  const create = async (v: Record<string, string>) => {
    await auth((c) => c.signUp.email({ name: v.name!, email: v.email!, password: v.password! }, { headers: { [SETUP_HEADER]: token } }));
    if (state.mail) return setDone(true);
    await loadAccount();
    navigate(hrefTo("overview"));
  };
  return <AuthForm title="Set up WizeLens Cloud" intro="Create the first account. You become the owner of the first organization." fields={[NAME, EMAIL, NEW_PASSWORD]} submit="Create account" onSubmit={create} />;
}

export interface SignInProps {
  state: AccountState;
  title?: string;
  intro?: ReactNode;
  email?: string;
  /** What happens once signed in. The default reloads the account. */
  onSignedIn?: () => Promise<void>;
  footer?: ReactNode;
  /** Shown when the cloud has single sign-on: switch to the SSO form. */
  onSso?: () => void;
}

/** Email and password, a passkey, or (when set up) single sign-on. EMAIL_NOT_VERIFIED means the email is not confirmed yet. */
export function SignIn({ state, title = "Sign in to WizeLens", intro, email, onSignedIn = async () => void (await loadAccount()), footer, onSso }: SignInProps) {
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const signIn = async (v: Record<string, string>) => {
    setUnconfirmed(null);
    try {
      const data = await auth((c) => c.signIn.email({ email: v.email!, password: v.password! }));
      if ("twoFactorRedirect" in data && data.twoFactorRedirect) return toTwoFactor();
      await onSignedIn();
    } catch (e) {
      if (state.mail && e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") setUnconfirmed(v.email!);
      throw e;
    }
  };
  const passkey = () => void auth((c) => c.signIn.passkey()).then(onSignedIn, (e: unknown) => setNote(errorText(e)));
  const resend = (to: string) => void auth((c) => c.sendVerificationEmail({ email: to })).then(() => setNote("We sent a new link."), (e: unknown) => setNote(errorText(e)));
  const secondary = (
    <>
      <button type="button" className="wl-btn" onClick={passkey}>Sign in with a passkey</button>
      {state.sso && onSso && <button type="button" className="wl-btn" onClick={onSso}>Sign in with SSO</button>}
      {unconfirmed && <LinkButton onClick={() => resend(unconfirmed)}>Send the link again</LinkButton>}
      {note && <p className="wl-muted wl-small" role="status">{note}</p>}
    </>
  );
  const fields = [{ ...EMAIL, value: email }, PASSWORD];
  const foot = (
    <span className="wl-auth-links">
      <a href={hrefTo("forgot-password")}>Forgot password?</a>
      {footer}
    </span>
  );
  return <AuthForm title={title} intro={intro} fields={fields} submit="Sign in" onSubmit={signIn} secondary={secondary} footer={foot} />;
}

/** Open sign-up. Better Auth answers 200 even when it refuses, so with mail on we always say "check your email". */
function SignUp({ state, back }: { state: AccountState; back: ReactNode }) {
  const [done, setDone] = useState(false);
  if (done) return <CheckEmail text="Check your email. The link in it confirms your account." />;
  const create = async (v: Record<string, string>) => {
    await auth((c) => c.signUp.email({ name: v.name!, email: v.email!, password: v.password! }));
    if (state.mail) return setDone(true);
    await loadAccount();
  };
  return <AuthForm title="Create your account" fields={[NAME, EMAIL, NEW_PASSWORD]} submit="Create account" onSubmit={create} footer={back} />;
}

/** Signed out: sign in (also by SSO), or (when the cloud allows open sign-up) make an account. A failed SSO shows its reason. */
export function AuthScreen({ state, intro }: { state: AccountState; intro?: ReactNode }) {
  const [mode, setMode] = useState<"login" | "signup" | "sso">("login");
  const [ssoError] = useState(takeSsoError);
  if (state.needsSetup) return <SetupScreen token="" state={state} />;
  const back = <LinkButton onClick={() => setMode("login")}>I have an account</LinkButton>;
  if (mode === "signup") return <SignUp state={state} back={back} />;
  if (mode === "sso") return <SsoSignIn footer={<LinkButton onClick={() => setMode("login")}>Sign in another way</LinkButton>} />;
  const footer = state.signup === "open" ? <LinkButton onClick={() => setMode("signup")}>Create an account</LinkButton> : <span>Need access? Ask your team for an invite link.</span>;
  const top = ssoError ? <span className="wl-text-error" role="alert">{ssoError}</span> : intro;
  return <SignIn state={state} intro={top} footer={footer} onSso={() => setMode("sso")} />;
}
