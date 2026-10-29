import { Fragment, type ReactNode, useRef } from "react";
import { useScrollFocus } from "./scrollFocus";

/** Text in a box that may scroll; when it does, the keyboard can reach and scroll it. */
export function CodeBox({ text, label, className = "wl-code", children }: { text: string; label: string; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  useScrollFocus(ref, label);
  return <pre ref={ref} className={className}>{children ?? text}</pre>;
}

/** Text that may break after each /, \, and dot, so a long path or a .NET or Java name wraps at its parts, not mid-name. */
const atParts = (text: string) => text.split(/(?<=[/\\.])/).map((part, i) => <Fragment key={i}>{i > 0 && <wbr />}{part}</Fragment>);

/** A stack trace in a box of fixed height; the keyboard can scroll it when it is longer. */
export function StackBox({ text }: { text: string }) {
  return (
    <CodeBox text={text} label="Stack trace" className="wl-code wl-stack">
      {atParts(text)}
    </CodeBox>
  );
}
