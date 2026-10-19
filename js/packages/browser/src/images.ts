import { observe } from "./vitals.js";

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

/** One image download: start (ms from navigation start) and duration. */
export type ImageDownload = Pick<PerformanceResourceTiming, "startTime" | "duration">;

export interface ImageWatch {
  downloads(): readonly ImageDownload[];
  stop(): void;
}

// The newest downloads kept. Older ones belong to views that were sent long ago.
const MAX_DOWNLOADS = 500;

/** Keep image downloads as they happen. The browser's own list stops at 250 entries, which a busy app fills in seconds. */
export function watchImages(): ImageWatch {
  const list: ImageDownload[] = [];
  const stop = observe("resource", (entries) => {
    for (const e of entries as PerformanceResourceTiming[]) {
      if (e.initiatorType !== "img") continue;
      list.push({ startTime: e.startTime, duration: e.duration });
      if (list.length > MAX_DOWNLOADS) list.shift();
    }
  });
  return { downloads: () => list, stop };
}

/** Image stats for the view that started at `sinceMs` (ms from navigation start). */
export function imageStats(sinceMs: number, downloads: readonly ImageDownload[]): ImageInfo {
  if (typeof document === "undefined" || !document.images) return { slowestMs: null, count: 0, large: 0 };
  const entries = downloads.filter((e) => e.startTime >= sinceMs);
  const images = Array.from(document.images);
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  return {
    slowestMs: entries.length > 0 ? Math.max(...entries.map((e) => e.duration)) : null,
    count: images.length,
    large: images.filter((img) => isOversized(img, dpr)).length,
  };
}
