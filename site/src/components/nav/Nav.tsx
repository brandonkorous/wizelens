"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { GitHubIcon, MenuIcon } from "@/components/ui/icons";
import { LINKS } from "@/lib/links";
import { NavMenu, type MenuItem } from "./NavMenu";

const PLATFORMS: MenuItem[] = [
  { href: "/dotnet/", label: ".NET", note: "ASP.NET Core, EF Core, and every Meter" },
  { href: "/node/", label: "Node", note: "Express, Fastify, Koa, Hono, and more" },
  { href: "/react/", label: "React and Next.js", note: "From the click to the database" },
];

const BEFORE = [{ href: "/#journey", label: "How it works" }];

const AFTER = [
  { href: "/#ai", label: "AI access" },
  { href: LINKS.docs, label: "Docs" },
];

// Top bar: hides while you read down the page, comes back when you scroll up.
export function Nav() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [raised, setRaised] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setRaised(y > 8);
    setHidden(y > 400 && y > prev && !open);
  });

  return (
    <motion.header
      className={`wl-nav${raised ? " wl-nav-raised" : ""}${open ? " wl-nav-open" : ""}`}
      animate={{ y: hidden ? "-110%" : "0%" }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="wl-wrap wl-nav-row">
        <a href="/" className="wl-nav-brand" aria-label="WizeLens home">
          <Logo live />
          <span className="wl-pill">Alpha</span>
        </a>
        <nav className="wl-nav-links" aria-label="Main">
          {BEFORE.map((item) => <a key={item.label} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
          <NavMenu label="Platforms" items={PLATFORMS} onPick={() => setOpen(false)} />
          {AFTER.map((item) => <a key={item.label} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
        </nav>
        <div className="wl-nav-actions">
          <a href={LINKS.repo} className="wl-nav-gh" aria-label="WizeLens on GitHub"><GitHubIcon /></a>
          <a href={LINKS.start} className="wl-btn wl-btn-primary wl-btn-sm">Get started</a>
          <button type="button" className="wl-nav-toggle" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
            <MenuIcon open={open} />
          </button>
        </div>
      </div>
    </motion.header>
  );
}
