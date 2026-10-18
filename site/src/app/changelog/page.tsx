import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { Changelog } from "@/sections/changelog/Changelog";

export const metadata = pageMeta({
  path: "/changelog/",
  title: "Changelog",
  description: "Every change to WizeLens, newest first: the in-app add-on, the local hub, the cloud, and what is on main now.",
  image: "changelog",
  imageAlt: "WizeLens changelog: Unreleased, 0.3.0-alpha.1 (the cloud), 0.2.0-alpha.1 (the local hub), 0.1.0-alpha.1 (the in-app add-on).",
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Changelog", path: "/changelog/" }]))} />
      <Changelog />
    </>
  );
}
