#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SAMPLES } from "./samples.js";
import { renderMail } from "./templates.js";

export { SAMPLES };

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
