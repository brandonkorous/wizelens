import type { ReactNode } from "react";
import { FAQS, type Faq as Item } from "./faqs";

const LEDE = <>The short version of what people ask first. The <a href="/docs/">docs</a> have the long version.</>;

// Questions as native details elements: the answers are in the HTML for search, and open without JavaScript.
export function Faq({ items = FAQS, lede = LEDE }: { items?: Item[]; lede?: ReactNode }) {
  return (
    <section className="wl-section" id="faq">
      <div className="wl-wrap wl-faq">
        <div className="wl-faq-head">
          <h2 className="wl-h2">Questions, answered.</h2>
          <p className="wl-lede">{lede}</p>
        </div>
        <div className="wl-faq-list">
          {items.map((f, i) => (
            <details key={f.q} className="wl-faq-item" open={i === 0}>
              <summary>
                <h3>{f.q}</h3>
                <span className="wl-faq-icon" aria-hidden />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
