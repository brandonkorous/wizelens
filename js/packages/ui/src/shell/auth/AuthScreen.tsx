import { useState } from "react";
import { type AccountState, authAction } from "../../data/account";
import { AuthForm, type Field } from "./AuthForm";

const EMAIL: Field = { name: "email", label: "Email", type: "email", autoComplete: "email" };
const PASSWORD: Field = { name: "password", label: "Password", type: "password", autoComplete: "current-password" };
const NEW_PASSWORD: Field = { name: "password", label: "Password (10 characters or more)", type: "password", autoComplete: "new-password" };
const NAME: Field = { name: "name", label: "Your name", autoComplete: "name" };

/** The very first account on a new cloud: it also makes the first organization and project. */
function Setup() {
  return (
    <AuthForm
      title="Set up WizeLens Cloud"
      intro="Create the first account. You become the owner of the first organization."
      fields={[NAME, EMAIL, NEW_PASSWORD, { name: "orgName", label: "Organization name" }]}
      submit="Create account"
      onSubmit={(v) => authAction("setup", v)}
    />
  );
}

/** Sign in, or (when the cloud allows open sign-up) make an account. */
export function AuthScreen({ state }: { state: AccountState }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  if (state.needsSetup) return <Setup />;
  const toggle = (next: "login" | "signup", text: string) => (
    <button type="button" className="wl-link-btn" onClick={() => setMode(next)}>
      {text}
    </button>
  );
  if (mode === "signup") {
    return (
      <AuthForm title="Create your account" fields={[NAME, EMAIL, NEW_PASSWORD]} submit="Create account" onSubmit={(v) => authAction("signup", v)} footer={toggle("login", "I have an account")} />
    );
  }
  const footer = state.signup === "open" ? toggle("signup", "Create an account") : "Need access? Ask your team for an invite link.";
  return <AuthForm title="Sign in to WizeLens" fields={[EMAIL, PASSWORD]} submit="Sign in" onSubmit={(v) => authAction("login", v)} footer={footer} />;
}
