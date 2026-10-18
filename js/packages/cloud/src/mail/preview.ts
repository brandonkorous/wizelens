#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { EmailContent } from "./content.js";
import * as emails from "./emails.js";
import { renderMail } from "./templates.js";

const LINK = "https://app.wizelens.com/_wizelens/#/verify-email?token=sample-token";
const notice = (state: "fired" | "resolved") => ({
  rule: "Checkout errors",
  project: "shop",
  state,
  message: state === "fired" ? "Error rate is 7.4% (above 5)" : "Error rate is 1.2% (no longer above 5)",
  value: state === "fired" ? 7.4 : 1.2,
  threshold: 5,
  timeMs: Date.UTC(2026, 9, 18, 14, 30),
  url: "https://app.wizelens.com/_wizelens/#/alerts?project=p1",
});

/** Every email with sample data, for the preview and for tests. */
export const SAMPLES: Record<string, EmailContent> = {
  "verify-email": emails.verifyEmail(LINK),
  "reset-password": emails.resetPassword(LINK),
  "change-email": emails.changeEmail("new@acme.io", LINK),
  "delete-account": emails.deleteAccount(LINK),
  invite: emails.invite("Olive", "Acme", "member", LINK),
  "alert-fired": emails.alert(notice("fired")),
  "alert-resolved": emails.alert(notice("resolved")),
};

/** Write each sample as .html and .txt, plus an index page that links them. */
export async function writePreviews(dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const names = Object.keys(SAMPLES);
  for (const name of names) {
    const mail = await renderMail("ann@acme.io", SAMPLES[name]!);
    await writeFile(join(dir, `${name}.html`), mail.html);
    await writeFile(join(dir, `${name}.txt`), `Subject: ${mail.subject}\n\n${mail.text}`);
  }
  const links = names.map((n) => `<li><a href="${n}.html">${n}</a> · <a href="${n}.txt">text</a></li>`).join("");
  await writeFile(join(dir, "index.html"), `<!doctype html><meta charset="utf-8"><title>WizeLens emails</title><ul>${links}</ul>`);
  return names;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = resolve(process.argv[2] ?? "email-preview");
  const names = await writePreviews(dir);
  console.log(`Wrote ${names.length} emails to ${dir}. Open index.html.`);
}
