import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { checkSearch, type Suggestion, type TimeRange } from "@wizeworks/lens-core";
import { fetchSuggest } from "../data/search";
import { applySuggestion, type TokenAt, tokenAt } from "./queryToken";
import "../styles/query.css";

export interface QueryBarProps {
  value: string;
  onSubmit: (q: string) => void;
  range: TimeRange;
  /** The host answers `api/search/suggest`; else suggestions come from the loaded traces. */
  server: boolean;
  placeholder?: string;
  /** A position the host reported as wrong, to mark. */
  serverError?: { message: string; start: number; end: number } | null;
}

const SUGGEST_DELAY_MS = 150;

/** Suggestions for the term under the caret, after a short pause; none while the term's own are loading, so Enter never picks a stale one. */
function useSuggestions(token: TokenAt | null, range: TimeRange, server: boolean): Suggestion[] {
  const [got, setGot] = useState<{ key: string; items: Suggestion[] } | null>(null);
  const key = token ? `${token.field}\u0000${token.prefix}` : null;
  useEffect(() => {
    if (!token || key === null) return void setGot(null);
    let live = true;
    const done = (items: Suggestion[]) => live && setGot({ key, items });
    const timer = setTimeout(() => fetchSuggest(token.field, token.prefix, range, server).then(done, () => done([])), SUGGEST_DELAY_MS);
    return () => ((live = false), clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range, server]);
  return got && got.key === key ? got.items : [];
}

/** The error of the draft, with the part it covers. */
function ErrorLine({ draft, error }: { draft: string; error: { message: string; start: number; end: number } }) {
  const bad = draft.slice(error.start, Math.max(error.end, error.start + 1));
  return (
    <div className="wl-query-error" role="alert">
      {bad && <code>{bad}</code>} {error.message}
    </div>
  );
}

function SuggestList({ items, active, onPick }: { items: Suggestion[]; active: number; onPick: (s: Suggestion) => void }) {
  return (
    <div className="wl-query-suggest" role="listbox">
      {items.map((s, i) => (
        <div key={s.value} role="option" aria-selected={i === active} className={`wl-query-option${i === active ? " wl-active" : ""}`} onMouseDown={(e) => (e.preventDefault(), onPick(s))}>
          <span className="wl-truncate">{s.value}</span>
          <span className="wl-muted wl-small">{s.help ?? (s.count !== undefined ? s.count.toLocaleString("en-US") : "")}</span>
        </div>
      ))}
    </div>
  );
}

/** A search box for the search language, with autocomplete and errors that point at the bad part. */
export function QueryBar({ value, onSubmit, range, server, placeholder, serverError }: QueryBarProps) {
  const [draft, setDraft] = useState(value);
  const [token, setToken] = useState<TokenAt | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  const items = useSuggestions(token, range, server);
  const check = checkSearch(draft);
  const error = !check.ok ? check : draft === value ? serverError ?? null : null;
  const read = (el: HTMLInputElement) => (setToken(tokenAt(el.value, el.selectionStart ?? el.value.length)), setActive(0));
  const pick = (s: Suggestion) => {
    if (!token) return;
    const next = applySuggestion(draft, token, s.value);
    setDraft(next.text);
    setToken(null);
    requestAnimationFrame(() => input.current?.setSelectionRange(next.caret, next.caret));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const open = items.length > 0 && token !== null;
    if (open && e.key === "ArrowDown") setActive((a) => Math.min(items.length - 1, a + 1));
    else if (open && e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (open && (e.key === "Tab" || (e.key === "Enter" && active >= 0 && token.prefix !== ""))) pick(items[active]!);
    else if (e.key === "Escape") setToken(null);
    else if (e.key === "Enter") (setToken(null), check.ok && onSubmit(draft.trim()));
    else return;
    e.preventDefault();
  };
  return (
    <div className="wl-query">
      <label className={`wl-input wl-query-input${error ? " wl-invalid" : ""}`}>
        <Search aria-hidden="true" />
        <input ref={input} type="search" value={draft} spellCheck={false} placeholder={placeholder ?? "service:api status:5xx duration:>1s @user.id:42"} aria-label="Search" aria-invalid={!!error}
          onChange={(e) => (setDraft(e.target.value), read(e.target))} onClick={(e) => read(e.currentTarget)} onKeyDown={onKey} onBlur={() => setTimeout(() => setToken(null), 120)} />
      </label>
      {token && items.length > 0 && <SuggestList items={items} active={active} onPick={pick} />}
      {error && <ErrorLine draft={draft} error={{ message: "error" in error ? error.error : error.message, start: error.start, end: error.end }} />}
    </div>
  );
}
