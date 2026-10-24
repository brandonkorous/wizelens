// Browser services: spans keep service "browser"; a named app ("piggles-web") shows as "piggles-web (browser)", else "Web App".
import { ATTR_BROWSER_APP } from "./attributes.js";
import type { Span } from "./types.js";

/** How the dashboard names a browser app that sets no name. */
export const WEB_APP = "Web App";

const BROWSER_SUFFIX = " (browser)";

/** The display name of a browser app: its name with " (browser)", or "Web App" when it has none. */
export const webAppName = (app: string | null | undefined): string => (!app ? WEB_APP : app.endsWith(BROWSER_SUFFIX) ? app : `${app}${BROWSER_SUFFIX}`);

/** True for a display name of a browser app. */
export const isWebAppName = (name: string): boolean => name === WEB_APP || name.endsWith(BROWSER_SUFFIX);

/** The browser app a span or log line names, or null. */
export const browserAppOf = (s: Pick<Span, "attributes"> | undefined): string | null => {
  const v = s?.attributes[ATTR_BROWSER_APP];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** The Services row key of a browser app; an unnamed app keeps the old "web:browser". */
export const webRowKey = (app: string | null): string => `web:${app ?? "browser"}`;

/** A service name as the dashboard shows it, for names that carry no app: "browser" is "Web App". */
export const displayService = (service: string): string => (service === "browser" ? WEB_APP : service);

/** The service name as spans carry it, from its display name: every browser app is "browser". */
export const rawService = (service: string): string => (isWebAppName(service) ? "browser" : service);

/** A span's service as the dashboard shows it: a browser span by its app. */
export const spanServiceName = (s: Span): string => (s.service === "browser" ? webAppName(browserAppOf(s)) : s.service);

/** A request's service names as shown: "browser" by the request's app. */
export const shownServices = (services: readonly string[], app: string | null): string[] => services.map((s) => (s === "browser" ? webAppName(app) : s));
