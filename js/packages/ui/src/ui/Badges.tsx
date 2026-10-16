import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Health, Impact } from "@wizeworks/lens-core";

export type Tone = "success" | "warning" | "orange" | "danger" | "info" | "neutral";

const HEALTH_TONE: Record<Health, Tone> = {
  info: "info",
  success: "success",
  opportunity: "warning",
  warning: "orange",
  critical: "danger",
  neutral: "neutral",
};

export const toneOfHealth = (h: Health): Tone => HEALTH_TONE[h];

/** Tone for an HTTP status: green 2xx/3xx, amber 4xx, red 5xx. */
export function toneOfStatus(status: number | null): Tone {
  if (status === null) return "neutral";
  if (status >= 500) return "danger";
  return status >= 400 ? "warning" : "success";
}

export function Dot({ tone, title }: { tone: Tone; title?: string }) {
  return <span className={`wl-dot wl-tone-${tone}`} title={title} />;
}

/** A colored dot with text, like "● 200" or "● Healthy". */
export function DotText({ tone, children, colorText = false }: { tone: Tone; children: ReactNode; colorText?: boolean }) {
  return (
    <span className={`wl-dot-text${colorText ? ` wl-text-tone-${tone}` : ""}`}>
      <Dot tone={tone} />
      {children}
    </span>
  );
}

export function Badge({ tone, children }: { tone: Tone | Impact; children: ReactNode }) {
  return <span className={`wl-badge wl-badge-${tone}`}>{children}</span>;
}

const IMPACT_LABEL: Record<Impact, string> = { high: "High", medium: "Medium", low: "Low" };

export const ImpactBadge = ({ impact }: { impact: Impact }) => <Badge tone={impact}>{IMPACT_LABEL[impact]}</Badge>;

/** Blue count box, or a dash for zero. */
export function CountBadge({ n }: { n: number }) {
  return n > 0 ? <span className="wl-count">{n}</span> : <span className="wl-muted">–</span>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    });
  };
  return (
    <button type="button" className="wl-copy-btn" onClick={copy} title={label} aria-label={label}>
      {done ? <Check /> : <Copy />}
    </button>
  );
}
