// The sites a browser key may send from. A browser key ships in page code, so these, not the secret, keep other sites out.

const MAX_ORIGINS = 20;

/** One site as people type it: `https://shop.example.com`, `http://localhost:3000`, or `https://*.example.com` for its subdomains. Null when it is not one. */
export function originOf(raw: string): string | null {
  const text = raw.trim().replace(/\/+$/, "");
  const wild = /^(https?):\/\/\*\.(.+)$/i.exec(text);
  try {
    const url = new URL(wild ? `${wild[1]}://${wild[2]}` : text);
    if (!/^https?:$/.test(url.protocol) || url.pathname !== "/" || url.search || url.hash || url.username) return null;
    return wild ? `${url.protocol}//*.${url.host}` : url.origin;
  } catch {
    return null;
  }
}

/** Checked, unique sites for a browser key. Throws a message for people on a bad one. */
export function originsFor(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  const texts = list.filter((o): o is string => typeof o === "string" && o.trim() !== "");
  if (texts.length === 0) throw new Error("List the sites that may send with this key, like https://shop.example.com.");
  if (texts.length > MAX_ORIGINS) throw new Error(`A browser key takes up to ${MAX_ORIGINS} sites.`);
  const out = texts.map((t) => {
    const origin = originOf(t);
    if (!origin) throw new Error(`"${t}" is not a site. Use the scheme and host only, like https://shop.example.com.`);
    return origin;
  });
  return [...new Set(out)];
}

/** True when a page on `origin` (the request's Origin header) may send with a key for these sites. */
export function originAllowed(origins: readonly string[] | null, origin: string | undefined): boolean {
  if (!origins || !origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return origins.some((o) => {
    const wild = /^(https?:)\/\/\*\.(.+)$/.exec(o);
    if (!wild) return o === url.origin;
    return url.protocol === wild[1] && url.host.endsWith(`.${wild[2]}`);
  });
}
