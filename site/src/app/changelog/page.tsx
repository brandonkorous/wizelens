import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { Changelog } from "@/sections/changelog/Changelog";

export const metadata = pageMeta({
  path: "/changelog/",
  title: "Changelog",
  description: "Every change to WizeLens, newest first: the in-app add-on, the local hub, the cloud, and what is on main now.",
  image: "changelog",
  imageAlt: "WizeLens changelog: 0.3.0-alpha.7 (security from real traffic), 0.3.0-alpha.6 (who your users are), 0.3.0-alpha.5 (tested on the real libraries), 0.3.0-alpha.4 (teams, problems, and every stack), 0.3.0-alpha.3 (search and scale), 0.3.0-alpha.2 (send-only in production), 0.3.0-alpha.1 (the cloud), 0.2.0-alpha.1 (the local hub), 0.1.0-alpha.1 (the in-app add-on).",
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Changelog", path: "/changelog/" }]))} />
      <Changelog />
    </>
  );
}
