// What each security risk means, in one or two sentences, for the Security page, exports, and MCP.
import type { SecurityKind } from "../security/kinds.js";

const TEXT: Record<SecurityKind, (shape: string, ep: string) => string> = {
  "sql-injection": (_, ep) => `A value from the request is part of the SQL text in ${ep}. Pass it as a parameter, not in the text.`,
  "missing-headers": (shape, ep) => `${ep} answers without ${shape}. Set them on every answer, in middleware or at the proxy.`,
  "version-header": (shape, ep) => `${ep} sends "${shape}". It tells an attacker which software and version to look up. Remove the header or its version.`,
  cors: (shape, ep) => `${ep} sends ${shape}. Allow a list of known origins instead.`,
  "cookie-flags": (shape, ep) => `${ep} sets ${shape}. Add the missing flags where the cookie is set.`,
  "secret-in-url": (shape) => `${shape} carries a secret in the URL. URLs end up in logs, browser history, and Referer headers. Send it in a header or the body.`,
  "plain-http": (shape, ep) => `${ep} calls ${shape} over plain HTTP, so anyone on the network can read or change it. Use HTTPS.`,
  ssrf: (shape, ep) => `In ${ep}, a value from the request decides where the server calls (${shape}). Allow only known hosts.`,
  "stack-exposed": (_, ep) => `${ep} sends a stack trace in its error answers. Log the trace, and send a short message instead.`,
  "exposed-path": (shape) => `${shape} answered with success. Block it at the server or the proxy, and remove the file if it is not needed.`,
  "open-admin": (_, ep) => `${ep} answered with no user and no credentials. Check that the route requires sign-in and a role.`,
  "secret-leak": (shape, ep) => `${shape} in ${ep}. WizeLens hid it, but your logs and other tools may keep it. Stop writing it, and rotate it.`,
  "auth-guessing": (_, ep) => `Many sign-ins failed at ${ep} from the same addresses.`,
  "vulnerable-package": (shape) => `${shape} has a known vulnerability. Update it to a fixed version.`,
};

/** One risk's description, about its newest endpoint. */
export const describeSecurity = (kind: SecurityKind, shape: string, endpoint: string): string => TEXT[kind](shape, endpoint);
