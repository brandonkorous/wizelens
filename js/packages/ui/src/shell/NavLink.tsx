import type { PageId } from "../routes";
import { hrefTo } from "../routes";
import type { NavItem } from "./nav";

export type NavCounts = Partial<Record<PageId, number>>;

export const countText = (n: number): string => (n > 99 ? "99+" : String(n));

/** One menu link: icon, label, and a small red count when there is one. */
export function NavLink({ item, current, count }: { item: NavItem; current: PageId; count?: number }) {
  const { page, label, icon: Icon } = item;
  const here = current === page;
  return (
    <a href={hrefTo(page)} className={here ? "wl-active" : undefined} aria-current={here ? "page" : undefined} title={label}>
      <Icon aria-hidden={true} />
      <span>{label}</span>
      {!!count && <em className="wl-nav-count">{countText(count)}</em>}
    </a>
  );
}
