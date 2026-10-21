import { s } from "./dom.js";

/** The six aperture blades, in a 100 x 100 box. */
export const APERTURE_BLADES =
  "M39.36 23.5L90.02 23.5A48 48 0 0 0 51.76 2.03ZM67.63 27.54L92.96 71.41A48 48 0 0 0 92.42 27.54ZM78.27 54.03L52.93 97.91A48 48 0 0 0 90.66 75.5ZM60.64 76.5L9.98 76.5A48 48 0 0 0 48.24 97.97ZM32.37 72.46L7.04 28.59A48 48 0 0 0 7.58 72.46ZM21.73 45.97L47.07 2.09A48 48 0 0 0 9.34 24.5Z";

/** The WizeLens mark. The center dot takes the health color through `--wl-h`. */
export function apertureMark(size = 20, blades = "currentColor"): SVGElement {
  return s(
    "svg",
    { width: size, height: size, viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" },
    s("path", { fill: blades, d: APERTURE_BLADES }),
    s("circle", { class: "wl-mark-dot", cx: 50, cy: 50, r: 16.8 }),
  );
}

function icon(size: number, ...children: SVGElement[]): SVGElement {
  const attrs = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2 };
  return s("svg", { ...attrs, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" }, ...children);
}

const path = (d: string) => s("path", { d });

export const iconChevron = () => icon(16, path("M6 15l6-6 6 6"));
export const iconPause = () => icon(16, s("rect", { x: 6, y: 4, width: 4, height: 16, rx: 1 }), s("rect", { x: 14, y: 4, width: 4, height: 16, rx: 1 }));
export const iconPlay = () => icon(16, path("M7 4l13 8-13 8z"));
const GEAR =
  "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z";
export const iconGear = () => icon(16, path(GEAR), s("circle", { cx: 12, cy: 12, r: 3 }));
export const iconMinimize = () => icon(16, s("circle", { cx: 12, cy: 12, r: 9 }), path("M8 12h8"));
export const iconExternal = (size = 14) => icon(size, path("M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"));
export const iconClose = () => icon(16, path("M6 6l12 12M18 6L6 18"));
