import { dismissRelease, useReleaseReady } from "../data/release";

/** "A new version is ready" with Refresh and Later. The page keeps working until the person refreshes. */
export function UpdateBanner() {
  if (!useReleaseReady()) return null;
  return (
    <div className="wl-banner wl-banner-info wl-banner-thin wl-update" role="status">
      A new version of WizeLens is ready.{" "}
      <button type="button" className="wl-link-btn" onClick={() => window.location.reload()}>Refresh</button>
      <button type="button" className="wl-link-btn wl-update-later" onClick={dismissRelease}>Later</button>
    </div>
  );
}

/** In place of a page whose file is gone after a release. */
export function UpdateNeeded() {
  return (
    <div className="wl-banner wl-banner-info" role="status">
      This page changed in a new version of WizeLens.{" "}
      <button type="button" className="wl-link-btn" onClick={() => window.location.reload()}>Refresh to load it</button>
    </div>
  );
}
