/** A time as an email shows it, in the reader's time zone: "Oct 27, 2026, 10:59 PM PDT". An unknown zone shows UTC. */
export function clockIn(ms: number, timeZone = "UTC"): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(ms));
  try {
    return fmt(timeZone);
  } catch {
    return fmt("UTC");
  }
}
