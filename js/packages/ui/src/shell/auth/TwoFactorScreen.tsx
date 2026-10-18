import { useState } from "react";
import { auth } from "../../data/account";
import { hrefTo } from "../../routes";
import { AuthForm, type Field, LinkButton } from "./AuthForm";
import { afterSignIn } from "./flow";

const TRUST: Field = { name: "trust", label: "Trust this device for 14 days", type: "checkbox" };

/** The second step of sign-in: a code from the phone app, or one backup code. */
export function TwoFactorScreen() {
  const [backup, setBackup] = useState(false);
  const verify = async (v: Record<string, string>) => {
    const code = v.code!.replace(/\s+/g, "");
    const trustDevice = v.trust === "on";
    if (backup) await auth((c) => c.twoFactor.verifyBackupCode({ code, trustDevice }));
    else await auth((c) => c.twoFactor.verifyTotp({ code, trustDevice }));
    await afterSignIn();
  };
  const code: Field = backup
    ? { name: "code", label: "Backup code", autoComplete: "off" }
    : { name: "code", label: "Code", autoComplete: "one-time-code", inputMode: "numeric" };
  const footer = (
    <span className="wl-auth-links">
      <LinkButton onClick={() => setBackup(!backup)}>{backup ? "Use a code from your app" : "Use a backup code instead"}</LinkButton>
      <a href={hrefTo("overview")}>Back to sign in</a>
    </span>
  );
  const intro = backup ? "Enter one of your backup codes. Each code works once." : "Enter the 6-digit code from your app.";
  return <AuthForm key={String(backup)} title="Two-step sign-in" intro={intro} fields={[code, TRUST]} submit="Continue" onSubmit={verify} footer={footer} />;
}
