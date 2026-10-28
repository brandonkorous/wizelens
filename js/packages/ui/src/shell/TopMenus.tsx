import { ChevronDown, ExternalLink, Monitor, Moon, Sun } from "lucide-react";
import type { Source } from "../data/sources";
import { fmtKept, MODE_LABEL, useHost } from "../data/host";
import { type Theme, useTheme } from "../data/prefs";
import { Menu } from "./Menu";

function envTone(sources: Source[]): "" | " wl-down" | " wl-partial" {
  const self = sources.find((s) => s.self);
  if (self?.status === "down") return " wl-down";
  return sources.some((s) => s.status === "down") ? " wl-partial" : "";
}

/** Environment chip. Opens the list of connected services. */
export function EnvMenu({ sources }: { sources: Source[] }) {
  const env = sources.find((s) => s.self)?.info?.environment ?? "Local";
  const label = (
    <>
      <span className={`wl-env-dot${envTone(sources)}`} />
      <span className="wl-label">{env}</span>
      <ChevronDown aria-hidden="true" />
    </>
  );
  return (
    <Menu label={label} title={`Environment ${env}: connected services`} buttonClass="wl-top-btn wl-top-shrink">
      {() => (
        <>
          <div className="wl-menu-head">Connected services</div>
          {sources.map((s) => (
            <a key={s.endpoint} className="wl-menu-item" href={`${s.endpoint}/`} target={s.self ? undefined : "_blank"} rel="noreferrer">
              <span className={`wl-env-dot${s.status === "down" ? " wl-down" : s.status === "pending" ? " wl-partial" : ""}`} />
              <span className="wl-truncate">
                <strong>{s.info?.service ?? s.endpoint}</strong>
                <span className="wl-muted wl-small"> · {s.status === "down" ? (s.error ?? "unreachable") : (s.info?.runtime ?? "…")}</span>
              </span>
              {!s.self && <ExternalLink size={14} aria-hidden="true" />}
            </a>
          ))}
          <div className="wl-menu-note">Services join this list when a request calls them.</div>
        </>
      )}
    </Menu>
  );
}

/** Where this dashboard runs, and how long its host keeps data. */
export function ModeBadge() {
  const host = useHost();
  // The cloud's service name is "WizeLens Cloud": saying "Cloud" twice adds nothing.
  const name = host.service && !host.service.endsWith(MODE_LABEL[host.mode]) ? ` · ${host.service}` : "";
  const text = `${MODE_LABEL[host.mode]}${name} · kept ${fmtKept(host.keptMs)}`;
  return (
    <span className="wl-mode-badge" title={`WizeLens runs ${host.mode === "in-app" ? "inside this service" : `as a ${MODE_LABEL[host.mode].toLowerCase()}`}. Data older than ${fmtKept(host.keptMs)} is dropped.`}>
      {text}
    </span>
  );
}

const NEXT: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

/** `className` "wl-hide-phone" when the account menu carries the theme on phones (see ThemeItem). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const Icon = THEME_ICON[theme];
  return (
    <button type="button" className={`wl-icon-btn ${className}`.trim()} onClick={() => setTheme(NEXT[theme])} title={`Theme: ${theme}. Click for ${NEXT[theme]}.`} aria-label={`Theme: ${theme}`}>
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

/** The theme in the account menu, on phones only: the top bar has no room for its own button there. */
export function ThemeItem() {
  const [theme, setTheme] = useTheme();
  const Icon = THEME_ICON[theme];
  return (
    <button type="button" className="wl-menu-item wl-phone-only" onClick={() => setTheme(NEXT[theme])}>
      <Icon size={16} aria-hidden="true" /> Theme: {theme} (tap for {NEXT[theme]})
    </button>
  );
}
