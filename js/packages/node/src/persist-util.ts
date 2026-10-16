export function parseArray<T>(json: string): T[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** Run `flush` on exit and on SIGINT/SIGTERM; re-raise the signal when no one else listens. */
export function hookProcessExit(flush: () => void): () => void {
  const onExit = () => flush();
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const onSignal = (signal: NodeJS.Signals) => {
    flush();
    if (process.listenerCount(signal) === 1) {
      process.removeListener(signal, onSignal);
      process.kill(process.pid, signal);
    }
  };
  process.on("exit", onExit);
  for (const s of signals) process.on(s, onSignal);
  return () => {
    process.removeListener("exit", onExit);
    for (const s of signals) process.removeListener(s, onSignal);
  };
}
