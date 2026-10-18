import type { CSSProperties } from "react";

// A page headline whose lines slide up out of a mask. Pure CSS, so it plays at first paint, before any script loads.
export function Headline({ lines, className = "wl-display", start = 0.1 }: { lines: string[]; className?: string; start?: number }) {
  return (
    <h1 className={className}>
      {lines.map((line, i) => (
        <span key={line} className="wl-line-mask">
          <span className="wl-line wl-line-in" style={{ "--d": `${start + i * 0.1}s` } as CSSProperties}>{line}{" "}</span>
        </span>
      ))}
    </h1>
  );
}

export function riseDelay(seconds: number): CSSProperties {
  return { "--d": `${seconds}s` } as CSSProperties;
}
