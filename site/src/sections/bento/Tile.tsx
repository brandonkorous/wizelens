"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { ChevronIcon } from "@/components/ui/icons";

type Props = { area: string; title: string; body: string; children: (seen: boolean) => ReactNode; night?: boolean };

const PHONE = "(max-width: 680px)";
const onPhoneChange = (fn: () => void) => {
  const q = window.matchMedia(PHONE);
  q.addEventListener("change", fn);
  return () => q.removeEventListener("change", fn);
};

// True on a phone, where a tile shows its title and first sentence until someone opens it. The server says no; CSS folds the tile either way.
const usePhone = () => useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);

// "First sentence." and the rest, so a folded tile keeps one line.
function split(body: string): [string, string] {
  const m = /^(.+?[.!?])\s+(.+)$/s.exec(body);
  return m ? [m[1]!, m[2]!] : [body, ""];
}

// One bento cell: a title, one sentence, and a small live demo that starts when the cell is seen. On a phone the rest folds behind Show more.
export function Tile({ area, title, body, children, night = false }: Props) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { amount: 0.35, once: true });
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [lead, rest] = split(body);
  return (
    <motion.article
      ref={ref}
      className={`wl-tile${night ? " wl-tile-night" : ""}${open ? " wl-tile-open" : ""}`}
      style={{ gridArea: area }}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="wl-tile-text">
        <h3 className="wl-h3">{title}</h3>
        <p>{lead}{rest && <span className="wl-tile-rest"> {rest}</span>}</p>
      </div>
      <button type="button" className="wl-tile-more" aria-expanded={open} aria-label={`${open ? "Show less" : "Show more"}: ${title}`} onClick={() => setOpen(!open)}>
        {open ? "Show less" : "Show more"} <ChevronIcon dir="down" />
      </button>
      <div className="wl-tile-art">{children(seen && (!phone || open))}</div>
    </motion.article>
  );
}
