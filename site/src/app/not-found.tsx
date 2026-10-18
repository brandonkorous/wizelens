import type { Metadata } from "next";
import { ClosedLens } from "@/components/brand/ClosedLens";
import { ArrowRight } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

// The lens closes on nothing: a short page with the ways back.
export default function NotFound() {
  return (
    <main className="wl-404">
      <div className="wl-wrap wl-404-inner">
        <ClosedLens />
        <h1 className="wl-display">Nothing to see here.</h1>
        <p className="wl-lede">This page does not exist, or it moved. These do:</p>
        <div className="wl-hero-cta">
          <a href="/" className="wl-btn wl-btn-primary">Home <ArrowRight /></a>
          <a href="/docs/" className="wl-btn wl-btn-ghost">Docs</a>
          <a href="/changelog/" className="wl-btn wl-btn-ghost">Changelog</a>
        </div>
      </div>
    </main>
  );
}
