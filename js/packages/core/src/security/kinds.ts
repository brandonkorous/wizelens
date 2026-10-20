// Security finding kinds and their OWASP Top 10:2025 categories (docs/SECURITY-PLAN.md).

/** Kinds found in one trace. */
export const TRACE_SECURITY_KINDS = [
  "sql-injection",
  "missing-headers",
  "version-header",
  "cors",
  "cookie-flags",
  "secret-in-url",
  "plain-http",
  "ssrf",
  "stack-exposed",
  "exposed-path",
  "open-admin",
  "secret-leak",
] as const;

export type TraceSecurityKind = (typeof TRACE_SECURITY_KINDS)[number];

/** Every security kind: the trace ones, failed sign-ins from rollups, and known-vulnerable packages. */
export type SecurityKind = TraceSecurityKind | "auth-guessing" | "vulnerable-package";

export type OwaspId = "A01" | "A02" | "A03" | "A04" | "A05" | "A06" | "A07" | "A08" | "A09" | "A10";

/** The OWASP Top 10:2025 categories, in order. */
export const OWASP_CATEGORIES: readonly { id: OwaspId; name: string }[] = [
  { id: "A01", name: "Broken Access Control" },
  { id: "A02", name: "Security Misconfiguration" },
  { id: "A03", name: "Software Supply Chain Failures" },
  { id: "A04", name: "Cryptographic Failures" },
  { id: "A05", name: "Injection" },
  { id: "A06", name: "Insecure Design" },
  { id: "A07", name: "Authentication Failures" },
  { id: "A08", name: "Software or Data Integrity Failures" },
  { id: "A09", name: "Security Logging and Alerting Failures" },
  { id: "A10", name: "Mishandling of Exceptional Conditions" },
];

/** The category of each kind. */
export const OWASP_OF: Record<SecurityKind, OwaspId> = {
  "open-admin": "A01",
  ssrf: "A01",
  "missing-headers": "A02",
  "version-header": "A02",
  cors: "A02",
  "exposed-path": "A02",
  "vulnerable-package": "A03",
  "cookie-flags": "A04",
  "plain-http": "A04",
  "secret-in-url": "A04",
  "sql-injection": "A05",
  "auth-guessing": "A07",
  "secret-leak": "A09",
  "stack-exposed": "A10",
};

const ALL: ReadonlySet<string> = new Set<string>([...TRACE_SECURITY_KINDS, "auth-guessing", "vulnerable-package"]);

/** True for a security finding kind. */
export const isSecurityKind = (kind: string): kind is SecurityKind => ALL.has(kind);

/** Short badge text of each kind. */
export const SECURITY_LABELS: Record<SecurityKind, string> = {
  "sql-injection": "SQL injection",
  "missing-headers": "Headers",
  "version-header": "Version",
  cors: "CORS",
  "cookie-flags": "Cookie",
  "secret-in-url": "Secret in URL",
  "plain-http": "Plain HTTP",
  ssrf: "SSRF",
  "stack-exposed": "Stack trace",
  "exposed-path": "Exposed path",
  "open-admin": "Open admin",
  "secret-leak": "Secret leak",
  "auth-guessing": "Sign-in guessing",
  "vulnerable-package": "Vulnerable package",
};
