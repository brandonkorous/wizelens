import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import type { AuthSecret } from "../auth/secret.js";

// Check headers often hold tokens, so they are stored encrypted with the auth secret ("v<version>:<ciphertext>"), like 2FA secrets.

/** Headers as stored: encrypted with the newest secret, or "{}" when there are none. */
export async function sealHeaders(secrets: readonly AuthSecret[], headers: Record<string, string>): Promise<string> {
  if (Object.keys(headers).length === 0) return "{}";
  const s = secrets[0]!;
  return `v${s.version}:${await symmetricEncrypt({ key: s.value, data: JSON.stringify(headers) })}`;
}

/** Headers from storage. A secret that is no longer configured opens nothing: the check then runs without its headers. */
export async function openHeaders(secrets: readonly AuthSecret[], stored: string): Promise<Record<string, string>> {
  const m = /^v(\d+):(.+)$/s.exec(stored);
  if (!m) return JSON.parse(stored) as Record<string, string>;
  const secret = secrets.find((s) => s.version === Number(m[1]));
  if (!secret) return {};
  try {
    return JSON.parse(await symmetricDecrypt({ key: secret.value, data: m[2]! })) as Record<string, string>;
  } catch {
    return {};
  }
}
