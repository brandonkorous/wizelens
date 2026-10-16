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

async function runAction(path: string): Promise<Result> {
  const start = performance.now();
  try {
    const res = await fetch(path);
    const text = await res.text();
    let body = text;
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Not JSON: show it as is.
    }
    return { path, status: res.status, ms: performance.now() - start, body };
  } catch (err) {
    return { path, status: null, ms: performance.now() - start, body: String(err) };
  }
}

function ResultView({ result }: { result: Result }) {
  return (
    <section className="result">
      <div className="result-head">
        <code>GET {result.path}</code>
        <span className={result.status && result.status < 400 ? "ok" : "bad"}>{result.status ?? "network error"}</span>
        <span>{Math.round(result.ms)} ms</span>
      </div>
      <pre>{result.body.length > 6000 ? `${result.body.slice(0, 6000)}\n…` : result.body}</pre>
    </section>
  );
}

export function Home() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const run = async (action: Action) => {
    setBusy(action.path);
    setResult(await runAction(action.path));
    setBusy(null);
  };
  return (
    <>
      <div className="actions">
        {ACTIONS.map((a) => (
          <button key={a.path} type="button" onClick={() => run(a)} disabled={busy !== null}>
            <strong>{busy === a.path ? "Working…" : a.label}</strong>
            <span>{a.hint}</span>
          </button>
        ))}
      </div>
      {result && <ResultView result={result} />}
    </>
  );
}
