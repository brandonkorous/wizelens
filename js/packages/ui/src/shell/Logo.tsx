// The six aperture blades of the WizeLens mark, in a 100 x 100 box. Same as the HUD.
const BLADES =
  "M39.36 23.5L90.02 23.5A48 48 0 0 0 51.76 2.03ZM67.63 27.54L92.96 71.41A48 48 0 0 0 92.42 27.54ZM78.27 54.03L52.93 97.91A48 48 0 0 0 90.66 75.5ZM60.64 76.5L9.98 76.5A48 48 0 0 0 48.24 97.97ZM32.37 72.46L7.04 28.59A48 48 0 0 0 7.58 72.46ZM21.73 45.97L47.07 2.09A48 48 0 0 0 9.34 24.5Z";

/** The aperture mark. The center dot shows health; the brand default is blue. */
export function Mark({ dot = "var(--wl-blue)" }: { dot?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path className="wl-brand-blades" d={BLADES} />
      <circle cx="50" cy="50" r="16.8" fill={dot} />
    </svg>
  );
}

export function Logo({ dot }: { dot?: string }) {
  return (
    <>
      <Mark dot={dot} />
      <span>
        Wize<span className="wl-brand-lens">Lens</span>
      </span>
    </>
  );
}
