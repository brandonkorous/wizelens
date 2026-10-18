import type { Block, EmailContent } from "./content.js";
import { theme } from "./theme.js";

const block = (b: Block): string => {
  if (b.kind === "facts") return b.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
  if (b.kind === "stats") return b.items.map((s) => `${s.label}: ${s.value}${s.change ? ` (${s.change})` : ""}`).join("\n");
  if (b.kind === "list") return [b.title, ...b.items.map((i) => `- ${i.text}${i.meta ? ` (${i.meta})` : ""}`)].join("\n");
  return b.text;
};

/** The plain-text version. Each link sits on its own line, so mail apps keep it whole. */
export function textOf(c: EmailContent): string {
  const action = c.action ? [`${c.action.label}:`, c.action.url, ""] : [];
  const stop = c.unsubscribe ? [`${c.unsubscribe.label}:`, c.unsubscribe.url] : [];
  return [c.heading, "", ...c.blocks.flatMap((b) => [block(b), ""]), ...action, "--", c.footer, ...stop, theme.company, ""].join("\n");
}
