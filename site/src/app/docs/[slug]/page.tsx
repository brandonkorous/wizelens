import type { Metadata } from "next";
import { DocPage } from "@/components/docs/DocPage";
import { loadDoc } from "@/lib/docs/content";
import { DOC_LIST } from "@/lib/docs/nav";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return DOC_LIST.filter((d) => d.slug).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await loadDoc(slug);
  return { title: doc?.title, description: doc?.description };
}

export default async function DocsSlug({ params }: Props) {
  const { slug } = await params;
  return <DocPage slug={slug} />;
}
