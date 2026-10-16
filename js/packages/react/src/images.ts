export interface ImageInfo {
  /** Slowest image download in the view, in ms. Null when no image was downloaded. */
  slowestMs: number | null;
  /** Images on the page. */
  count: number;
  /** Images much bigger than shown and not lazy-loaded. */
  large: number;
}

export interface ImgLike {
  naturalWidth: number;
  naturalHeight: number;
  clientWidth: number;
  clientHeight: number;
  loading?: string;
}

// An image counts as too big when it has more than 4x the pixels it is shown with.
const OVERSIZE = 4;

export function isOversized(img: ImgLike, dpr = 1): boolean {
  if (img.loading === "lazy" || !img.naturalWidth || !img.clientWidth || !img.clientHeight) return false;
  const shown = img.clientWidth * dpr * img.clientHeight * dpr;
  return img.naturalWidth * img.naturalHeight > OVERSIZE * shown;
}

/** Image stats for the view that started at `sinceMs` (ms from navigation start). */
export function imageStats(sinceMs: number): ImageInfo {
  if (typeof performance === "undefined" || typeof document === "undefined" || !document.images) {
    return { slowestMs: null, count: 0, large: 0 };
  }
  const entries = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(
    (e) => e.initiatorType === "img" && e.startTime >= sinceMs,
  );
  const images = Array.from(document.images);
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  return {
    slowestMs: entries.length > 0 ? Math.max(...entries.map((e) => e.duration)) : null,
    count: images.length,
    large: images.filter((img) => isOversized(img, dpr)).length,
  };
}
