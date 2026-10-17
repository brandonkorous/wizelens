"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";

const COPY = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>';

// Adds a copy button to every code block once the page is in the browser.
function addCopyButtons(root: HTMLElement) {
  for (const pre of root.querySelectorAll("pre")) {
    if (pre.parentElement?.classList.contains("wl-pre")) continue;
    const wrap = document.createElement("div");
    wrap.className = "wl-pre";
    pre.replaceWith(wrap);
    wrap.append(pre);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wl-pre-copy";
    button.innerHTML = `${COPY}<span>Copy</span>`;
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(pre.innerText).catch(() => undefined);
      button.querySelector("span")!.textContent = "Copied";
      window.setTimeout(() => { button.querySelector("span")!.textContent = "Copy"; }, 1500);
    });
    wrap.append(button);
  }
}

export function Article({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) addCopyButtons(ref.current); }, [html]);
  return (
    <motion.div
      ref={ref}
      className="wl-prose"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
