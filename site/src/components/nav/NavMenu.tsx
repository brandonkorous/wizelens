"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export type MenuItem = { href: string; label: string; note: string };

// A small drop-down in the top bar. Opens on hover or click; on phones it lists its items in place.
export function NavMenu({ label, items, onPick }: { label: string; items: MenuItem[]; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="wl-navmenu" ref={box} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="wl-navmenu-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
        <svg viewBox="0 0 12 12" aria-hidden><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="wl-navmenu-pop" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}>
            {items.map((it) => (
              <a key={it.href} href={it.href} onClick={() => { setOpen(false); onPick(); }}>
                <b>{it.label}</b>
                <span>{it.note}</span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="wl-navmenu-inline">
        {items.map((it) => <a key={it.href} href={it.href} onClick={onPick}>{it.label}</a>)}
      </div>
    </div>
  );
}
