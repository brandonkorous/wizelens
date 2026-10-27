import { useCallback, useRef, useState } from "react";

/** Runs one save at a time: a second click while the first is on its way does nothing. `busy` disables the button. */
export function useOnce(): { busy: boolean; once: (fn: () => Promise<unknown>) => void } {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const once = useCallback((fn: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    void fn().finally(() => {
      running.current = false;
      setBusy(false);
    });
  }, []);
  return { busy, once };
}
