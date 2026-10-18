"use client";

import { Aperture } from "./Aperture";
import { HEALTH_COLOR, useHealth } from "@/lib/health";

// The horizontal lockup. The center dot follows the health of the request shown in the hero.
export function Logo({ live = false }: { live?: boolean }) {
  const { health } = useHealth();
  return (
    <span className="wl-logo">
      <Aperture className="wl-logo-mark" dot={live ? HEALTH_COLOR[health] : undefined} />
      <span className="wl-logo-word">
        Wize<span className="wl-blue">Lens</span>
      </span>
    </span>
  );
}
