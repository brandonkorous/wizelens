import { useState } from "react";

interface Action {
  label: string;
  path: string;
  hint: string;
}

const ACTIONS: Action[] = [
  { label: "Load customers + orders", path: "/api/customers-with-orders", hint: "EF Core + an N+1 of HTTP calls to orders-api" },
  { label: "Raw SQL", path: "/api/raw-sql", hint: "ADO.NET / Dapper through the driver-level floor" },
  { label: "Throw error", path: "/api/boom", hint: "An exception, captured ELMAH-style" },
];

type Result = { path: string; status: number | null; ms: number; body: string };

export function App() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(action: Action) {
    setBusy(action.path);
    const start = performance.now();
    try {
      const res = await fetch(action.path);
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON: show as is
      }
      setResult({ path: action.path, status: res.status, ms: performance.now() - start, body });
    } catch (err) {
      setResult({ path: action.path, status: null, ms: performance.now() - start, body: String(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <header>
        <h1>WizeLens sample shop</h1>
        <p>
          Click a button. Then open the HUD in the bottom-right corner, or the <a href="/_wizelens/" target="_blank" rel="noreferrer">dashboard ↗</a>.
        </p>
      </header>

      <div className="actions">
        {ACTIONS.map((a) => (
          <button key={a.path} type="button" onClick={() => run(a)} disabled={busy !== null}>
            <strong>{busy === a.path ? "Working…" : a.label}</strong>
            <span>{a.hint}</span>
          </button>
        ))}
      </div>

      {result && (
        <section className="result">
          <div className="result-head">
            <code>GET {result.path}</code>
            <span className={result.status && result.status < 400 ? "ok" : "bad"}>{result.status ?? "network error"}</span>
            <span>{Math.round(result.ms)} ms</span>
          </div>
          <pre>{result.body.length > 6000 ? `${result.body.slice(0, 6000)}\n…` : result.body}</pre>
        </section>
      )}

      <footer>
        Flow: <code>web :5173</code> → <code>gateway-api :5100</code> (.NET, EF Core) → <code>orders-api :5200</code> (Node, SQLite)
      </footer>
    </main>
  );
}
