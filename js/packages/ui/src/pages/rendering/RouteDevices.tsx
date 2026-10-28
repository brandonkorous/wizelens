import { Monitor, Smartphone, Tablet } from "lucide-react";
import { READY_GOOD_MS, READY_POOR_MS, type RouteDevice } from "@wizeworks/lens-core";
import { fmtCount, fmtMs } from "../../format";
import { Badge, type Tone } from "../../ui/Badges";
import { Panel } from "../../ui/Panel";

const ICON = { Phone: Smartphone, Tablet, Desktop: Monitor };

/** Fast, slow, or very slow by Google's lines for the main content. */
function speedOf(ms: number): [Tone, string] {
  if (ms <= READY_GOOD_MS) return ["success", "Fast"];
  return ms <= READY_POOR_MS ? ["warning", "Slow"] : ["danger", "Very slow"];
}

/** One sentence on where the wait went, in words to repeat to a client. */
export function causeText(d: RouteDevice): string | null {
  const { ttfbMs: host, fcpMs: text, readyMs: ready } = d;
  if (d.cause === null || host === null || text === null || ready === null) return null;
  if (ready <= READY_GOOD_MS) return "Nothing here needs a fix.";
  if (d.cause === "host") return `Most of the wait is the server or file host: it took ${fmtMs(host)} to start sending the page.`;
  if (d.cause === "code") return `Most of the wait is before any text shows: ${fmtMs(text - host)} to download and run the page's code and styles.`;
  const first = `The text shows at ${fmtMs(text)}, but the main content shows only at ${fmtMs(ready)}.`;
  if (d.cause === "content") return first;
  const big = d.largeImages ? ` ${fmtCount(d.largeImages)} ${d.largeImages === 1 ? "picture is" : "pictures are"} bigger than the screen needs.` : "";
  return `${first} Its pictures hold it up: the slowest took ${fmtMs(d.imageMs)} to download.${big}`;
}

function DeviceCard({ d }: { d: RouteDevice }) {
  const Icon = ICON[d.device];
  const speed = d.readyMs === null ? null : speedOf(d.readyMs);
  const cause = causeText(d);
  return (
    <article className="wl-rdev">
      <h3>
        <Icon size={18} aria-hidden="true" /> {d.device} <small className="wl-muted">{fmtCount(d.views)} {d.views === 1 ? "view" : "views"}</small>
      </h3>
      {speed && <p><Badge tone={speed[0]}>{speed[1]}</Badge> ready in <strong>{fmtMs(d.readyMs)}</strong></p>}
      <dl className="wl-rdev-steps">
        <dt>Host answered</dt><dd>{fmtMs(d.ttfbMs)}</dd>
        <dt>Text showed</dt><dd>{fmtMs(d.fcpMs)}</dd>
        <dt>Main content showed</dt><dd>{fmtMs(d.readyMs)}</dd>
      </dl>
      {cause && <p className="wl-rdev-cause">{cause}</p>}
    </article>
  );
}

/** The route on each device: how fast, and where the time went. */
export function RouteDevices({ devices }: { devices: RouteDevice[] }) {
  if (!devices.length) return null;
  return (
    <Panel title="On each device">
      <p className="wl-rdev-note">Averages of full page loads. Google calls a page fast when its main content shows within 2.5 s, and slow after 4 s.</p>
      <div className="wl-rdev-grid">
        {devices.map((d) => <DeviceCard key={d.device} d={d} />)}
      </div>
    </Panel>
  );
}
