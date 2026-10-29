"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronIcon } from "@/components/ui/icons";

// The release chips: one line that scrolls on a phone, with an arrow button at each edge that hides more.
export function JumpRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => setMore({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    mark();
    el.addEventListener("scroll", mark, { passive: true });
    const seen = new ResizeObserver(mark);
    seen.observe(el);
    return () => (el.removeEventListener("scroll", mark), seen.disconnect());
  }, []);
  const step = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  return (
    <div className="wl-cl-jump-row">
      {more.left && <button type="button" className="wl-cl-arrow wl-cl-arrow-left" tabIndex={-1} aria-hidden onClick={() => step(-1)}><ChevronIcon dir="left" /></button>}
      <nav ref={ref} className="wl-cl-jump" aria-label="Releases">{children}</nav>
      {more.right && <button type="button" className="wl-cl-arrow wl-cl-arrow-right" tabIndex={-1} aria-hidden onClick={() => step(1)}><ChevronIcon dir="right" /></button>}
    </div>
  );
}
