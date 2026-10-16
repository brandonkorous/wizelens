import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

// A context value that changes twice a second. WizeLens flags the components that re-render because of it.
const TickerContext = createContext(0);

export function TickerProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <TickerContext.Provider value={tick}>{children}</TickerContext.Provider>;
}

export const useTicker = () => useContext(TickerContext);

/** Shows "live" stock. It reads the ticker, so it re-renders on every tick. */
export function LiveBadge() {
  const tick = useTicker();
  return <span className="live">{tick % 2 === 0 ? "● In stock" : "○ In stock"}</span>;
}
