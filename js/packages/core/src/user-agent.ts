// Browser and system names from user agents, for sign-in sessions, error occurrences, and the errors-by-browser facts.
const BROWSERS: [RegExp, string][] = [[/Edg\//, "Edge"], [/OPR\//, "Opera"], [/Firefox\//, "Firefox"], [/Chrome\//, "Chrome"], [/Safari\//, "Safari"]];
const SYSTEMS: [RegExp, string][] = [[/iPhone|iPad/, "iOS"], [/Android/, "Android"], [/Windows/, "Windows"], [/Mac OS X|Macintosh/, "macOS"], [/CrOS/, "ChromeOS"], [/Linux/, "Linux"]];

export type Device = "Phone" | "Tablet" | "Desktop";

/** Phone, tablet, or desktop from a user agent. An iPad that asks for desktop sites says it is a Mac, so it counts as a desktop. */
export function deviceOf(ua: string | null | undefined): Device | null {
  if (!ua) return null;
  if (/iPad|Tablet|Android(?!.*Mobile)/.test(ua)) return "Tablet";
  return /Mobi|iPhone|Android/.test(ua) ? "Phone" : "Desktop";
}

/** "Chrome on Windows" from a user agent; the start of it when it is not a known browser. */
export function shortAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = BROWSERS.find(([r]) => r.test(ua))?.[1];
  const system = SYSTEMS.find(([r]) => r.test(ua))?.[1];
  if (browser) return system ? `${browser} on ${system}` : browser;
  return ua.length > 40 ? `${ua.slice(0, 40)}…` : ua;
}
