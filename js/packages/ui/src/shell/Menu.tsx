import { type ReactNode, useEffect, useRef, useState } from "react";

export interface MenuProps {
  /** Button content. */
  label: ReactNode;
  /** Accessible name of the button. */
  /** The tooltip; also the name when the button shows only an icon. Words in the button are its name. */
  title: string;
  buttonClass?: string;
  /** Runs when the menu opens. */
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}

/** A button with a drop-down panel. Closes on outside click and on Escape. */
export function Menu({ label, title, buttonClass = "wl-top-btn", onOpen, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = () => {
    if (!open) onOpen?.();
    setOpen(!open);
  };
  return (
    <div className="wl-menu-anchor" ref={ref}>
      <button type="button" className={buttonClass} aria-haspopup="true" aria-expanded={open} title={title} onClick={toggle}>
        {label}
      </button>
      {open && <div className="wl-menu" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}
