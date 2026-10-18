import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph, software } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { StackPage } from "@/sections/stacks/StackPage";
import { DOTNET } from "@/sections/stacks/data/dotnet";

export const metadata = pageMeta({
  path: "/dotnet/",
  title: DOTNET.seoTitle,
  absolute: true,
  description: DOTNET.seoDescription,
  image: "dotnet",
  imageAlt: `${DOTNET.headline.join(" ")} A trace built from ${DOTNET.file}.`,
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(software(DOTNET.seoDescription), breadcrumbs([{ name: "WizeLens", path: "/" }, { name: DOTNET.name, path: "/dotnet/" }]))} />
      <StackPage stack={DOTNET} />
    </>
  );
}
