import { type RefObject, useEffect } from "react";

/** "Recent logs: table, scrolls sideways": the nearest panel or section heading first, so two boxes never share a name. */
function nameOf(el: HTMLElement, label: string): string {
  const head = el.closest("section, .wl-panel, .wl-card")?.querySelector("h1, h2, h3")?.textContent?.trim();
  return head ? `${head}: ${label}` : label;
}

/** While the box scrolls sideways or down, it takes a Tab stop and a name, so arrow keys can scroll it. */
export function useScrollFocus(ref: RefObject<HTMLElement | null>, label: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const scrolls = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      if (scrolls) {
        el.tabIndex = 0;
        el.setAttribute("role", "region");
        el.setAttribute("aria-label", nameOf(el, label));
      } else {
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
      }
    };
    check();
    const seen = new ResizeObserver(check);
    seen.observe(el);
    if (el.firstElementChild) seen.observe(el.firstElementChild);
    return () => seen.disconnect();
  }, [ref, label]);
}
