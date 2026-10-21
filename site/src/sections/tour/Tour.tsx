"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";

type Page = { id: string; label: string; text: string; url?: string };

const DASHBOARD = "localhost:5100/_wizelens/#/";

const PAGES: Page[] = [
  { id: "overview", label: "Overview", text: "Requests, timing, services, and insights at a glance." },
  { id: "hud", label: "HUD", text: "Timing, queries, and insights in the corner of your own page.", url: "localhost:5173/" },
  { id: "search", label: "Search", text: "One search language for requests, traces, spans, and logs." },
  { id: "requests", label: "Requests", text: "Filter, search, and open any request." },
  { id: "traces", label: "Traces", text: "One request as layers, across every service." },
  { id: "errors", label: "Errors", text: "Error groups with their stack, request, and users." },
  { id: "database", label: "Database", text: "Slow queries, N+1 patterns, and table hot spots." },
  { id: "rendering", label: "Rendering", text: "Routes, hydration, and components that render too often." },
  { id: "security", label: "Security", text: "Risks from real traffic, mapped to the OWASP Top 10." },
];

// The address the shot was taken at: the sample app for the HUD, else the dashboard's hash route.
const urlOf = (p: Page) => p.url ?? DASHBOARD + (p.id === "overview" ? "" : p.id);

const STEP_MS = 6000;

function useAutoplay(active: boolean, count: number) {
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), STEP_MS);
    return () => window.clearTimeout(id);
  }, [active, index, round, count]);
  const pick = (i: number) => { setIndex(i); setRound((r) => r + 1); };
  return { index, pick, round };
}

type TabsProps = { index: number; round: number; playing: boolean; pick: (i: number) => void; setPaused: (p: boolean) => void };

// On a phone the tabs scroll sideways; keep the open one in view without moving the page.
function useTabInView(index: number) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = list.current;
    const tab = box?.children[index] as HTMLElement | undefined;
    if (!box || !tab || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: tab.offsetLeft - (box.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [index]);
  return list;
}

function TourTabs({ index, round, playing, pick, setPaused }: TabsProps) {
  const list = useTabInView(index);
  return (
    <div ref={list} className="wl-tour-tabs" role="tablist" aria-label="Dashboard pages" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {PAGES.map((p, i) => (
        <button key={p.id} role="tab" aria-selected={i === index} className={`wl-tour-tab${i === index ? " wl-tour-on" : ""}`} onClick={() => pick(i)}>
          <b>{p.label}</b>
          <span>{p.text}</span>
          {i === index && (
            <motion.i key={`${index}-${round}`} className="wl-tour-progress" initial={{ scaleX: 0 }} animate={{ scaleX: playing ? 1 : 0 }} transition={{ duration: playing ? STEP_MS / 1000 : 0, ease: "linear" }} />
          )}
        </button>
      ))}
    </div>
  );
}

// A tour of the real dashboard: the tabs advance by themselves, and you can pick one.
export function Tour() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.4 });
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const playing = inView && !paused && !reduced;
  const { index, pick, round } = useAutoplay(playing, PAGES.length);
  const page = PAGES[index]!;

  return (
    <section className="wl-section">
      <div className="wl-wrap" ref={box}>
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Open /_wizelens. That&apos;s it.</h2>
          <p className="wl-lede">
            Every service serves the dashboard on its own port. No account, no agent, no collector. Your data stays on
            your machine until you send it somewhere.
          </p>
        </div>
        <TourTabs index={index} round={round} playing={playing} pick={pick} setPaused={setPaused} />
        <div className="wl-tour-frame">
          <div className="wl-tour-bar">
            <span className="wl-app-url">{urlOf(page)}</span>
          </div>
          <div className="wl-tour-shot">
            <AnimatePresence initial={false}>
              <motion.img
                key={page.id}
                src={`/shots/${page.id}.jpg`}
                alt={`WizeLens ${page.label} page: ${page.text}`}
                loading="lazy"
                decoding="async"
                width={1538}
                height={784}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
