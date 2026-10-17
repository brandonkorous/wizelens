"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { HealthProvider } from "./health";

// Motion follows the visitor's reduced-motion setting; health is shared by the hero and the logo.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <HealthProvider>{children}</HealthProvider>
    </MotionConfig>
  );
}
