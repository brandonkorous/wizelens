"use client";

import { Tile } from "./Tile";
import { TILES } from "./cells";

export function Bento() {
  return (
    <section className="wl-section" id="inside">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Everything a request touched.</h2>
          <p className="wl-lede">
            One dashboard for all of it. Requests, traces, errors, logs, database, rendering, metrics, services, hosts,
            Kubernetes, insights, security, users, problems, uptime, SLOs, and alerts, for one service or all of them.
          </p>
        </div>
        <div className="wl-bento">
          {TILES.map(({ area, title, body, night, Art }) => (
            <Tile key={area} area={area} title={title} body={body} night={night}>
              {(seen) => <Art seen={seen} />}
            </Tile>
          ))}
        </div>
      </div>
    </section>
  );
}
