import { type RefObject, useEffect, useRef, useState } from "react";
import { Menu as MenuIcon, X } from "lucide-react";
import type { PageId } from "../routes";
import { MOBILE_TABS, type NavItem } from "./nav";
import { NavGroups } from "./NavGroups";
import { type NavCounts, NavLink } from "./NavLink";
import { SavedNav } from "./SavedNav";

export interface MobileNavProps {
  items: NavItem[];
  current: PageId;
  counts: NavCounts;
  saved: boolean;
}

/** Closes the drawer on Escape and on any page change, and stops the page behind it from scrolling. */
function useDrawer(open: boolean, close: () => void, panel: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", close);
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", close);
      document.body.style.overflow = "";
    };
  }, [open, close, panel]);
}

/** The phone tab bar: the most used pages, plus "More" that opens a drawer with the rest. */
export function MobileNav({ items, current, counts, saved }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(() => setOpen(false)).current;
  useDrawer(open, close, panel);
  const tabs = MOBILE_TABS.map((p) => items.find((n) => n.page === p)).filter((n): n is NavItem => !!n);
  const rest = items.filter((n) => !MOBILE_TABS.includes(n.page));
  const moreHere = rest.some((n) => n.page === current);
  return (
    <>
      <nav className="wl-phonebar" aria-label="Main">
        {tabs.map((n) => (
          <NavLink key={n.page} item={n} current={current} count={counts[n.page]} />
        ))}
        <button type="button" className={moreHere || open ? "wl-active" : undefined} aria-expanded={open} aria-controls="wl-more" onClick={() => setOpen(!open)}>
          <MenuIcon aria-hidden={true} />
          <span>More</span>
        </button>
      </nav>
      {open && (
        <div className="wl-drawer-backdrop" onClick={close}>
          <div id="wl-more" ref={panel} className="wl-drawer" role="dialog" aria-modal="true" aria-label="More pages" onClick={(e) => e.stopPropagation()}>
            <div className="wl-drawer-head">
              <strong>More</strong>
              <button type="button" className="wl-icon-btn" aria-label="Close" onClick={close}>
                <X aria-hidden={true} />
              </button>
            </div>
            <nav className="wl-nav wl-drawer-nav" aria-label="More">
              <NavGroups items={rest} current={current} counts={counts} fixed />
            </nav>
            {saved && <SavedNav />}
          </div>
        </div>
      )}
    </>
  );
}
