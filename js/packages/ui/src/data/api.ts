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

let refused: () => void = () => undefined;
/** Called when the server says "sign in" (401): the account code checks who is signed in, so a lost session shows the sign-in form. */
export const onRefused = (fn: () => void): void => void (refused = fn);
/** Note an answer's status; every dashboard call passes through here. */
export const noteStatus = (status: number): void => void (status === 401 && refused());

async function parse<T>(res: Response): Promise<T> {
  noteStatus(res.status);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  // Our routes answer `error`; Better Auth's (plans, members, sign-on) answer `message`.
  const said = body as { error?: unknown; message?: unknown } | undefined;
  const why = typeof said?.error === "string" ? said.error : typeof said?.message === "string" ? said.message : "";
  if (!res.ok) throw new ApiError(res.status, why || `HTTP ${res.status}`);
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
