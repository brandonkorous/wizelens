"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { MenuIcon } from "@/components/ui/icons";
import { DOC_GROUPS, docHref } from "@/lib/docs/nav";
import { DocsSearch } from "./DocsSearch";

// The docs menu: groups of pages, a sliding marker on the current one, and search at the top.
export function DocsSidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  return (
    <aside className={`wl-docs-side${open ? " wl-docs-side-open" : ""}`}>
      <div className="wl-docs-side-top">
        <DocsSearch />
        <button type="button" className="wl-docs-menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <MenuIcon open={open} /> Menu
        </button>
      </div>
      <nav className="wl-docs-groups" aria-label="Docs">
        {DOC_GROUPS.map((g) => (
          <div key={g.title} className="wl-docs-group">
            <h2>{g.title}</h2>
            <ul>
              {g.items.map((d) => {
                const href = docHref(d.slug);
                const on = path === href || path === href.slice(0, -1);
                return (
                  <li key={d.slug}>
                    <a href={href} className={on ? "wl-on" : undefined} aria-current={on ? "page" : undefined}>
                      {on && <motion.span layoutId="wl-docs-marker" className="wl-docs-marker" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      <span>{d.title}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
