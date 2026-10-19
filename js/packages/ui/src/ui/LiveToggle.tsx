/** Live updates on or paused. Paused keeps the list still while new data comes in. */
export function LiveToggle({ paused, onChange }: { paused: boolean; onChange: (paused: boolean) => void }) {
  return (
    <button type="button" className={`wl-live${paused ? " wl-paused" : ""}`} onClick={() => onChange(!paused)} title={paused ? "Show new data as it comes in" : "Keep this list still"}>
      <span className="wl-live-dot" aria-hidden="true" />
      {paused ? "Paused" : "Live"}
    </button>
  );
}
