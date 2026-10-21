"use client";

import { AnimatePresence, motion } from "motion/react";
import { Num } from "@/components/ui/Num";
import { useStep } from "./useStep";

const SCIM = [
  { at: 2, text: "SCIM added sara@fieldnote.test as member" },
  { at: 3, text: "SCIM removed lee@fieldnote.test (deactivated)" },
];

/** An OIDC provider waits for DNS, the domain is proven, then SCIM adds and removes people. */
export function SsoArt({ seen }: { seen: boolean }) {
  const step = useStep(seen, 4, 1700, 3);
  const proven = step >= 1;
  return (
    <div className="wl-ct-sso">
      <div className="wl-ct-sso-top">
        <b>Okta</b>
        <span>OIDC · fieldnote.test</span>
        <i className={proven ? "wl-ct-ok" : "wl-ct-wait"}>{proven ? "Domain proven" : "Waiting for DNS"}</i>
      </div>
      <code>TXT _wizelens-sso-okta.fieldnote.test</code>
      <div className={`wl-ct-sso-btn${proven ? " wl-on" : ""}`}>Sign in with SSO</div>
      <AnimatePresence initial={false}>
        {SCIM.filter((s) => step >= s.at).map((s) => (
          <motion.p key={s.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>{s.text}</motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

const DEVICES = ["Chrome on Windows · this device", "Safari on iPhone · 2 days ago"];

/** Two-step sign-in, a passkey, and the signed-in devices; one device is signed out, and an email says so. */
export function AccountArt({ seen }: { seen: boolean }) {
  const out = useStep(seen, 2, 2800) === 1;
  return (
    <div className="wl-ct-acct">
      <div><span>Two-step sign-in</span><b className="wl-ct-ok">On · 10 backup codes</b></div>
      <div><span>Passkey</span><b>MacBook Touch ID</b></div>
      <div><span>Breached passwords</span><b>Refused</b></div>
      {DEVICES.map((d, i) => (
        <div key={d} className={i === 1 && out ? "wl-ct-acct-out" : undefined}>
          <span>{d}</span>
          {i === 1 && <b>{out ? "Signed out" : "Sign out"}</b>}
        </div>
      ))}
    </div>
  );
}

const CADENCE = ["Daily", "Weekly", "Monthly"];

/** A project digest: the cadence flips, and the numbers count up. */
export function MailArt({ seen }: { seen: boolean }) {
  const i = useStep(seen, 3, 2400, 1);
  return (
    <div className="wl-ct-mail">
      <div className="wl-ct-mail-tabs">{CADENCE.map((c, j) => <span key={c} className={j === i ? "wl-on" : undefined}>{c}</span>)}</div>
      <b>Shop · {CADENCE[i]} digest · 9:00 your time</b>
      <div className="wl-ct-mail-stats">
        <div><strong><Num value={seen ? 1.24 : 0} decimals={2} suffix="M" /></strong><span>requests</span></div>
        <div><strong><Num value={seen ? 0.4 : 0} decimals={1} suffix="%" /></strong><span>error rate</span></div>
        <div><strong><Num value={seen ? 212 : 0} decimals={0} suffix=" ms" /></strong><span>p95</span></div>
      </div>
      <p>Top error: TypeError in checkout-web · 214 times</p>
    </div>
  );
}
