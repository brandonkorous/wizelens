import { LegalPage } from "@/components/legal/LegalPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { loadLegal } from "@/lib/legal";
import { breadcrumbs, graph } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata() {
  const doc = await loadLegal("terms");
  return pageMeta({ path: "/terms/", title: doc.title, description: doc.description, image: "terms", imageAlt: `${doc.title}: ${doc.description}` });
}

export default function Page() {
  return (
    <>
      <JsonLd data={graph(breadcrumbs([{ name: "WizeLens", path: "/" }, { name: "Terms of use", path: "/terms/" }]))} />
      <LegalPage slug="terms" />
    </>
  );
}
