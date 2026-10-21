export type DocLink = { slug: string; title: string };
export type DocGroup = { title: string; items: DocLink[] };

// The docs sidebar, in reading order. Prev and next links follow this order too.
export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Start here",
    items: [
      { slug: "", title: "Introduction" },
      { slug: "quick-start", title: "Quick start" },
    ],
  },
  {
    title: "Add-ons",
    items: [
      { slug: "aspnet-core", title: "ASP.NET Core" },
      { slug: "node", title: "Node" },
      { slug: "nextjs", title: "Next.js" },
      { slug: "react", title: "React" },
      { slug: "browser", title: "Vue, Angular, Svelte, JS" },
    ],
  },
  {
    title: "OpenTelemetry",
    items: [
      { slug: "java", title: "Java" },
      { slug: "python", title: "Python" },
      { slug: "go", title: "Go" },
    ],
  },
  {
    title: "Guides",
    items: [
      { slug: "several-services", title: "Several services" },
      { slug: "hub", title: "The local hub" },
      { slug: "cloud", title: "WizeLens Cloud" },
      { slug: "kubernetes", title: "Hosts and Kubernetes" },
      { slug: "production", title: "Production" },
      { slug: "auto-install", title: "No code change" },
      { slug: "sampling", title: "Sampling" },
      { slug: "source-maps", title: "Source maps" },
      { slug: "ai-access", title: "AI access (MCP)" },
    ],
  },
  {
    title: "Using WizeLens",
    items: [
      { slug: "hud", title: "The HUD" },
      { slug: "dashboard", title: "The dashboard" },
      { slug: "search", title: "Search" },
      { slug: "errors", title: "Errors" },
      { slug: "logs", title: "Logs" },
      { slug: "releases", title: "Releases" },
      { slug: "users", title: "Users" },
      { slug: "insights", title: "Insights" },
      { slug: "security", title: "Security" },
      { slug: "problems", title: "Problems" },
      { slug: "alerts", title: "Alerts" },
      { slug: "uptime", title: "Uptime checks" },
      { slug: "slos", title: "SLOs and Apdex" },
      { slug: "dashboards", title: "Dashboards" },
      { slug: "tags", title: "Tags" },
    ],
  },
  {
    title: "Reference",
    items: [
      { slug: "configuration", title: "Configuration" },
      { slug: "troubleshooting", title: "Troubleshooting" },
      { slug: "contract", title: "Wire contract" },
    ],
  },
];

export const DOC_LIST: DocLink[] = DOC_GROUPS.flatMap((g) => g.items);

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}/` : "/docs/";
}

export function neighbors(slug: string): { prev?: DocLink; next?: DocLink } {
  const i = DOC_LIST.findIndex((d) => d.slug === slug);
  return { prev: i > 0 ? DOC_LIST[i - 1] : undefined, next: i >= 0 ? DOC_LIST[i + 1] : undefined };
}
