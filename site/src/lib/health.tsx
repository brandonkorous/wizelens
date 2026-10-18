"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Health = "info" | "success" | "opportunity" | "warning" | "critical" | "neutral";

// Brand color meaning: the center dot of the mark shows system health.
export const HEALTH_COLOR: Record<Health, string> = {
  info: "var(--wl-blue)",
  success: "var(--wl-green)",
  opportunity: "var(--wl-amber)",
  warning: "var(--wl-orange)",
  critical: "var(--wl-red)",
  neutral: "var(--wl-slate)",
};

export const HEALTH_LABEL: Record<Health, string> = {
  info: "Information",
  success: "Healthy",
  opportunity: "Opportunity",
  warning: "Warning",
  critical: "Critical",
  neutral: "Neutral",
};

type HealthState = { health: Health; setHealth: (h: Health) => void };

const HealthContext = createContext<HealthState>({ health: "info", setHealth: () => {} });

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health>("info");
  return <HealthContext.Provider value={{ health, setHealth }}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthState {
  return useContext(HealthContext);
}
