import { useState } from "react";
import { auth, errorText, useAccount } from "../data/account";

/** "Confirm your email" with a button to send the link again. Only when the cloud sends mail and the email is not confirmed. */
export function EmailBanner({ thin = true }: { thin?: boolean }) {
  const account = useAccount();
  const [note, setNote] = useState<string | null>(null);
  const user = account?.user;
  if (!account?.mail || !user || user.emailVerified) return null;
  const resend = () => void auth((c) => c.sendVerificationEmail({ email: user.email })).then(() => setNote("We sent a new link."), (e: unknown) => setNote(errorText(e)));
  return (
    <div className={`wl-banner wl-banner-info${thin ? " wl-banner-thin" : ""}`} role="status">
      Confirm your email: we sent a link to {user.email}.{" "}
      {note ? <span>{note}</span> : <button type="button" className="wl-link-btn" onClick={resend}>Send again</button>}
    </div>
  );
}
