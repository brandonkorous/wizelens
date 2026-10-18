"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { tokenize } from "./highlight";
import { SNIPPETS, type Snippet } from "./snippets";

function Code({ s }: { s: Snippet }) {
  return (
    <motion.pre key={s.id} className="wl-code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {s.code.split("\n").map((line, i) => (
        <motion.span key={i} className="wl-code-line" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, duration: 0.35 }}>
          <i className="wl-code-n" aria-hidden>{i + 1}</i>
          {tokenize(line).map((t, j) => <span key={j} className={`wl-tk-${t.kind}`}>{t.text}</span>)}
          {"\n"}
        </motion.span>
      ))}
    </motion.pre>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      setDone(false);
    }
  };
  return (
    <button type="button" className="wl-code-copy" onClick={copy} aria-label="Copy code">
      {done ? <CheckIcon /> : <CopyIcon />}{done ? "Copied" : "Copy"}
    </button>
  );
}

export function Install() {
  const [id, setId] = useState(SNIPPETS[0]!.id);
  const s = SNIPPETS.find((x) => x.id === id)!;
  return (
    <section className="wl-section wl-paper" id="install">
      <div className="wl-wrap wl-install">
        <div className="wl-install-copy">
          <h2 className="wl-h2">Two lines in .NET. One in Node.</h2>
          <p className="wl-lede">Add the package, add a line, run your app. WizeLens is on in development and off in production unless you turn it on.</p>
          <div className="wl-install-tabs" role="tablist" aria-label="Platform">
            {SNIPPETS.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === id} className={x.id === id ? "wl-on" : undefined} onClick={() => setId(x.id)}>
                {x.id === id && <motion.span layoutId="wl-install-pill" className="wl-install-pill" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="wl-install-label">{x.label}</span>
              </button>
            ))}
          </div>
          <p className="wl-install-note">{s.note}</p>
        </div>
        <div className="wl-editor">
          <div className="wl-editor-bar">
            <span>{s.file}</span>
            <CopyButton text={s.code} />
          </div>
          <AnimatePresence mode="wait"><Code key={s.id} s={s} /></AnimatePresence>
        </div>
      </div>
    </section>
  );
}
