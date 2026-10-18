import { DocPage } from "@/components/docs/DocPage";
import { JsonLd } from "@/components/seo/JsonLd";
import { docMetadata, docSchema } from "@/lib/docs/meta";
import { DOC_LIST } from "@/lib/docs/nav";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_LIST.filter((d) => d.slug).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return docMetadata(slug);
}

export default async function DocsSlug({ params }: Props) {
  const { slug } = await params;
  return (
    <>
      <JsonLd data={await docSchema(slug)} />
      <DocPage slug={slug} />
    </>
  );
}
