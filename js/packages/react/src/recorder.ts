import {
  ATTR_BROWSER_SESSION,
  formatTraceparent,
  HEADER_TRACE,
  newSpanId,
  newTraceId,
  SESSION_STORAGE_KEY,
  type Span,
  type Trace,
  type TraceSummary,
} from "@wizeworks/lens-core";

export interface RecordedRequest {
  /** Browser span id. */
  id: string;
  method: string;
  url: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  /** Trace id the server reported (X-WizeLens-Trace), or the one we sent. */
  traceId: string;
  /** True when the server answered with X-WizeLens-Trace, so the dashboard has data for it. */
  profiled: boolean;
  startMs: number;
  error: string | null;
  /** True when this row came from the server after a page load, not from a live fetch. */
  restored?: boolean;
  /** What the server did for this request. Set a moment after the response, for profiled requests. */
  server?: ServerStats;
}

export interface ServerStats {
  /** Name of the first server span, e.g. "GET /api/orders". Null when unknown. */
  name: string | null;
  /** Time the first server span took. Null when unknown. */
  durationMs: number | null;
  dbCount: number;
  /** Total time of all DB spans. Null when unknown. */
  dbMs: number | null;
  httpClientCount: number;
  errorCount: number;
  /** Services that took part, without "browser". */
  services: string[];
}

export interface RecorderOptions {
  /** WizeLens base path or URL. Default "/_wizelens". */
  endpoint?: string;
  /** Which requests get a `traceparent` header. Default: same origin only. */
  propagateTo?: (url: URL) => boolean;
  /** How many requests the HUD keeps. Default 30. */
  maxRecent?: number;
  /** How often browser spans are sent. Default 1000 ms. */
  flushIntervalMs?: number;
  /** How long to wait after a response before loading its server stats. Default 400 ms. */
  serverStatsDelayMs?: number;
}

export interface Recorder {
  readonly endpointUrl: string;
  /** Per-tab id. Kept in sessionStorage, so it survives a page refresh. */
  readonly sessionId: string;
  /** Patch `window.fetch`. Returns an undo function. Safe to call more than once. */
  install(): () => void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly RecordedRequest[];
  /** Send queued browser spans now. */
  flush(): Promise<void>;
  /** Load this tab's earlier requests from the server. Runs once on install. */
  restore(): Promise<void>;
  /** Load server stats for one trace into its row. Runs on its own for profiled requests. */
  loadServerStats(traceId: string): Promise<void>;
  /** Link to the dashboard page for one trace. */
  traceLink(traceId: string): string;
  clear(): void;
}

const now = () => performance.timeOrigin + performance.now();

function requestUrl(input: RequestInfo | URL, base: string): URL {
  if (typeof input === "string") return new URL(input, base);
  if (input instanceof URL) return input;
  return new URL(input.url, base);
}

