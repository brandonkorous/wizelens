import { Bookmark, Search, Users } from "lucide-react";
import { useSavedItems } from "../data/saved";
import { savedHref } from "../data/saved";

/** Saved views and searches under the main menu: the person's own and the shared ones. The open one is marked. */
export function SavedNav() {
  const { items } = useSavedItems();
  const links = items.filter((i) => i.kind !== "dashboard");
  if (links.length === 0) return null;
  const here = location.hash;
  return (
    <nav className="wl-nav wl-nav-saved" aria-label="Saved">
      <div className="wl-nav-head">Saved</div>
      {links.map((i) => {
        const Icon = i.kind === "search" ? Search : i.shared ? Users : Bookmark;
        return (
          <a key={i.id} href={savedHref(i)} className={here === i.href ? "wl-active" : undefined} title={`${i.name}${i.ownerName ? ` (saved by ${i.ownerName})` : ""}`}>
            <Icon aria-hidden={true} />
            <span className="wl-truncate">{i.name}</span>
          </a>
        );
      })}
    </nav>
  );
}
