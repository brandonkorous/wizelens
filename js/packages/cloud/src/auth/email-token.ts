/** The current email in a confirm link (a JWT Better Auth checks itself), when the link changes the email. */
export function emailChangeOf(token: unknown): string | undefined {
  return changeOf(token)?.from;
}

/** Both addresses of an email-change link: `from` is the address before the change. */
export function changeOf(token: unknown): { from: string; to: string } | undefined {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown; updateTo?: unknown };
    return typeof payload.updateTo === "string" && typeof payload.email === "string" ? { from: payload.email, to: payload.updateTo } : undefined;
  } catch {
    return undefined;
  }
}
