"use client";

import { forwardRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { HudSample } from "@/components/hud/samples";

export const APP_BUTTONS = [
  { id: "customers", label: "Customers" },
  { id: "products", label: "Products" },
  { id: "order", label: "Place order" },
  { id: "boom", label: "Break it" },
];

const STATUS: Record<string, string> = {
  customers: "Loaded 8 customers with their orders",
  products: "Loaded 24 products",
  order: "Order #1042 placed",
  boom: "Something went wrong (500)",
};

const ROWS = [
  ["Ada Moreno", "ada@fieldnote.test", "12", "Gold"],
  ["Ravi Kapoor", "ravi@fieldnote.test", "4", "Silver"],
  ["Mina Okafor", "mina@fieldnote.test", "9", "Gold"],
  ["Jon Lindqvist", "jon@fieldnote.test", "2", "Bronze"],
  ["Sara Haddad", "sara@fieldnote.test", "7", "Silver"],
  ["Leo Tanaka", "leo@fieldnote.test", "15", "Gold"],
];

type Props = { sample: HudSample; pressed: string | null; loading: boolean; setButton: (id: string, el: HTMLButtonElement | null) => void };

// A small shop app, the kind WizeLens runs inside. Only here to be clicked by the demo cursor.
export const FakeApp = forwardRef<HTMLDivElement, Props>(function FakeApp({ sample, pressed, loading, setButton }, ref) {
  return (
    <div className="wl-app" ref={ref} aria-hidden>
      <div className="wl-app-bar">
        <span className="wl-app-url">localhost:5173/customers</span>
      </div>
      <div className="wl-app-body">
        <div className="wl-app-title">Fieldnote Supply</div>
        <div className="wl-app-tools">
          {APP_BUTTONS.map((b) => (
            <button key={b.id} ref={(el) => setButton(b.id, el)} tabIndex={-1} className={`wl-app-btn${pressed === b.id ? " wl-app-btn-down" : ""}${b.id === "boom" ? " wl-app-btn-danger" : ""}`}>
              {b.label}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={sample.id} className={`wl-app-status${sample.code >= 500 ? " wl-app-status-err" : ""}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {STATUS[sample.button]}
          </motion.p>
        </AnimatePresence>
        <div className={`wl-app-table${loading ? " wl-app-loading" : ""}`}>
          {ROWS.map((r) => (
            <div key={r[0]} className="wl-app-row">
              {r.map((c, j) => <span key={j}>{c}</span>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
