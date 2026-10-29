import { CopyButton } from "../../ui/Badges";
import { breakable } from "../../ui/breakable";

/** One line to copy, with what it is above it. */
export function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="wl-snippet">
      <span className="wl-muted wl-small">{label}</span>
      <code className="wl-mono wl-small">{breakable(text)}</code>
      <CopyButton text={text} label={`Copy: ${label}`} />
    </div>
  );
}

/** This dashboard's own address: where services and pages send. */
export const hereUrl = () => new URL("../", window.location.href).href.replace(/\/$/, "");
