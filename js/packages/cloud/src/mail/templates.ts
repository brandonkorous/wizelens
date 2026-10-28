import { render } from "@react-email/components";
import { createElement } from "react";
import type { Notice } from "@wizeworks/lens-hub/kit";
import type { EmailContent } from "./content.js";
import * as emails from "./emails.js";
import { EmailLayout } from "./layout.js";
import type { Mail } from "./mailer.js";
import { textOf } from "./text.js";

/** One email for one address: the layout as HTML, and the same content as plain text. */
export async function renderMail(to: string, content: EmailContent): Promise<Mail> {
  const html = await render(createElement(EmailLayout, { content }));
  const headers = content.unsubscribe && { "List-Unsubscribe": `<${content.unsubscribe.url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  return { kind: content.kind, to, subject: content.subject, html, text: textOf(content), ...(headers ? { headers } : {}) };
}

export const verifyEmailMail = (to: string, url: string) => renderMail(to, emails.verifyEmail(url));
export const resetPasswordMail = (to: string, url: string) => renderMail(to, emails.resetPassword(url));
export const changeEmailMail = (to: string, newEmail: string, url: string) => renderMail(to, emails.changeEmail(newEmail, url));
export const deleteAccountMail = (to: string, url: string) => renderMail(to, emails.deleteAccount(url));
export const inviteMail = (to: string, inviter: string, org: string, role: string, url: string) => renderMail(to, emails.invite(inviter, org, role, url));
export const alertMail = (to: string, notice: Notice, timeZone?: string) => renderMail(to, emails.alert(notice, timeZone));
