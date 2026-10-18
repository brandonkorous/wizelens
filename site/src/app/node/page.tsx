import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph, software } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { StackPage } from "@/sections/stacks/StackPage";
import { NODE } from "@/sections/stacks/data/node";

export const metadata = pageMeta({
  path: "/node/",
  title: NODE.seoTitle,
  absolute: true,
  description: NODE.seoDescription,
  image: "node",
  imageAlt: `${NODE.headline.join(" ")} A trace built from ${NODE.file}.`,
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(software(NODE.seoDescription), breadcrumbs([{ name: "WizeLens", path: "/" }, { name: NODE.name, path: "/node/" }]))} />
      <StackPage stack={NODE} />
    </>
  );
}
