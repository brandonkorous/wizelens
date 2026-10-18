"use client";

import { useCallback, useId, useLayoutEffect, useRef } from "react";
import { useMotionValue, useMotionValueEvent, type MotionValue } from "motion/react";

// The mark is six blades. Each is the space past its inner edge (distance R from center), cut by a gap of width GAP.
const R_REST = 26.5;
const R_SHUT = 3.2;
const GAP = 4.04;
const LENS_MAX = 16.8;
const LENS_INSET = R_REST - LENS_MAX;
const SPIN_DEG = -30;
const FAR = 160;
const SIN60 = Math.sin(Math.PI / 3);

type Props = {
  open?: MotionValue<number>;
  dot?: string;
  label?: string;
  className?: string;
};

function radius(v: number): number {
  return R_SHUT + (R_REST - R_SHUT) * Math.min(1, Math.max(0, v));
}

// Blade 0 as a wide wedge; the circle clip trims it to the mark's outline.
function bladePath(v: number): string {
  const r = radius(v);
  const ax = 50 + (GAP - 0.5 * r) / SIN60;
  const ay = 50 - r;
  const pts = [
    [ax, ay],
    [ax + FAR, ay],
    [ax + FAR + FAR * 0.5, ay - FAR * SIN60],
    [ax + FAR * 0.5, ay - FAR * SIN60],
  ];
  return `M${pts.map(([x, y]) => `${x!.toFixed(2)} ${y!.toFixed(2)}`).join("L")}Z`;
}

function spinTransform(v: number): string {
  return `rotate(${((1 - v) * SPIN_DEG).toFixed(2)} 50 50)`;
}

function lensRadius(v: number): number {
  return Math.min(LENS_MAX, Math.max(0, radius(v) - LENS_INSET));
}

// The aperture mark. `open` runs from 0 (blades shut) to 1 (the brand mark at rest).
export function Aperture({ open, dot = "var(--wl-blue)", label, className }: Props) {
  const fallback = useMotionValue(1);
  const value = open ?? fallback;
  const clip = useId();
  const blades = useRef<(SVGPathElement | null)[]>([]);
  const spin = useRef<SVGGElement>(null);
  const lens = useRef<SVGCircleElement>(null);

  const draw = useCallback((v: number) => {
    const d = bladePath(v);
    for (const blade of blades.current) blade?.setAttribute("d", d);
    spin.current?.setAttribute("transform", spinTransform(v));
    lens.current?.setAttribute("r", lensRadius(v).toFixed(2));
  }, []);

  useLayoutEffect(() => draw(value.get()), [draw, value]);
  useMotionValueEvent(value, "change", draw);

  const v = value.get();
  return (
    <svg viewBox="0 0 100 100" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <g ref={spin} transform={spinTransform(v)}>
        <g clipPath={`url(#${clip})`}>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <g key={k} transform={`rotate(${k * 60} 50 50)`}>
              <path ref={(el) => { blades.current[k] = el; }} d={bladePath(v)} className="wl-blade" />
            </g>
          ))}
        </g>
      </g>
      <circle ref={lens} cx="50" cy="50" r={lensRadius(v)} className="wl-lens" style={{ fill: dot }} />
    </svg>
  );
}
