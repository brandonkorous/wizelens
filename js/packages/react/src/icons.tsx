import type { ReactNode } from "react";

/** The six aperture blades, in a 100 x 100 box. */
export const APERTURE_BLADES =
  "M39.36 23.5L90.02 23.5A48 48 0 0 0 51.76 2.03ZM67.63 27.54L92.96 71.41A48 48 0 0 0 92.42 27.54ZM78.27 54.03L52.93 97.91A48 48 0 0 0 90.66 75.5ZM60.64 76.5L9.98 76.5A48 48 0 0 0 48.24 97.97ZM32.37 72.46L7.04 28.59A48 48 0 0 0 7.58 72.46ZM21.73 45.97L47.07 2.09A48 48 0 0 0 9.34 24.5Z";

/** The WizeLens mark. The center dot takes the health color through `currentColor`. */
export function ApertureMark({ size = 20, blades = "currentColor", className }: { size?: number; blades?: string; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path fill={blades} d={APERTURE_BLADES} />
      <circle className="wl-mark-dot" cx="50" cy="50" r="16.8" />
    </svg>
  );
}

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconChevron = () => (
  <Icon>
    <path d="M6 15l6-6 6 6" />
  </Icon>
);
export const IconBolt = () => (
  <Icon>
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
  </Icon>
);
export const IconGear = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Icon>
);
export const IconMinimize = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </Icon>
);
export const IconExternal = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);
export const IconClose = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
