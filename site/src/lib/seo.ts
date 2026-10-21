import type { Metadata } from "next";

export const SITE = {
  url: "https://wizelens.com",
  name: "WizeLens",
  company: "WizeWorks LLC",
  repo: "https://github.com/brandonkorous/wizelens",
  tagline: "See what matters.",
};

export const HOME_DESCRIPTION =
  "See everything one request did, from the browser click to the SQL, in .NET, Node, Java, Python, and Go. Open source tracing that finds N+1s and security risks.";

type PageMeta = {
  path: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  absolute?: boolean;
  type?: "website" | "article";
};

// One place that builds a page's metadata: title, canonical address, and its own share image.
export function pageMeta({ path, title, description, image, imageAlt, absolute = false, type = "website" }: PageMeta): Metadata {
  const images = [{ url: `/og/${image}.png`, width: 1200, height: 630, alt: imageAlt, type: "image/png" }];
  const fullTitle = absolute ? title : `${title} · ${SITE.name}`;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type, url: path, siteName: SITE.name, title: fullTitle, description, images, locale: "en_US" },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: images.map((i) => i.url) },
  };
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}
