import { ChevronDown } from "lucide-react";
import { usePref } from "../data/prefs";
import type { PageId } from "../routes";
import { NAV_GROUPS, type NavGroupId, type NavItem } from "./nav";
import { type NavCounts, NavLink } from "./NavLink";

const CLOSED_KEY = "wizelens.ui.navClosed";
const isGroupList = (v: string): v is string => /^[a-z,]*$/.test(v);

/** Which menu sections the person folded up, kept across visits. */
function useClosedGroups(): [Set<string>, (id: NavGroupId) => void] {
  const [raw, setRaw] = usePref<string>(CLOSED_KEY, "", isGroupList);
  const closed = new Set(raw.split(",").filter(Boolean));
  const toggle = (id: NavGroupId) => {
    if (closed.has(id)) closed.delete(id);
    else closed.add(id);
    setRaw([...closed].join(","));
  };
  return [closed, toggle];
}

export interface NavGroupsProps {
  items: NavItem[];
  current: PageId;
  counts: NavCounts;
  /** Turn off folding, for the phone drawer. */
  fixed?: boolean;
}

/** The main menu in sections with headings. A folded section still shows the open page. */
export function NavGroups({ items, current, counts, fixed = false }: NavGroupsProps) {
  const [closed, toggle] = useClosedGroups();
  return (
    <>
      {NAV_GROUPS.map(({ id, label }) => {
        const all = items.filter((n) => n.group === id);
        if (all.length === 0) return null;
        const open = fixed || !closed.has(id);
        // Folded links stay in the page: the narrow icon menu has no headings, so it shows them all.
        return (
          <div key={id} className={`wl-nav-group${open ? "" : " wl-closed"}`} role="group" aria-label={label || "Start"}>
            {label && fixed && <div className="wl-nav-head">{label}</div>}
            {label && !fixed && (
              <button type="button" className="wl-nav-head wl-nav-fold" aria-expanded={open} onClick={() => toggle(id)}>
                <span>{label}</span>
                <ChevronDown aria-hidden={true} />
              </button>
            )}
            {all.map((n) => (
              <NavLink key={n.page} item={n} current={current} count={counts[n.page]} />
            ))}
          </div>
        );
      })}
    </>
  );
}
