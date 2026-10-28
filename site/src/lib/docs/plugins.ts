import type { Element, ElementContent, Root } from "hast";
import { toString } from "hast-util-to-string";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";

export type Heading = { id: string; text: string; depth: 2 | 3 };
export type Section = { id: string; title: string; text: string };

const REPO_BLOB = "https://github.com/brandonkorous/wizelens/blob/main/";

// Links inside the repo's Markdown point at files; on the site they point at pages.
const FILE_PAGES: Record<string, string> = {
  "README.md#configuration": "/docs/configuration/",
  "README.md": "/docs/",
  "CONTRACT.md": "/docs/contract/",
  "GETTING-STARTED.md": "/docs/quick-start/",
};

export function mapHref(href: string): string {
  if (/^(https?:|mailto:|#|\/)/.test(href)) return href;
  const clean = href.replace(/^(\.\.\/|\.\/)+/, "").replace(/^docs\//, "");
  const [file = "", hash] = clean.split("#");
  const page = FILE_PAGES[clean] ?? FILE_PAGES[file];
  if (page) return page.includes("#") || !hash ? page : `${page}#${hash}`;
  return `${REPO_BLOB}${clean}`;
}

export function rehypeLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "img") Object.assign(node.properties, { loading: "lazy", decoding: "async" });
      // A table scrolls sideways when it must, so the keyboard can reach it too.
      if (node.tagName === "table") node.properties.tabIndex = 0;
      if (node.tagName !== "a" || typeof node.properties.href !== "string") return;
      node.properties.href = mapHref(node.properties.href);
      if (/^https?:/.test(node.properties.href)) node.properties.rel = ["noreferrer"];
    });
  };
}

// Collects h2 and h3 for the page outline, and adds a small anchor link to each.
export function rehypeHeadings() {
  return (tree: Root, file: VFile) => {
    const headings: Heading[] = [];
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") return;
      const id = String(node.properties.id ?? "");
      headings.push({ id, text: toString(node), depth: node.tagName === "h2" ? 2 : 3 });
      const anchor: ElementContent = { type: "element", tagName: "a", properties: { href: `#${id}`, className: ["wl-anchor"], ariaHidden: "true", tabIndex: -1 }, children: [{ type: "text", value: "#" }] };
      node.children.push(anchor);
    });
    file.data.headings = headings;
  };
}

// Splits the page at each heading into whole plain-text sections for the docs search; the snippet trims them.
export function rehypeSections() {
  return (tree: Root, file: VFile) => {
    const sections: Section[] = [{ id: "", title: "", text: "" }];
    for (const node of tree.children) {
      if (node.type !== "element") continue;
      if (node.tagName === "h2" || node.tagName === "h3") {
        sections.push({ id: String(node.properties.id ?? ""), title: toString(node).replace(/#$/, ""), text: "" });
        continue;
      }
      const last = sections[sections.length - 1]!;
      last.text = `${last.text} ${toString(node)}`.replace(/\s+/g, " ").trim();
    }
    file.data.sections = sections;
  };
}

declare module "vfile" {
  interface DataMap {
    headings: Heading[];
    sections: Section[];
  }
}
