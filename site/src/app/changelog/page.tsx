import { JsonLd } from "@/components/seo/JsonLd";
import { loadReleases } from "@/lib/changelog";
import { breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { Changelog } from "@/sections/changelog/Changelog";

// The image shows the four newest releases, so the alt text reads them from CHANGELOG.md too.
export async function generateMetadata() {
  const newest = (await loadReleases()).slice(0, 4).map((r) => `${r.version}${r.title ? ` (${r.title.toLowerCase()})` : ""}`);
  return pageMeta({
    path: "/changelog/",
    title: "Changelog",
    description: "Every change to WizeLens, newest first: the in-app add-on, the local hub, the cloud, every stack, and what is on main now.",
    image: "changelog",
    imageAlt: `WizeLens changelog, every change newest first: ${newest.join(", ")}.`,
  });
}

export default function Page() {
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Changelog", path: "/changelog/" }]))} />
      <Changelog />
    </>
  );
}
