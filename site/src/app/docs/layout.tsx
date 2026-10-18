import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="wl-docs">
      <div className="wl-docs-grid">
        <DocsSidebar />
        {children}
      </div>
    </main>
  );
}
