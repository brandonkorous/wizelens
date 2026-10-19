import type { ReactNode } from "react";
import { auth } from "../../data/account";
import { AuthForm, EMAIL } from "./AuthForm";

/** Where single sign-on sends the person back: this dashboard, or the app sign-in page it started on. A failure comes back as `?error=…` before the hash. */
const here = () => `${window.location.origin}${window.location.pathname}${window.location.hash.startsWith("#/oauth") ? window.location.hash : "#/"}`;

const SSO_ERRORS: Record<string, string> = {
  sso_domain: "Single sign-on works only for emails at your company's verified domain.",
  "account not linked": "An account with this email already exists. Sign in with your password, or ask an admin to confirm your email.",
  account_not_linked: "An account with this email already exists. Sign in with your password, or ask an admin to confirm your email.",
  signup_disabled: "Your company's sign-in worked, but this cloud does not take new accounts that way.",
};

/** The error single sign-on sent back, once: it then leaves the address bar. */
export function takeSsoError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("error");
  if (!code) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  return SSO_ERRORS[code] ?? `Single sign-on failed: ${(params.get("error_description") ?? code).replace(/_/g, " ")}.`;
}

/** Work email in, then on to the company's sign-in page; it sends the person back here signed in. */
export function SsoSignIn({ footer }: { footer: ReactNode }) {
  const start = async (v: Record<string, string>) => {
    const data = await auth((c) => c.signIn.sso({ email: v.email!, callbackURL: here(), errorCallbackURL: here() }));
    window.location.assign(data.url);
  };
  return <AuthForm title="Sign in with SSO" intro="Use your work email. Your company's sign-in page opens next." fields={[{ ...EMAIL, label: "Work email" }]} submit="Continue" onSubmit={start} footer={footer} />;
}
