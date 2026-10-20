import type { SecurityKind } from "@wizeworks/lens-core";
import type { Advice } from "../insights/advice";

export const SECURITY_ADVICE: Record<SecurityKind, Advice> = {
  "sql-injection": {
    why: "A value the caller sent is part of the SQL text. A caller who sends a quote can change the query: read other rows, change data, or drop tables.",
    fix: ["Pass the value as a parameter (@id, $1, ?) instead of building the text.", "With an ORM, use its query builder, not raw SQL with string joins.", "Check the result in WizeLens: the query text shows ? or $1, and the value moves to the parameters."],
  },
  "missing-headers": {
    why: "Browsers use these headers to block attacks: guessing content types, framing the page in another site (clickjacking), running injected scripts, and falling back to plain HTTP.",
    fix: ["Add X-Content-Type-Options: nosniff to every answer.", "For HTML: add a Content-Security-Policy, and frame-ancestors (or X-Frame-Options: DENY).", "Over HTTPS: add Strict-Transport-Security: max-age=31536000.", "Set them once, in middleware (Helmet, NWebsec) or at the proxy."],
  },
  "version-header": {
    why: "The header names the software and its version. An attacker can look up known bugs for that exact version without testing anything.",
    fix: ["Remove X-Powered-By (Express: app.disable('x-powered-by')).", "Remove the version from Server (Kestrel: AddServerHeader = false; nginx: server_tokens off)."],
  },
  cors: {
    why: "Any site can call this API from a signed-in user's browser and read the answer, or a sandboxed page with the null origin can.",
    fix: ["Allow a fixed list of your own origins.", "Never allow the null origin.", "Send Access-Control-Allow-Credentials only to origins you trust."],
  },
  "cookie-flags": {
    why: "Without Secure, the cookie can travel over plain HTTP. Without HttpOnly, any script on the page (an injected one too) can read the session.",
    fix: ["Set Secure on every cookie served over HTTPS.", "Set HttpOnly on session and auth cookies.", "Set SameSite=Lax or Strict, and use SameSite=None only with Secure."],
  },
  "secret-in-url": {
    why: "URLs are kept in server and proxy logs, browser history, and the Referer header of the next page. A secret there leaks to all of them.",
    fix: ["Send tokens in the Authorization header or the body.", "For one-time links (password reset), make the token short-lived and single use.", "Rotate any key that was sent this way."],
  },
  "plain-http": {
    why: "Anyone on the network path can read the call or change it, including the credentials it sends.",
    fix: ["Call the https:// address.", "If the service has no HTTPS, put it behind a TLS proxy or a private network."],
  },
  ssrf: {
    why: "The caller decides where your server sends a request. They can make it reach internal services or the cloud metadata address, from inside your network.",
    fix: ["Allow only a fixed list of hosts.", "Resolve the host and refuse private, loopback, and link-local addresses.", "Do not follow redirects to other hosts."],
  },
  "stack-exposed": {
    why: "A stack trace shows file paths, library versions, and code structure. It helps an attacker plan the next step.",
    fix: ["Log the exception on the server.", "Send a short message and an error id to the caller.", "Turn off developer error pages in production."],
  },
  "exposed-path": {
    why: "Files like .env and .git hold secrets and source code. Debug pages show memory, settings, and environment variables. Scanners look for them all day.",
    fix: ["Remove the file from the deployed app.", "Block these paths at the server or the proxy.", "If .env was open, rotate every secret in it."],
  },
  "open-admin": {
    why: "An admin route did its work for a caller with no user and no credentials. Anyone who finds the URL can use it.",
    fix: ["Require sign-in and an admin role on the whole admin area, not route by route.", "Add a test that calls the route without credentials and expects 401."],
  },
  "secret-leak": {
    why: "A secret was written to logs, span data, or an answer. WizeLens hid it, but your other logs, tools, and their backups may keep a copy.",
    fix: ["Find the code that writes it and stop writing it.", "Rotate the secret: treat it as known.", "Card numbers: never log or return the full number, only the last 4 digits."],
  },
  "auth-guessing": {
    why: "Many failed sign-ins from one address look like password guessing or credential stuffing (passwords from other leaks).",
    fix: ["Rate-limit sign-in by address and by account, and answer 429.", "Lock or slow down an account after repeated failures.", "Offer two-factor sign-in."],
  },
  "vulnerable-package": {
    why: "A package this service runs has a published vulnerability. Attackers use the public advisories.",
    fix: ["Update the package to the fixed version.", "If no fix exists, read the advisory for a workaround."],
  },
};
