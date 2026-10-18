import { DocPage } from "@/components/docs/DocPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { docMetadata, docSchema } from "@/lib/docs/meta";

export function generateMetadata() {
  return docMetadata("");
}

export default async function DocsHome() {
  return (
    <>
      <JsonLd data={await docSchema("")} />
      <DocPage slug="" />
    </>
  );
}
