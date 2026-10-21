import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { DOC_LIST, docHref } from "./docs/nav";

export type Route = { path: string; source: string | string[]; priority: number; change: "weekly" | "monthly" | "yearly" };

const SITE = process.cwd();

// Every public page, with the files its words come from (for the last-changed date) and its weight.
export function allRoutes(): Route[] {
  const docs: Route[] = DOC_LIST.map((d) => ({
    path: docHref(d.slug),
    source: d.slug === "contract" ? "../docs/CONTRACT.md" : `content/docs/${d.slug || "index"}.md`,
    priority: d.slug === "" || d.slug === "quick-start" ? 0.9 : 0.7,
    change: "weekly",
  }));
  return [
    { path: "/", source: "src/app/page.tsx", priority: 1, change: "weekly" },
    { path: "/dotnet/", source: "src/sections/stacks/data/dotnet.ts", priority: 0.9, change: "monthly" },
    { path: "/node/", source: "src/sections/stacks/data/node.ts", priority: 0.9, change: "monthly" },
    { path: "/react/", source: "src/sections/stacks/data/react.ts", priority: 0.9, change: "monthly" },
    { path: "/vue/", source: "src/sections/stacks/data/vue.ts", priority: 0.9, change: "monthly" },
    { path: "/angular/", source: "src/sections/stacks/data/angular.ts", priority: 0.9, change: "monthly" },
    { path: "/svelte/", source: "src/sections/stacks/data/svelte.ts", priority: 0.9, change: "monthly" },
    { path: "/java/", source: "src/sections/stacks/data/java.ts", priority: 0.9, change: "monthly" },
    { path: "/python/", source: "src/sections/stacks/data/python.ts", priority: 0.9, change: "monthly" },
    { path: "/go/", source: "src/sections/stacks/data/go.ts", priority: 0.9, change: "monthly" },
    { path: "/cloud/", source: "src/sections/cloud/Cloud.tsx", priority: 0.8, change: "monthly" },
    { path: "/pricing/", source: "src/sections/pricing/plans.ts", priority: 0.8, change: "monthly" },
    { path: "/story/", source: ["src/sections/story/scene.ts", "src/sections/story/Story.tsx", "src/app/story/page.tsx"], priority: 0.7, change: "yearly" },
    { path: "/changelog/", source: "../CHANGELOG.md", priority: 0.6, change: "weekly" },
    ...docs,
    ...["privacy", "terms", "security", "license"].map((s): Route => ({ path: `/${s}/`, source: `content/legal/${s}.md`, priority: 0.3, change: "yearly" })),
  ];
}

// The newest date any of the page's source files changed in git, or today if git cannot say.
export function lastChanged(source: string | string[]): Date {
  const files = (Array.isArray(source) ? source : [source]).map((f) => join(SITE, f));
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", ...files], { cwd: SITE, encoding: "utf8" }).trim();
    return out ? new Date(out) : new Date();
  } catch {
    return new Date();
  }
}
