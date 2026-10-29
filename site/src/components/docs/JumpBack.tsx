"use client";

import { useEffect, useState } from "react";

const list = () => document.querySelector<HTMLDetailsElement>(".wl-jump");

// Once "On this page" has scrolled away on a narrow screen, a small button brings it back, open.
export function JumpBack() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = list();
    if (!el) return;
    const seen = new IntersectionObserver(([e]) => setShow(!!e && !e.isIntersecting && e.boundingClientRect.top < 0));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  if (!show) return null;
  const back = () => {
    const el = list();
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ block: "start" });
  };
  return (
    <button type="button" className="wl-jump-back" onClick={back}>
      <span aria-hidden="true">↑</span> On this page
    </button>
  );
}
