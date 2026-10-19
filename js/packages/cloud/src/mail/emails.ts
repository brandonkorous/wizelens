import type { Notice } from "@wizeworks/lens-hub/kit";
import { type EmailContent, facts, note, text } from "./content.js";

// Every email the cloud sends, as content only. The words follow the README's voice: plain, short, concrete.
const IGNORE = "If you did not ask for this, you can ignore this email. Nothing changes.";
const ACCOUNT_FOOTER = "You got this email because someone used this address on WizeLens.";

function account(subject: string, heading: string, lines: string[], action: { label: string; url: string }): EmailContent {
  return { kind: "account", subject, preview: lines[0]!, heading, tone: "neutral", blocks: [...lines.map(text), note(IGNORE)], action, footer: ACCOUNT_FOOTER };
}

export const verifyEmail = (url: string) =>
  account("Confirm your email for WizeLens", "Confirm your email.", ["Confirm that this is your email address. The link works for 1 hour."], { label: "Confirm email", url });

export const resetPassword = (url: string) =>
  account("Reset your WizeLens password", "Reset your password.", ["Someone asked to reset the password of this account. The link works for 30 minutes, once.", "A new password signs out every device."], {
    label: "Set a new password",
    url,
  });

export const changeEmail = (newEmail: string, url: string) =>
  account("Confirm your new WizeLens email", "Confirm the new email.", [`Someone asked to change the email of this account to ${newEmail}.`, "Confirm it here first. Then we send a link to the new address."], {
    label: "Confirm the change",
    url,
  });

export const deleteAccount = (url: string) =>
  account("Confirm deleting your WizeLens account", "Delete your account?", ["Someone asked to delete this account. This cannot be undone. The link works for 1 day."], {
    label: "Delete my account",
    url,
  });

export function invite(inviter: string, org: string, role: string, url: string): EmailContent {
  return {
    kind: "invite",
    subject: `${inviter} invited you to ${org} on WizeLens`,
    preview: `Join ${org} as ${role}.`,
    heading: `Join ${org}.`,
    tone: "neutral",
    blocks: [text(`${inviter} invited you to join ${org} on WizeLens as ${role}.`), facts([["Team", org], ["Role", role], ["Works for", "7 days"]])],
    action: { label: `Join ${org}`, url },
    footer: `${inviter} sent this invite. If you do not know them, ignore it.`,
  };
}

const VERB = { fired: "Alert", resolved: "Resolved", remind: "Still firing", test: "Test" } as const;
const TONE = { fired: "bad", resolved: "good", remind: "bad", test: "neutral" } as const;
const number = (v: number | null) => (v === null ? "no data" : String(Math.round(v * 100) / 100));

export function alert(n: Notice): EmailContent {
  const when = `${new Date(n.timeMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return {
    kind: "alert",
    subject: `${VERB[n.state]}: ${n.rule} (${n.project})`,
    preview: n.message,
    heading: `${VERB[n.state]}: ${n.rule}.`,
    tone: TONE[n.state],
    blocks: [text(n.message), facts([["Project", n.project], ["Value", number(n.value)], ["Threshold", number(n.threshold)], ["When", when]])],
    action: { label: "Open the alert", url: n.url },
    footer: `You get this because an alert rule in ${n.project} emails you. Change it on the Alerts page.`,
  };
}
