"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "motion/react";

type Props = { value: number; suffix?: string; decimals?: number; duration?: number };

function format(v: number, decimals: number | undefined, suffix: string): string {
  const d = decimals ?? (Math.abs(v) < 10 && v !== 0 ? 1 : 0);
  const text = v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${text}${suffix}`;
}

// A number that counts to its new value instead of jumping.
export function Num({ value, suffix = "", decimals, duration = 0.8 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);

  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [mv, value, duration]);

  useMotionValueEvent(mv, "change", (v) => {
    if (ref.current) ref.current.textContent = format(v, decimals, suffix);
  });

  return <span ref={ref} className="wl-num">{format(value, decimals, suffix)}</span>;
}
