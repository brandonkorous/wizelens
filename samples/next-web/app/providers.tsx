"use client";
// First import: lets WizeLens see every React render.
import "@wizeworks/lens-react/install";
import type { ReactNode } from "react";
import { WizeLensProvider } from "@wizeworks/lens-react";

/** WizeLens in the browser. The release comes from withWizeLensSourceMaps in next.config.mjs. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <WizeLensProvider endpoint="/_wizelens" release={process.env.NEXT_PUBLIC_WIZELENS_RELEASE}>
      {children}
    </WizeLensProvider>
  );
}
