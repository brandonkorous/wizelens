// Redaction by value: secrets found inside any text become a typed marker such as "[redacted:jwt]" (docs/CONTRACT.md "Redaction").

/** The kinds of secret found by pattern. */
export type SecretKind = "jwt" | "aws-key" | "private-key" | "stripe-key" | "github-token" | "slack-token" | "google-key" | "card";

interface ValuePattern {
  kind: SecretKind;
  /** A cheap test first: the regex runs only when the text holds this. */
  hint: (text: string) => boolean;
  re: RegExp;
}

const has = (needle: string) => (text: string) => text.includes(needle);

/** The patterns, in the order they run. A card number runs last, so a key's digits are already gone. */
export const VALUE_PATTERNS: readonly ValuePattern[] = [
  { kind: "private-key", hint: has("PRIVATE KEY-----"), re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)/g },
  { kind: "jwt", hint: has("eyJ"), re: /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g },
  { kind: "aws-key", hint: (t) => t.includes("AKIA") || t.includes("ASIA"), re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "stripe-key", hint: (t) => t.includes("_live_") || t.includes("_test_") || t.includes("whsec_"), re: /\b(?:(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}|whsec_[0-9A-Za-z]{20,})\b/g },
  { kind: "github-token", hint: (t) => t.includes("gh") || t.includes("github_pat_"), re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { kind: "slack-token", hint: has("xox"), re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "google-key", hint: has("AIza"), re: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { kind: "card", hint: (t) => /\d{4}/.test(t), re: /\b\d(?:[ -]?\d){12,18}\b/g },
];

/** The marker a secret of this kind becomes. */
export const secretMarker = (kind: SecretKind): string => `[redacted:${kind}]`;

/** Markers in a text, as `[redacted:kind]` finds them. */
export const MARKER_RE = /\[redacted:([a-z-]+)\]/g;

/** True for digits that pass the Luhn check. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/** A card number: 13 to 19 digits, the first 3 to 6, Luhn valid. */
export function isCardNumber(match: string): boolean {
  const digits = match.replace(/[ -]/g, "");
  return digits.length >= 13 && digits.length <= 19 && digits[0]! >= "3" && digits[0]! <= "6" && luhnValid(digits);
}

/** The text with every secret found by pattern replaced by its marker. */
export function redactText(text: string): string {
  let out = text;
  for (const p of VALUE_PATTERNS) {
    if (!p.hint(out)) continue;
    p.re.lastIndex = 0;
    out = out.replace(p.re, (m) => (p.kind !== "card" || isCardNumber(m) ? secretMarker(p.kind) : m));
  }
  return out;
}

/** Keys whose values are ids and sampling numbers, never secrets: value patterns skip them (a `sample_rand` passes Luhn). */
const PATTERN_FREE_KEY = /(?:^|\.)baggage$/;

/** True for an attribute key that value patterns leave alone. */
export const skipsValuePatterns = (key: string): boolean => PATTERN_FREE_KEY.test(key.toLowerCase());
