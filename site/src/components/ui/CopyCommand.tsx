"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

// A one-line shell command with a copy button.
export function CopyCommand({ command, className = "" }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={`wl-cmd ${className}`}>
      <span className="wl-cmd-prompt" aria-hidden>$</span>
      <code className="wl-cmd-text">{command}</code>
      <button type="button" className="wl-cmd-copy" onClick={copy} aria-label={copied ? "Copied" : `Copy ${command}`}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
