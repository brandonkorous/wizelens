export type SearchEntry = { href: string; page: string; title: string; text: string };

let cache: Promise<SearchEntry[]> | null = null;

export function loadIndex(): Promise<SearchEntry[]> {
  cache ??= fetch("/docs/search.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return cache;
}

function score(e: SearchEntry, words: string[]): number {
  const title = `${e.page} ${e.title}`.toLowerCase();
  const text = e.text.toLowerCase();
  let total = 0;
  for (const w of words) {
    if (title.includes(w)) total += (e.title.toLowerCase().startsWith(w) ? 12 : 8) + (e.page.toLowerCase().includes(w) ? 6 : 0);
    else if (text.includes(w)) total += 2;
    else return 0;
  }
  return total;
}

// Every word must match somewhere; titles count more than body text.
export function search(index: SearchEntry[], query: string, limit = 8): SearchEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return index
    .map((e) => ({ e, s: score(e, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);
}

// About 140 characters around the first query word the text holds; whole sections can be long.
export function snippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const hit = query.toLowerCase().split(/\s+/).filter(Boolean).map((w) => lower.indexOf(w)).find((i) => i >= 0) ?? 0;
  const at = Math.max(0, hit - 40);
  const cut = text.slice(at, at + 140);
  return `${at > 0 ? "…" : ""}${cut}${at + 140 < text.length ? "…" : ""}`;
}
