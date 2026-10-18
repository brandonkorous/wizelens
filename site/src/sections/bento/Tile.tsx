"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView } from "motion/react";

type Props = { area: string; title: string; body: string; children: (seen: boolean) => ReactNode; night?: boolean };

// One bento cell: a title, one sentence, and a small live demo that starts when the cell is seen.
export function Tile({ area, title, body, children, night = false }: Props) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { amount: 0.35, once: true });
  return (
    <motion.article
      ref={ref}
      className={`wl-tile${night ? " wl-tile-night" : ""}`}
      style={{ gridArea: area }}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="wl-tile-text">
        <h3 className="wl-h3">{title}</h3>
        <p>{body}</p>
      </div>
      <div className="wl-tile-art">{children(seen)}</div>
    </motion.article>
  );
}
