import type { MetadataRoute } from "next";
import { allRoutes, lastChanged } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return allRoutes().map((r) => ({
    url: absoluteUrl(r.path),
    lastModified: lastChanged(r.source),
    changeFrequency: r.change,
    priority: r.priority,
  }));
}
