import { useEffect, useRef } from "react";

/** A row that scrolls sideways: `data-more` names the edges that hide more (CSS fades them), and the active item starts in view. */
export function useScrollHint<T extends HTMLElement>(active: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      const more = [el.scrollLeft > 2 && "left", el.scrollLeft + el.clientWidth < el.scrollWidth - 2 && "right"].filter(Boolean).join(" ");
      if (more) el.dataset.more = more;
      else delete el.dataset.more;
    };
    const on = el.querySelector<HTMLElement>(".wl-active");
    if (on && el.scrollWidth > el.clientWidth) el.scrollLeft = on.offsetLeft - el.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
    mark();
    el.addEventListener("scroll", mark, { passive: true });
    const seen = new ResizeObserver(mark);
    seen.observe(el);
    return () => (el.removeEventListener("scroll", mark), seen.disconnect());
  }, [active]);
  return ref;
}
