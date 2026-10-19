"use client";

import { useState } from "react";
import { Num } from "@/components/ui/Num";
import { gbText, money, monthlyPrice, plan, split, TIERS } from "./plans";

// Each quarter of the slider covers one price step, so small and large teams both get room.
const STOPS = [0, 50, 500, 2000, 5000];
const BANDS = STOPS.slice(1).map((to, i) => ({ from: STOPS[i] ?? 0, to }));

function toGb(pos: number): number {
  const q = Math.min(3, Math.floor(pos / 25));
  const b = BANDS[q] ?? { from: 0, to: 0 };
  const gb = b.from + ((pos - q * 25) / 25) * (b.to - b.from);
  const step = gb < 50 ? 1 : gb < 500 ? 5 : gb < 2000 ? 25 : 50;
  return Math.max(1, Math.round(gb / step) * step);
}

function toPos(gb: number): number {
  const q = Math.max(0, BANDS.findIndex((b) => gb <= b.to));
  const b = BANDS[q] ?? { from: 0, to: 1 };
  return q * 25 + ((gb - b.from) / (b.to - b.from)) * 25;
}

const COLORS = ["var(--wl-green)", "var(--wl-blue)", "var(--wl-amber)", "var(--wl-orange)"];

// The month's GB as one bar: included, then each price step.
function SplitBar({ gb, included }: { gb: number; included: number }) {
  const s = split(gb, included);
  const parts = [s.included, ...s.steps];
  return (
    <div className="wl-pc-bar" aria-hidden>
      {parts.map((v, i) => <i key={i} style={{ flexGrow: v, background: COLORS[i] }} />)}
    </div>
  );
}

function PriceRow({ id, gb, best }: { id: "team" | "business"; gb: number; best: boolean }) {
  const p = plan(id);
  const extra = Math.max(0, gb - (p.gb ?? 0));
  return (
    <div className={`wl-pc-row${best ? " wl-pc-best" : ""}`}>
      <div>
        <b>{p.name}</b>
        <span>{extra ? `${money(p.monthly ?? 0)} plan + ${gbText(extra)} extra` : `${gbText(p.gb ?? 0)} included`}</span>
      </div>
      <strong>$<Num value={Math.round(monthlyPrice(p, gb))} decimals={0} /><small>/mo</small></strong>
    </div>
  );
}

function FreeRow({ gb }: { gb: number }) {
  const fits = gb <= 10;
  return (
    <div className={`wl-pc-row${fits ? " wl-pc-best" : " wl-pc-off"}`}>
      <div>
        <b>Free</b>
        <span>{fits ? "Fits in the Free plan's 10 GB" : "Stops at 10 GB until the 1st"}</span>
      </div>
      <strong>$0<small>/mo</small></strong>
    </div>
  );
}

// A live price check: slide to the data you send each month and see every plan's price.
export function Calculator() {
  const [gb, setGb] = useState(120);
  const team = plan("team");
  return (
    <div className="wl-pc">
      <div className="wl-pc-head">
        <label htmlFor="wl-pc-gb">Data you send each month</label>
        <output htmlFor="wl-pc-gb" className="wl-num">{gbText(gb)}</output>
      </div>
      <input id="wl-pc-gb" className="wl-pc-range" type="range" min={0} max={100} step={0.25} value={toPos(gb)} aria-valuetext={gbText(gb)} onChange={(e) => setGb(toGb(Number(e.target.value)))} />
      <div className="wl-pc-scale" aria-hidden>{STOPS.map((s) => <span key={s}>{s ? gbText(s) : "0"}</span>)}</div>
      <FreeRow gb={gb} />
      <PriceRow id="team" gb={gb} best={gb > 10} />
      <PriceRow id="business" gb={gb} best={false} />
      <div className="wl-pc-split">
        <SplitBar gb={gb} included={team.gb ?? 0} />
        <ul>
          <li><i style={{ background: COLORS[0] }} />Included in Team ({gbText(team.gb ?? 0)})</li>
          {TIERS.map((t, i) => <li key={t.label}><i style={{ background: COLORS[i + 1] }} />{t.label}: {money(t.rate)}/GB</li>)}
        </ul>
      </div>
    </div>
  );
}
