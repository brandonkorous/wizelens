import type { Mail } from "./mailer.js";

// Every email: a short text version, and the same in simple HTML with one button.
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function compose(to: string, subject: string, lines: string[], action?: { label: string; url: string }): Mail {
  const text = [...lines, ...(action ? ["", `${action.label}: ${action.url}`] : []), "", "WizeLens"].join("\n");
  const button = action
    ? `<p><a href="${escape(action.url)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escape(action.label)}</a></p>`
    : "";
  const body = lines.map((l) => `<p>${escape(l)}</p>`).join("");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${body}${button}<p style="color:#666">WizeLens</p></div>`;
  return { to, subject, text, html };
}

const IGNORE = "If you did not ask for this, you can ignore this email.";

export const verifyEmailMail = (to: string, url: string) =>
  compose(to, "Confirm your email for WizeLens", ["Confirm that this is your email address. The link works for 1 hour.", IGNORE], { label: "Confirm email", url });

export const resetPasswordMail = (to: string, url: string) =>
  compose(to, "Reset your WizeLens password", ["Someone asked to reset the password of this account. The link works for 30 minutes, once.", IGNORE], {
    label: "Set a new password",
    url,
  });

export const changeEmailMail = (to: string, newEmail: string, url: string) =>
  compose(to, "Confirm your new WizeLens email", [`Someone asked to change the email of this account to ${newEmail}.`, "Confirm it here first.", IGNORE], {
    label: "Confirm the change",
    url,
  });

export const deleteAccountMail = (to: string, url: string) =>
  compose(to, "Confirm deleting your WizeLens account", ["Someone asked to delete this account. This cannot be undone. The link works for 1 day.", IGNORE], {
    label: "Delete my account",
    url,
  });

export const inviteMail = (to: string, inviter: string, org: string, role: string, url: string) =>
  compose(to, `${inviter} invited you to ${org} on WizeLens`, [`${inviter} invited you to join ${org} as ${role}.`, "The invite works for 7 days."], {
    label: `Join ${org}`,
    url,
  });

export const alertMail = (to: string, subject: string, lines: string[], url: string) => compose(to, subject, lines, { label: "Open WizeLens", url });
