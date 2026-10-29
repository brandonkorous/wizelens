import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, graph, software } from "@/lib/schema";
import { latestVersion } from "@/lib/changelog";
import { pageMeta } from "@/lib/seo";
import { StackPage } from "./StackPage";
import type { Stack } from "./types";

// The metadata of a stack page: its own title, description, and share image.
export const stackMetadata = (s: Stack) =>
  pageMeta({
    path: `/${s.slug}/`,
    title: s.seoTitle,
    absolute: true,
    description: s.seoDescription,
    image: s.slug,
    imageAlt: `${s.headline.join(" ")} A trace built from ${s.file}.`,
  });

// A stack page with its structured data.
export async function StackRoute({ stack }: { stack: Stack }) {
  const latest = stack.release ? await latestVersion() : null;
  return (
    <>
      <JsonLd data={graph(software(stack.seoDescription), breadcrumbs([{ name: "WizeLens", path: "/" }, { name: stack.name, path: `/${stack.slug}/` }]))} />
      <StackPage stack={stack} latest={latest} />
    </>
  );
}
