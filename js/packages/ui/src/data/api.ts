/** An API answer that was not OK. `status` 401 means "sign in". */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 20_000;

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`);
  return body as T;
}

/** GET a JSON answer from this dashboard's API. */
export const apiFetch = async <T>(url: string): Promise<T> =>
  parse<T>(await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin", signal: AbortSignal.timeout(TIMEOUT_MS) }));

/** Send a change. The header tells the server it comes from the dashboard, not from another site. */
export const apiSend = async <T = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<T> =>
  parse<T>(
    await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-WizeLens-Client": "dashboard" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  );
