import type { Metadata } from "next";
import { DocPage } from "@/components/docs/DocPage";
import { loadDoc } from "@/lib/docs/content";

export async function generateMetadata(): Promise<Metadata> {
  const doc = await loadDoc("");
  return { title: "Docs", description: doc?.description };
}

export default function DocsHome() {
  return <DocPage slug="" />;
}
