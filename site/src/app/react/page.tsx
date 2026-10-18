import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph, software } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { StackPage } from "@/sections/stacks/StackPage";
import { REACT } from "@/sections/stacks/data/react";

export const metadata = pageMeta({
  path: "/react/",
  title: REACT.seoTitle,
  absolute: true,
  description: REACT.seoDescription,
  image: "react",
  imageAlt: `${REACT.headline.join(" ")} A trace built from ${REACT.file}.`,
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(software(REACT.seoDescription), breadcrumbs([{ name: "WizeLens", path: "/" }, { name: REACT.name, path: "/react/" }]))} />
      <StackPage stack={REACT} />
    </>
  );
}
