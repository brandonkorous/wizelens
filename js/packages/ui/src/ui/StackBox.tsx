import { useRef } from "react";
import { useScrollFocus } from "./scrollFocus";

/** A stack trace in a box of fixed height; the keyboard can scroll it when it is longer. */
export function StackBox({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useScrollFocus(ref, "Stack trace");
  return <pre ref={ref} className="wl-code wl-stack">{text}</pre>;
}
