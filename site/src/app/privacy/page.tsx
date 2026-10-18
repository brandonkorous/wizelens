import { LegalPage } from "@/components/legal/LegalPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { loadLegal } from "@/lib/legal";
import { breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata() {
  const doc = await loadLegal("privacy");
  return pageMeta({ path: "/privacy/", title: doc.title, description: doc.description, image: "privacy", imageAlt: `${doc.title}: ${doc.description}` });
}

export default function Page() {
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Privacy", path: "/privacy/" }]))} />
      <LegalPage slug="privacy" />
    </>
  );
}
