import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE, absoluteUrl } from "./seo";

type Thing = Record<string, unknown>;

const ORG_ID = `${SITE.url}/#org`;
const SITE_ID = `${SITE.url}/#website`;
const APP_ID = `${SITE.url}/#software`;

// The version shown to search engines comes from the core package, so it moves with each release.
const VERSION: string = JSON.parse(readFileSync(join(process.cwd(), "..", "js", "packages", "core", "package.json"), "utf8")).version;

// Structured data (schema.org) that tells search engines and AI tools what WizeLens is and who makes it.
export function organization(): Thing {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.company,
    alternateName: "WizeWorks",
    url: SITE.url,
    logo: absoluteUrl("/brand/wizelens-mark-512.png"),
    sameAs: [SITE.repo],
    address: { "@type": "PostalAddress", addressLocality: "Visalia", addressRegion: "CA", addressCountry: "US" },
    contactPoint: [
      { "@type": "ContactPoint", contactType: "security", email: "security@wizelens.com" },
      { "@type": "ContactPoint", contactType: "privacy", email: "privacy@wizelens.com" },
    ],
  };
}

export function website(): Thing {
  return { "@type": "WebSite", "@id": SITE_ID, url: SITE.url, name: SITE.name, description: "Request tracing for .NET, Node, Java, Python, Go, and the browser.", publisher: { "@id": ORG_ID }, inLanguage: "en" };
}

export function software(description: string): Thing {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE.name,
    description,
    url: SITE.url,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Request tracing and profiling",
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: VERSION,
    license: "https://opensource.org/license/mit",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": ORG_ID },
    codeRepository: SITE.repo,
    programmingLanguage: ["C#", "TypeScript", "Java", "Python", "Go"],
    keywords: "request profiler, distributed tracing, N+1 query detection, OpenTelemetry, ASP.NET Core, Node.js, Java, Python, Go, React, Next.js, Vue, Angular, Svelte, OWASP Top 10, Glimpse, MCP",
  };
}

export function breadcrumbs(items: { name: string; path: string }[]): Thing {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

export function techArticle(a: { title: string; description: string; path: string; section: string }): Thing {
  return {
    "@type": "TechArticle",
    headline: a.title,
    description: a.description,
    url: absoluteUrl(a.path),
    articleSection: a.section,
    inLanguage: "en",
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    about: { "@id": APP_ID },
    image: absoluteUrl(`/og/${a.path === "/docs/" ? "docs" : `docs-${a.path.split("/")[2]}`}.png`),
  };
}

export function article(a: { title: string; description: string; path: string; image: string }): Thing {
  return {
    "@type": "Article",
    headline: a.title,
    description: a.description,
    url: absoluteUrl(a.path),
    image: absoluteUrl(`/og/${a.image}.png`),
    datePublished: "2026-10-17",
    inLanguage: "en",
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    about: { "@id": APP_ID },
  };
}

export function faq(items: { q: string; a: string }[]): Thing {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };
}

export function graph(...things: Thing[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": things }).replace(/</g, "\\u003c");
}
