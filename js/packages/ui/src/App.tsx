import { useEffect, useState } from "react";
import type { ServiceInfo } from "@wizeworks/lens-core";
import { api } from "./api";
import { TraceDetail } from "./components/TraceDetail";
import { TraceList } from "./components/TraceList";

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#/, "") || "/";
}

export function App() {
  const route = useHashRoute();
  const [info, setInfo] = useState<ServiceInfo | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api
      .info()
      .then((i) => {
        setInfo(i);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    document.title = info ? `WizeLens · ${info.service}` : "WizeLens";
  }, [info]);

  const traceMatch = /^\/traces\/([0-9a-f]{32})/.exec(route);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <rect x="7" y="9" width="12" height="3" rx="1.5" fill="#fff" />
            <rect x="11" y="14.5" width="14" height="3" rx="1.5" fill="#fff" opacity=".85" />
            <rect x="9" y="20" width="8" height="3" rx="1.5" fill="#fff" opacity=".7" />
          </svg>
          <span>WizeLens</span>
        </a>
        <div className="topbar-meta">
          {info && (
            <>
              <span className="chip chip-strong">{info.service}</span>
              <span className="muted">{info.runtime}</span>
              {info.mcp && (
                <span className="chip chip-ai" title="AI agents can read these traces through MCP (read-only)">
                  MCP on
                </span>
              )}
              <span className="muted">v{info.version}</span>
            </>
          )}
          {offline && <span className="chip chip-error">API unreachable</span>}
        </div>
      </header>
      <main className="content">{traceMatch ? <TraceDetail traceId={traceMatch[1]!} /> : <TraceList />}</main>
    </div>
  );
}
