import { useEffect, useState } from "react";
import { setQuery } from "../routes";

const SEARCH_DELAY_MS = 250;

/** Search text that reaches the URL's `q` after a short pause, so typing stays smooth. `clear` resets other params with it (the page, a selection). */
export function useSearchText(q: string, clear: Record<string, null> = { page: null }): [string, (v: string) => void] {
  const [text, setText] = useState(q);
  const key = JSON.stringify(clear);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text === q) return;
    const id = setTimeout(() => setQuery({ q: text, ...(JSON.parse(key) as Record<string, null>) }), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [text, q, key]);
  return [text, setText];
}
