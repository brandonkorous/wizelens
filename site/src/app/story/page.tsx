import { JsonLd } from "@/components/seo/JsonLd";
import { article, breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { Story } from "@/sections/story/Story";

const description =
  "Glimpse let you open the hood on one ASP.NET request. Then apps split into services. Why we rebuilt that view as WizeLens, for .NET, Node, and React.";

export const metadata = pageMeta({
  path: "/story/",
  title: "Glimpse, rebuilt: why we made WizeLens",
  absolute: true,
  description,
  image: "story",
  imageAlt: "Glimpse, rebuilt. One request folded into one timeline across a React app, a gateway, services, a queue, and SQL.",
  type: "article",
});

export default function Page() {
  return (
    <>
      <JsonLd data={graph(article({ title: "Glimpse, rebuilt", description, path: "/story/", image: "story" }), breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Glimpse, rebuilt", path: "/story/" }]))} />
      <Story />
    </>
  );
}
