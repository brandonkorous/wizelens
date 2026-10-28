// Room for the HUD at the end of a page that scrolls, so the page's last line (a "Pay now" button) can scroll above the card.

const ROOM_ID = "wizelens-hud-room";
const GAP_PX = 16;

/** How tall the room must be: the card's height and a gap when the page scrolls without it, else 0. */
export function roomHeight(cardPx: number | null, pagePx: number, viewPx: number): number {
  return cardPx !== null && pagePx > viewPx + 1 ? Math.round(cardPx + GAP_PX) : 0;
}

/** Keeps an empty block after the page's content, as tall as the HUD card while the page scrolls. Returns a stop function. */
export function keepRoomFor(card: () => HTMLElement | null): () => void {
  if (typeof document === "undefined" || typeof ResizeObserver === "undefined") return () => {};
  const room = document.getElementById(ROOM_ID) ?? Object.assign(document.createElement("div"), { id: ROOM_ID });
  room.setAttribute("aria-hidden", "true");
  room.style.cssText = "height:0;margin:0;padding:0;border:0;pointer-events:none";
  const update = () => {
    const el = card();
    const page = document.documentElement.scrollHeight - room.offsetHeight;
    const px = `${roomHeight(el ? el.getBoundingClientRect().height : null, page, innerHeight)}px`;
    if (room.style.height !== px) room.style.height = px;
    if (room.parentNode !== document.body || room.nextSibling) document.body.append(room);
  };
  const observer = new ResizeObserver(update);
  observer.observe(document.body);
  const timer = setInterval(update, 1000);
  update();
  return () => {
    observer.disconnect();
    clearInterval(timer);
    room.remove();
  };
}
