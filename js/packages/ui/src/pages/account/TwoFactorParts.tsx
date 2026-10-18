import { useEffect, useState } from "react";
import { CopyButton } from "../../ui/Badges";

/** The secret for typing into the app by hand: the `secret` part of the otpauth:// link. */
const secretOf = (totpURI: string) => new URL(totpURI).searchParams.get("secret") ?? "";

/** The QR code of the otpauth:// link, and its secret as text. The SVG comes from uqr, built from the link only. */
export function TotpQr({ totpURI }: { totpURI: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("uqr").then((m) => live && setSvg(m.renderSVG(totpURI)));
    return () => void (live = false);
  }, [totpURI]);
  const secret = secretOf(totpURI);
  return (
    <div className="wl-totp">
      <div className="wl-totp-qr" aria-label="QR code for your app" role="img" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
      <div className="wl-totp-text">
        <p>Scan the code with your app (for example 1Password, Google Authenticator, or Authy).</p>
        <p className="wl-muted wl-small">Cannot scan? Type this key into the app:</p>
        <p>
          <code className="wl-mono">{secret}</code> <CopyButton text={secret} label="Copy key" />
        </p>
      </div>
    </div>
  );
}

/** One-time backup codes with a Copy button. */
export function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="wl-share-link">
      <ul className="wl-backup-codes">
        {codes.map((c) => (
          <li key={c}>
            <code className="wl-mono">{c}</code>
          </li>
        ))}
      </ul>
      <CopyButton text={codes.join("\n")} label="Copy backup codes" />
      <span className="wl-muted wl-small">Keep these somewhere safe. Each works once.</span>
    </div>
  );
}
