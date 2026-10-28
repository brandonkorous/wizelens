import { clockIn } from "./clock.js";
import { type EmailContent, facts, note, text } from "./content.js";
import type { Tone } from "./theme.js";

// Notices about changes to the person's own account. They always go out: they are how a taken account gets noticed.
const FOOTER = "We send a notice for every security change to your account. These notices cannot be turned off.";
const NOT_YOU = "If this was not you, reset your password now. It signs out every device.";

export interface SecurityLinks {
  /** The Account page, to review devices and sign-in settings. */
  account: string;
  /** The page that sends a reset link, for when the person cannot sign in. */
  forgot: string;
  /** The reader's time zone, so "When" is on their clock. */
  timeZone?: string;
}

const when = (ms: number, l: SecurityLinks) => clockIn(ms, l.timeZone);

function notice(subject: string, heading: string, lines: string[], tone: Tone, rows: [string, string][], action: { label: string; url: string }): EmailContent {
  return { kind: "security", subject, preview: lines[0]!, heading, tone, blocks: [...lines.map(text), facts(rows), note(NOT_YOU)], action, footer: FOOTER };
}

export const passwordChanged = (l: SecurityLinks, atMs: number) =>
  notice("Your WizeLens password was changed", "Your password changed.", ["The password of your WizeLens account was changed. Other devices were signed out."], "neutral", [["When", when(atMs, l)]], {
    label: "Reset your password",
    url: l.forgot,
  });

export const emailChanged = (l: SecurityLinks, newEmail: string, atMs: number) =>
  notice("Your WizeLens email was changed", "Your email changed.", [`Your WizeLens account now uses ${newEmail}. This address gets no more mail from it.`], "warn", [["New email", newEmail], ["When", when(atMs, l)]], {
    label: "Get back in",
    url: l.forgot,
  });

export const twoFactorChanged = (l: SecurityLinks, on: boolean, atMs: number) =>
  notice(
    on ? "Two-step sign-in is on for WizeLens" : "Two-step sign-in is off for WizeLens",
    on ? "Two-step sign-in is on." : "Two-step sign-in is off.",
    [on ? "Signing in now needs a code from your authenticator app, or a backup code." : "Signing in now needs only your password or a passkey."],
    on ? "good" : "warn",
    [["When", when(atMs, l)]],
    { label: "Review your account", url: l.account },
  );

export const passkeyChanged = (l: SecurityLinks, added: boolean, name: string, atMs: number) =>
  notice(
    added ? "A passkey was added to your WizeLens account" : "A passkey was removed from your WizeLens account",
    added ? "New passkey." : "Passkey removed.",
    [added ? "A new passkey can now sign in to your account." : "A passkey can no longer sign in to your account."],
    added ? "warn" : "neutral",
    [["Passkey", name || "Unnamed"], ["When", when(atMs, l)]],
    { label: "Review your passkeys", url: l.account },
  );

export const backupCodesMade = (l: SecurityLinks, atMs: number) =>
  notice("New WizeLens backup codes", "New backup codes.", ["New backup codes were made for two-step sign-in. The old codes no longer work."], "neutral", [["When", when(atMs, l)]], {
    label: "Review your account",
    url: l.account,
  });

export const newSignIn = (l: SecurityLinks, device: string, address: string, atMs: number) =>
  notice("New sign-in to your WizeLens account", "New sign-in.", [`Your account was signed in on ${device}, a device it has not used before.`], "warn", [["Device", device], ["Address", address || "Unknown"], ["When", when(atMs, l)]], {
    label: "Review your devices",
    url: l.account,
  });
