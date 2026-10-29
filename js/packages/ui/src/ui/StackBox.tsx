import { useRef } from "react";
import { useScrollFocus } from "./scrollFocus";

/** Text in a box that may scroll; when it does, the keyboard can reach and scroll it. */
export function CodeBox({ text, label, className = "wl-code" }: { text: string; label: string; className?: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useScrollFocus(ref, label);
  return <pre ref={ref} className={className}>{text}</pre>;
}

/** A stack trace in a box of fixed height; the keyboard can scroll it when it is longer. */
export function StackBox({ text }: { text: string }) {
  return <CodeBox text={text} label="Stack trace" className="wl-code wl-stack" />;
}
