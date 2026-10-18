import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { loadLegal } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const doc = await loadLegal("security");
  return { title: doc.title, description: doc.description };
}

export default function Page() {
  return <LegalPage slug="security" />;
}