/** Read or create the per-tab session id. Storage can be blocked: then the id lasts for this page only. */
export function getSessionId(): string {
  const fresh = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : newTraceId();
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = fresh();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

function pathOf(url: string, base: string): string {
  try {
    const u = new URL(url, base);
    return u.origin === new URL(base).origin ? u.pathname + u.search : u.href;
  } catch {
    return url;
  }
}

/** Server stats from a full (federated) trace. Browser spans do not count. */
export function serverStatsFromTrace(trace: Trace): ServerStats {
  const spans = trace.spans.filter((s) => s.category !== "browser");
  const root = spans.filter((s) => s.category === "http.server").sort((a, b) => a.startMs - b.startMs)[0];
  const db = spans.filter((s) => s.category === "db");
  return {
    name: root?.name ?? null,
    durationMs: root?.durationMs ?? null,
    dbCount: db.length,
    dbMs: db.reduce((sum, s) => sum + s.durationMs, 0),
    httpClientCount: spans.filter((s) => s.category === "http.client").length,
    errorCount: spans.filter((s) => s.status === "error").length,
    services: [...new Set(spans.map((s) => s.service))],
  };
}

/** Turn a server trace summary into a HUD row. */
export function summaryToRequest(t: TraceSummary, base: string): RecordedRequest {
  const [nameMethod, ...rest] = t.rootName.split(" ");
  const fallbackUrl = rest.join(" ") || t.rootName;
  const url = t.rootUrl ?? fallbackUrl;
  return {
    id: `restored:${t.traceId}`,
    method: (t.rootMethod ?? (nameMethod && /^[A-Z]+$/.test(nameMethod) ? nameMethod : "GET")).toUpperCase(),
    url,
    path: pathOf(url, base),
    status: t.rootStatusCode,
    durationMs: t.durationMs,
    traceId: t.traceId,
    profiled: true,
    startMs: t.startMs,
    error: t.status === "error" && (t.rootStatusCode === null || t.rootStatusCode < 500) ? "error" : null,
    restored: true,
    server: {
      name: null,
      durationMs: null,
      dbCount: t.dbCount,
      dbMs: null,
      httpClientCount: t.httpClientCount,
      errorCount: t.errorCount,
      services: t.services.filter((s) => s !== "browser"),
    },
  };
}

/** Merge restored rows under live ones: newest first, one row per trace, at most `max`. */
export function mergeRequests(
  live: readonly RecordedRequest[],
  restored: readonly RecordedRequest[],
  max: number,
): RecordedRequest[] {
  const seen = new Set(live.map((r) => r.traceId));
  const extra = restored.filter((r) => !seen.has(r.traceId));
  return [...live, ...extra].sort((a, b) => b.startMs - a.startMs).slice(0, max);
}

export function createRecorder(options: RecorderOptions = {}): Recorder {
  const base = typeof location !== "undefined" ? location.href : "http://localhost/";
  const endpoint = new URL((options.endpoint ?? "/_wizelens").replace(/\/+$/, "") + "/", base);
  const endpointUrl = endpoint.href.replace(/\/$/, "");
  const maxRecent = options.maxRecent ?? 30;
  const flushInterval = options.flushIntervalMs ?? 1000;
  const statsDelay = options.serverStatsDelayMs ?? 400;
  const sameOrigin = (u: URL) => u.origin === new URL(base).origin;
  const propagateTo = options.propagateTo ?? sameOrigin;
  const sessionId = getSessionId();

  let recent: readonly RecordedRequest[] = [];
  const listeners = new Set<() => void>();
  const queue: Span[] = [];
  let original: typeof fetch | null = null;
  let installs = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = () => listeners.forEach((l) => l());
  const statsLoaded = new Set<string>();
  const upsert = (req: RecordedRequest) => {
    // A live request replaces a restored row of the same trace.
    const rest = recent.filter((r) => r.id !== req.id && !(r.restored && r.traceId === req.traceId));
    recent = [req, ...rest].slice(0, maxRecent);
    emit();
  };

  async function flush(): Promise<void> {
    if (queue.length === 0 || !original) return;
    const spans = queue.splice(0, queue.length);
    try {
      await original(`${endpointUrl}/api/client-spans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spans }),
        keepalive: true,
      });
    } catch {
      // WizeLens is a dev tool. Never break the app because it is down.
    }
  }

  function isWizeLensCall(url: URL): boolean {
    return url.origin === endpoint.origin && (url.pathname + "/").startsWith(endpoint.pathname);
  }

  function patched(orig: typeof fetch): typeof fetch {
    return async function profiledFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      let url: URL;
      try {
        url = requestUrl(input, base);
      } catch {
        return orig(input, init);
      }
      if (isWizeLensCall(url)) return orig(input, init);

      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const traceId = newTraceId();
      const spanId = newSpanId();
      const startMs = now();
      let nextInit = init;
      if (propagateTo(url)) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("traceparent", formatTraceparent(traceId, spanId, true));
        nextInit = { ...init, headers };
      }
      const record: RecordedRequest = {
        id: spanId,
        method,
        url: url.href,
        path: url.origin === new URL(base).origin ? url.pathname + url.search : url.href,
        status: null,
        durationMs: null,
        traceId,
        profiled: false,
        startMs,
        error: null,
      };
      upsert(record);

      const finish = (status: number | null, serverTrace: string | null, error: string | null) => {
        const durationMs = now() - startMs;
        const finalTrace = serverTrace ?? traceId;
        upsert({ ...record, status, durationMs, traceId: finalTrace, profiled: !!serverTrace, error });
        // The server ends its span after it sends the response, so wait a moment.
        if (serverTrace) setTimeout(() => void loadServerStats(serverTrace), statsDelay);
        const attributes: Span["attributes"] = {
          "url.full": url.href,
          "http.request.method": method,
          "http.response.status_code": status,
          "wizelens.browser.page": typeof location !== "undefined" ? location.pathname : null,
          [ATTR_BROWSER_SESSION]: sessionId,
        };
        queue.push({
          traceId: finalTrace,
          spanId,
          parentSpanId: null,
          name: `fetch ${url.pathname}`,
          kind: "client",
          category: "browser",
          service: "browser",
          startMs,
          durationMs,
          status: error || (status !== null && status >= 500) ? "error" : "unset",
          statusMessage: error,
          attributes,
          events: error
            ? [{ name: "exception", timeMs: now(), attributes: { "exception.type": "FetchError", "exception.message": error } }]
            : [],
        });
        if (queue.length >= 20) void flush();
      };

      try {
        const rewrapRequest = input instanceof Request && nextInit !== init;
        const response = rewrapRequest ? await orig(new Request(input, nextInit)) : await orig(input, nextInit);
        finish(response.status, response.headers.get(HEADER_TRACE), null);
        return response;
      } catch (err) {
        finish(null, null, err instanceof Error ? err.message : String(err));
        throw err;
      }
    };
  }

  async function loadServerStats(traceId: string, retry = true): Promise<void> {
    const get = original ?? globalThis.fetch;
    if (typeof get !== "function" || statsLoaded.has(traceId)) return;
    statsLoaded.add(traceId);
    try {
      const res = await get(`${endpointUrl}/api/traces/${traceId}?federate=true`, { headers: { Accept: "application/json" } });
      const trace = res.ok ? ((await res.json()) as Trace) : null;
      const server = trace && Array.isArray(trace.spans) ? serverStatsFromTrace(trace) : null;
      if (!server || server.durationMs === null) {
        // The trace is not complete yet. Try one more time.
        statsLoaded.delete(traceId);
        if (retry) setTimeout(() => void loadServerStats(traceId, false), 1500);
        return;
      }
      recent = recent.map((r) => (r.traceId === traceId ? { ...r, server } : r));
      emit();
    } catch {
      statsLoaded.delete(traceId);
    }
  }

  let restoring: Promise<void> | null = null;
  function restore(): Promise<void> {
    restoring ??= (async () => {
      const get = original ?? globalThis.fetch;
      if (typeof get !== "function") return;
      try {
        const q = new URLSearchParams({ session: sessionId, limit: String(maxRecent) });
        const res = await get(`${endpointUrl}/api/traces?${q}`, { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const summaries = (await res.json()) as TraceSummary[];
        if (!Array.isArray(summaries)) return;
        recent = mergeRequests(recent, summaries.map((t) => summaryToRequest(t, base)), maxRecent);
        emit();
      } catch {
        // Server down or old version: start with an empty list.
      }
    })();
    return restoring;
  }

  // Send queued spans before the page goes away, so a refresh does not lose them.
  const onPageHide = () => void flush();

  return {
    endpointUrl,
    sessionId,
    install() {
      if (typeof globalThis.fetch !== "function") return () => {};
      installs++;
      if (installs === 1) {
        original = globalThis.fetch;
        globalThis.fetch = patched(original);
        timer = setInterval(() => void flush(), flushInterval);
        if (typeof addEventListener === "function") addEventListener("pagehide", onPageHide);
        void restore();
      }
      let undone = false;
      return () => {
        if (undone) return;
        undone = true;
        installs--;
        if (installs === 0 && original) {
          void flush();
          globalThis.fetch = original;
          if (timer) clearInterval(timer);
          timer = null;
          if (typeof removeEventListener === "function") removeEventListener("pagehide", onPageHide);
        }
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => recent,
    flush,
    restore,
    loadServerStats: (traceId) => loadServerStats(traceId),
    traceLink: (id) => `${endpointUrl}/#/traces/${id}`,
    clear() {
      recent = [];
      emit();
    },
  };
}
