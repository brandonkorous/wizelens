import { parseSourceMap, type SourceMap } from "./map.js";
import type { MapLoader } from "./resolve.js";

export interface FetchLoaderOptions {
  /** Default: the global fetch. */
  fetch?: typeof fetch;
  /** Which script and map URLs may be fetched. Default: loopback addresses only (dev servers). */
  allow?: (url: URL) => boolean;
  /** Largest script or map read. Default 32 MB. */
  maxBytes?: number;
  /** Default 5000 ms per fetch. */
  timeoutMs?: number;
}

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1|[^.]+\.localhost)$/i;

/** True for http(s) URLs on this machine: localhost, 127.x, ::1. */
export const isLoopbackUrl = (url: URL): boolean => /^https?:$/.test(url.protocol) && LOOPBACK.test(url.hostname);

// The map a script names in its last `//# sourceMappingURL=` comment.
export function mapUrlOf(code: string): string | null {
  const tail = code.slice(-4096);
  let found: string | null = null;
  for (const m of tail.matchAll(/[#@]\s*sourceMappingURL=([^\s'"*]+)/g)) found = m[1]!;
  return found;
}

/** The JSON text of a `data:` source map URL. */
export function decodeDataUrl(url: string): string | null {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  try {
    if (!m[1]) return decodeURIComponent(m[2]!);
    const bin = atob(m[2]!);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function getText(o: Required<FetchLoaderOptions>, url: URL): Promise<{ text: string; header: string | null } | null> {
  if (!o.allow(url)) return null;
  try {
    const res = await o.fetch(url.href, { signal: AbortSignal.timeout(o.timeoutMs) });
    if (!res.ok || Number(res.headers.get("content-length") ?? 0) > o.maxBytes) return null;
    const text = await res.text();
    return text.length > o.maxBytes ? null : { text, header: res.headers.get("sourcemap") ?? res.headers.get("x-sourcemap") };
  } catch {
    return null;
  }
}

async function mapFrom(o: Required<FetchLoaderOptions>, ref: string, base: URL): Promise<SourceMap | null> {
  if (ref.startsWith("data:")) {
    const text = decodeDataUrl(ref);
    return text ? parseSourceMap(text) : null;
  }
  const got = await getText(o, new URL(ref, base));
  return got ? parseSourceMap(got.text) : null;
}

/** Load maps over HTTP: fetch the script, follow its sourceMappingURL (or `<script>.map`). For dev servers and served build folders. */
export function fetchMapLoader(options: FetchLoaderOptions = {}): MapLoader {
  const o: Required<FetchLoaderOptions> = {
    fetch: options.fetch ?? ((...a) => globalThis.fetch(...a)),
    allow: options.allow ?? isLoopbackUrl,
    maxBytes: options.maxBytes ?? 32 * 1024 * 1024,
    timeoutMs: options.timeoutMs ?? 5000,
  };
  return async (raw) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    const script = await getText(o, url);
    const ref = script ? (script.header ?? mapUrlOf(script.text)) : null;
    if (ref) return mapFrom(o, ref, url);
    return mapFrom(o, `${url.origin}${url.pathname}.map`, url);
  };
}

/** Try each loader in turn; the first map found wins. */
export const chainLoaders =
  (...loaders: MapLoader[]): MapLoader =>
  async (url, release) => {
    for (const load of loaders) {
      const map = await load(url, release).catch(() => null);
      if (map) return map;
    }
    return null;
  };

export interface CacheOptions {
  /** Most maps kept. Default 50. */
  max?: number;
  /** How long a miss is remembered, so an upload after it is found soon. Default 60 s. */
  missMs?: number;
  /** How long a found map is kept. Default: until pushed out. Dev servers change files, so they use a short time. */
  hitMs?: number;
  now?: () => number;
}

/** Keep loaded maps (newest used last out). Misses are kept for a short time only. */
export function cachedLoader(load: MapLoader, o: CacheOptions = {}): MapLoader {
  const max = o.max ?? 50;
  const missMs = o.missMs ?? 60_000;
  const hitMs = o.hitMs ?? Infinity;
  const now = o.now ?? Date.now;
  const cache = new Map<string, { map: Promise<SourceMap | null>; at: number }>();
  return async (url, release) => {
    const key = `${release ?? ""}\n${url}`;
    const hit = cache.get(key);
    const age = hit ? now() - hit.at : 0;
    if (hit && age < ((await hit.map) ? hitMs : missMs)) {
      cache.delete(key);
      cache.set(key, hit);
      return hit.map;
    }
    const entry = { map: load(url, release).catch(() => null), at: now() };
    cache.set(key, entry);
    while (cache.size > max) cache.delete(cache.keys().next().value!);
    return entry.map;
  };
}
