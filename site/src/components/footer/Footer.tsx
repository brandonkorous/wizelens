import { Logo } from "@/components/brand/Logo";
import { LINKS } from "@/lib/links";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#journey" },
      { label: "Insights", href: "/#insights" },
      { label: "AI access", href: "/#ai" },
      { label: "Install", href: "/#install" },
      { label: "Cloud", href: "/cloud/" },
      { label: "Pricing", href: "/pricing/" },
    ],
  },
  {
    title: "Platforms",
    links: [
      { label: ".NET", href: "/dotnet/" },
      { label: "Node", href: "/node/" },
      { label: "React and Next.js", href: "/react/" },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Quick start", href: LINKS.start },
      { label: "Configuration", href: "/docs/configuration/" },
      { label: "Wire contract", href: LINKS.contract },
      { label: "Changelog", href: LINKS.changelog },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Glimpse, rebuilt", href: "/story/" },
      { label: "GitHub", href: LINKS.repo },
      { label: "MIT license", href: LINKS.license },
    ],
  },
];

export function Footer() {
  return (
    <footer className="wl-footer wl-night">
      <div className="wl-wrap wl-footer-grid">
        <div className="wl-footer-brand">
          <Logo />
          <p>Deep insights for modern applications.</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3>{c.title}</h3>
            <ul>
              {c.links.map((l) => <li key={l.label}><a href={l.href}>{l.label}</a></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="wl-wrap wl-footer-base">
        <span>© 2026 WizeWorks LLC. Made by <b>WizeWorks</b> in Visalia, California.</span>
        <nav className="wl-footer-legal" aria-label="Legal">
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <a href="/security/">Security</a>
          <a href="/license/">License</a>
        </nav>
      </div>
    </footer>
  );
}
