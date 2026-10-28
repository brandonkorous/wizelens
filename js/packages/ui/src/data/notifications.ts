import { useEffect } from "react";
import { apiFetch, apiSend } from "./api";

export type DigestPeriod = "daily" | "weekly" | "monthly";

export interface DigestRow {
  projectId: string;
  project: string;
  orgId: string;
  org: string;
  role: string;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
}

/** `GET api/me/notifications` on a cloud host. Security notices are always on, so they are not in it. */
export interface Notifications {
  mail: boolean;
  team: boolean;
  health: boolean;
  digests: boolean;
  timeZone: string;
  /** False until the person picks a zone or this app sends the browser's. */
  zoneSet: boolean;
  digestHour: number;
  projects: DigestRow[];
}

export type NotificationsPatch = Partial<Pick<Notifications, "team" | "health" | "digests" | "timeZone" | "digestHour">> & {
  projects?: ({ projectId: string } & Partial<Record<DigestPeriod, boolean>>)[];
};

export const loadNotifications = () => apiFetch<Notifications>("./api/me/notifications");
export const saveNotifications = (patch: NotificationsPatch) => apiSend<Notifications>("PATCH", "./api/me/notifications", patch);

/** This browser's time zone, for example "America/Los_Angeles". */
export const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Every time zone this browser knows, with the given one first when it is missing. */
export function zones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return all.includes(current) ? all : [current, ...all];
}

/** On a cloud host, send this browser's zone once, so alert emails show her own clock until she picks a zone. */
export function useZoneOnce(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    void loadNotifications()
      .then((n) => (n.zoneSet ? null : saveNotifications({ timeZone: browserZone() })))
      .catch(() => {});
  }, [on]);
}
