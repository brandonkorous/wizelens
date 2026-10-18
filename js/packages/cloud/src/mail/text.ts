import type { Block, EmailContent } from "./content.js";
import { theme } from "./theme.js";

const block = (b: Block): string => {
  if (b.kind === "facts") return b.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
  return b.text;
};

/** The plain-text version. Each link sits on its own line, so mail apps keep it whole. */
export function textOf(c: EmailContent): string {
  const action = c.action ? [`${c.action.label}:`, c.action.url] : [];
  return [c.heading, "", ...c.blocks.flatMap((b) => [block(b), ""]), ...(action.length ? [...action, ""] : []), "--", c.footer, theme.company, ""].join("\n");
}
