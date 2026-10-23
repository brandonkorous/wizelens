import { useEffect } from "react";

/** Asks before the tab closes while `on`, for example while new secrets are not saved yet. */
export function useLeaveGuard(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    const stop = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [on]);
}
