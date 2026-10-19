import { BellPlus } from "lucide-react";
import { useHost } from "../data/host";
import { newAlertHref } from "../routes";

/** Opens a new alert rule filled from what is on screen. Hidden on hosts without alerts. */
export function AlertOnThis({ fields, label = "Alert on this" }: { fields: Record<string, string>; label?: string }) {
  if (!useHost().has("alerts")) return null;
  return (
    <a className="wl-btn wl-btn-sm" href={newAlertHref(fields)}>
      <BellPlus aria-hidden="true" /> {label}
    </a>
  );
}
