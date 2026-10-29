import { type CSSProperties, type KeyboardEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** Room kept between the list and the window's edge. */
const EDGE = 8;

/** Where the list goes: under the button, or over it when there is more room above; at least as wide as the button. */
function placeOf(button: HTMLElement): CSSProperties {
  const r = button.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - EDGE;
  const above = r.top - EDGE;
  const up = below < 200 && above > below;
  const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - EDGE));
  const room = Math.max(120, Math.min(480, up ? above : below) - 6);
  return { position: "fixed", left, minWidth: r.width, maxWidth: window.innerWidth - left - EDGE, maxHeight: room, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) };
}

/** The first label after `from` that starts with what was typed, wrapping round. */
function typeAhead(labels: readonly string[], text: string, from: number): number {
  const t = text.toLowerCase();
  for (let i = 1; i <= labels.length; i++) {
    const at = (from + i) % labels.length;
    if (labels[at]!.toLowerCase().startsWith(t)) return at;
  }
  return -1;
}

/** Closes the open list on a press outside it and its label, and keeps it beside its button while the page scrolls. */
function useOpenList(open: boolean, close: () => void, place: () => void, button: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const owner = button.current?.closest("label") ?? button.current;
    const onDown = (e: PointerEvent) => !owner?.contains(e.target as Node) && !list.current?.contains(e.target as Node) && close();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, close, place, button, list]);
}

/** A select-only combobox: open, move, type a letter to jump, Enter or a click picks, Escape and Tab close. */
export function useListbox(labels: readonly string[], selected: number, onPick: (index: number) => void, button: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [style, setStyle] = useState<CSSProperties>({});
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const place = useCallback(() => button.current && setStyle(placeOf(button.current)), [button]);
  const close = useCallback(() => setOpen(false), []);
  useOpenList(open, close, place, button, listRef);
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  const show = (at = Math.max(0, selected)) => (place(), setActive(at), setOpen(true));
  const pick = (i: number) => (setOpen(false), button.current?.focus(), i !== selected && onPick(i));
  const jump = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at < 700 ? typed.current.text + key : key, at: now };
    const at = typeAhead(labels, typed.current.text, typed.current.text.length > 1 ? active - 1 : active);
    if (at >= 0) (open ? setActive(at) : pick(at));
  };
  const onKey = (e: KeyboardEvent) => {
    const last = labels.length - 1;
    const step: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last, PageDown: Math.min(last, active + 10), PageUp: Math.max(0, active - 10) };
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) return (e.preventDefault(), show());
    if (open && e.key in step) return (e.preventDefault(), setActive(step[e.key]!));
    if (open && (e.key === "Enter" || e.key === " ")) return (e.preventDefault(), pick(active));
    // Escape closes the list only; the modal around it stays open.
    if (open && e.key === "Escape") return (e.preventDefault(), e.stopPropagation(), setOpen(false));
    if (open && e.key === "Tab") return setOpen(false);
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) jump(e.key);
  };
  return { open, active, setActive, style, listRef, toggle: () => (open ? setOpen(false) : show()), pick, onKey };
}
