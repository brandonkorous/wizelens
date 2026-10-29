import { DEVICES, type Device, type DeviceCell, type DeviceRow, type DeviceTable as Devices } from "@wizeworks/lens-core";
import { fmtCount, fmtMs } from "../../format";
import { navigate, routeHref } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

/** "1.0 s · 2 views", or a dash where that device never opened the page. */
function Cell({ c }: { c: DeviceCell | null }) {
  if (!c) return <span className="wl-muted">–</span>;
  return (
    <span className="wl-dev-cell">
      {fmtMs(c.avgMs)} <small className="wl-muted">{fmtCount(c.views)} {c.views === 1 ? "view" : "views"}</small>
    </span>
  );
}

const deviceColumn = (dev: Device): Column<DeviceRow> => ({
  key: dev,
  header: <span title="Average render time, and how many views">{dev}</span>,
  label: dev,
  num: true,
  cell: (r) => <Cell c={r.cells[dev]} />,
  sort: (r) => r.cells[dev]?.avgMs ?? -1,
});

/** The site of every route ("localhost:4173"), when they all share one; then rows show only the path. */
function oneSite(routes: DeviceRow[]): string | null {
  const sites = new Set(routes.map((r) => r.route.slice(0, Math.max(0, r.route.indexOf("/")))));
  return sites.size === 1 ? [...sites][0] || null : null;
}

const columns = (site: string | null): Column<DeviceRow>[] => [
  { key: "route", header: "Page", cell: (r) => <span className="wl-mono wl-break">{site ? r.route.slice(site.length) : r.route}</span>, sort: (r) => r.route },
  ...DEVICES.map(deviceColumn),
];

/** Each page's render time on phones, tablets, and desktops, the slowest on a phone first. */
export function DeviceTable({ devices, total }: { devices: Devices; total: number }) {
  const all = devices.all.cells;
  const site = oneSite(devices.routes);
  // Views from before the device was recorded (or with no screen size) are not in any column; say how many.
  const unknown = total - DEVICES.reduce((t, dev) => t + (all[dev]?.views ?? 0), 0);
  return (
    <Panel flush title="By device">
      <p className="wl-panel-note">
        {site ? `All pages on ${site}: ` : "All pages: "}
        {DEVICES.map((dev, i) => (
          <span key={dev}>
            {i > 0 && " · "}
            {dev} {all[dev] ? `${fmtMs(all[dev].avgMs)} (${fmtCount(all[dev].views)})` : "–"}
          </span>
        ))}
        {unknown > 0 && <span> · {fmtCount(unknown)} {unknown === 1 ? "view" : "views"} with no known device, not in the table</span>}
      </p>
      <Table columns={columns(site)} rows={devices.routes} rowKey={(r) => r.route} defaultSort={{ key: "Phone", desc: true }} onRowClick={(r) => navigate(routeHref(r.route))} empty={<Empty title="No page views with a known device in this range" />} />
    </Panel>
  );
}
