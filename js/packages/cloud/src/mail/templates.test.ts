import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { clockIn } from "./clock.js";
import { SAMPLES, writePreviews } from "./preview.js";
import { renderMail } from "./templates.js";
import { theme } from "./theme.js";

it("renders every email as HTML and text from one content", async () => {
  for (const [name, content] of Object.entries(SAMPLES)) {
    const mail = await renderMail("ann@acme.io", content);
    expect(mail.subject, name).toBe(content.subject);
    expect(mail.html, name).toContain(content.heading.replace("'", "&#x27;"));
    expect(mail.html, name).toContain(theme.tone[content.tone]);
    expect(mail.html, name).toContain(content.footer);
    expect(mail.html, name).not.toMatch(/undefined|\[object Object\]/);
    expect(mail.text, name).toContain(content.heading);
    if (content.action) expect(mail.text.split("\n"), name).toContain(content.action.url);
    if (content.action) expect(mail.html, name).toContain(`href="${content.action.url.replaceAll("&", "&amp;")}"`);
  }
});

it("escapes what people typed", async () => {
  const content = { ...SAMPLES.invite!, heading: "Join <script>alert(1)</script>." };
  expect((await renderMail("a@b.c", content)).html).not.toContain("<script>alert(1)</script>");
});

it("colors the dot by state: red when an alert fires, green when it resolves", () => {
  expect(SAMPLES["alert-fired"]!.tone).toBe("bad");
  expect(SAMPLES["alert-resolved"]!.tone).toBe("good");
  expect(SAMPLES["alert-fired"]!.blocks.find((b) => b.kind === "facts")).toMatchObject({ rows: expect.arrayContaining([{ label: "When", value: "Oct 18, 2026, 2:30 PM UTC" }]) });
});

it("shows an alert's time in the reader's zone, and UTC when the zone is unknown", () => {
  const ms = Date.UTC(2026, 9, 28, 5, 59);
  expect(clockIn(ms, "America/Los_Angeles")).toBe("Oct 27, 2026, 10:59 PM PDT");
  expect(clockIn(ms, "Mars/Olympus")).toBe("Oct 28, 2026, 5:59 AM UTC");
});

it("writes a preview of every email", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wl-mail-"));
  await writePreviews(dir);
  const files = await readdir(dir);
  expect(files).toContain("index.html");
  expect(files.filter((f) => f.endsWith(".html"))).toHaveLength(Object.keys(SAMPLES).length + 1);
});
