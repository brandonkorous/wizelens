import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface More {
  left: boolean;
  right: boolean;
}

/** A row that may scroll sideways: which edges hide more, a step to move by most of a screen, and the active item starts in view. */
export function useScrollRow<T extends HTMLElement>(active: string) {
  const ref = useRef<T>(null);
  const touched = useRef(false);
  const [more, setMore] = useState<More>({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    touched.current = false;
    const mark = () => {
      const next = { left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 };
      setMore((m) => (m.left === next.left && m.right === next.right ? m : next));
    };
    // Items change width as counts and fonts load, so the active one is centered again until the person scrolls.
    const center = () => {
      const on = el.querySelector<HTMLElement>(".wl-active");
      if (on && !touched.current && el.scrollWidth > el.clientWidth) el.scrollLeft = on.offsetLeft - el.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
      mark();
    };
    const touch = () => (touched.current = true);
    center();
    el.addEventListener("scroll", mark, { passive: true });
    el.addEventListener("pointerdown", touch);
    el.addEventListener("wheel", touch, { passive: true });
    const seen = new ResizeObserver(center);
    for (const node of [el, ...el.children]) seen.observe(node);
    return () => (el.removeEventListener("scroll", mark), el.removeEventListener("pointerdown", touch), el.removeEventListener("wheel", touch), seen.disconnect());
  }, [active]);
  const step = useCallback((dir: -1 | 1) => ((touched.current = true), ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" })), []);
  return { ref, more, step };
}

/** Wraps a row from `useScrollRow` with a button at each edge that hides more. The keyboard moves along the row itself, so the buttons are for pointers and thumbs. */
export function ScrollRow({ row, className = "", children }: { row: { more: More; step: (dir: -1 | 1) => void }; className?: string; children: ReactNode }) {
  return (
    <div className={`wl-scroll-row ${className}`.trim()}>
      {row.more.left && (
        <button type="button" className="wl-scroll-btn wl-scroll-left" tabIndex={-1} aria-hidden="true" onClick={() => row.step(-1)}>
          <ChevronLeft />
        </button>
      )}
      {children}
      {row.more.right && (
        <button type="button" className="wl-scroll-btn wl-scroll-right" tabIndex={-1} aria-hidden="true" onClick={() => row.step(1)}>
          <ChevronRight />
        </button>
      )}
    </div>
  );
}
