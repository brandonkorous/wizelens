"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { HUD_SAMPLES } from "@/components/hud/samples";
import { useHealth } from "@/lib/health";

type Point = { x: number; y: number };

const MOVE_MS = 750;
const STEP_MS = 4600;

function centerOf(el: HTMLElement, stage: HTMLElement): Point {
  const a = el.getBoundingClientRect();
  const b = stage.getBoundingClientRect();
  return { x: a.left - b.left + a.width * 0.55, y: a.top - b.top + a.height * 0.6 };
}

// Drives the hero demo: move the cursor to a button, click it, show that request in the HUD, repeat.
export function useDemoLoop(stage: RefObject<HTMLElement | null>, active: boolean) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [index, setIndex] = useState(0);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setHealth } = useHealth();

  useEffect(() => {
    setHealth(HUD_SAMPLES[index]?.health ?? "info");
  }, [index, setHealth]);

  useEffect(() => {
    if (!active) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const run = (k: number) => {
      const sample = HUD_SAMPLES[k % HUD_SAMPLES.length]!;
      const el = buttons.current.get(sample.button);
      if (el && stage.current) setCursor(centerOf(el, stage.current));
      later(() => { setPressed(sample.button); setLoading(true); }, MOVE_MS);
      later(() => { setPressed(null); setIndex(k % HUD_SAMPLES.length); }, MOVE_MS + 180);
      later(() => setLoading(false), MOVE_MS + 520);
      later(() => run(k + 1), STEP_MS);
    };
    later(() => run(index + 1), 2400);
    return () => timers.forEach((t) => window.clearTimeout(t));
    // The loop restarts only when the stage comes into or leaves view.
  }, [active]);

  const setButton = (id: string, el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(id, el);
  };

  return { sample: HUD_SAMPLES[index]!, cursor, pressed, loading, setButton };
}
