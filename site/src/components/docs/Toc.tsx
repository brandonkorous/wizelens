"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Heading } from "@/lib/docs/plugins";

function useActive(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    if (els.length === 0) return;
    const onScroll = () => {
      let current = els[0]!.id;
      for (const el of els) if (el.getBoundingClientRect().top < 140) current = el.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ids]);
  return active;
}

// "On this page": follows your reading position with a small sliding marker.
export function Toc({ headings }: { headings: Heading[] }) {
  const ids = useMemo(() => headings.map((h) => h.id), [headings]);
  const active = useActive(ids);
  if (headings.length < 2) return <aside className="wl-toc" />;
  return (
    <aside className="wl-toc" aria-label="On this page">
      <h2>On this page</h2>
      <ul>
        {headings.map((h) => (
          <li key={h.id} className={h.depth === 3 ? "wl-toc-sub" : undefined}>
            <a href={`#${h.id}`} className={active === h.id ? "wl-on" : undefined}>
              {active === h.id && <motion.span layoutId="wl-toc-marker" className="wl-toc-marker" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
