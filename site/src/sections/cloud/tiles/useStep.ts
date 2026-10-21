"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

// Counts 0 to count - 1 every `ms` while active; with reduced motion it holds `rest`.
export function useStep(active: boolean, count: number, ms: number, rest = 0): number {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % count), ms);
    return () => window.clearInterval(id);
  }, [active, count, ms, reduced]);
  return reduced ? rest : i;
}
