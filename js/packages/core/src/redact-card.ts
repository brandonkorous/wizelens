// Card numbers: a digit run is one only with a real card brand's prefix and length, a valid Luhn sum, and no sign it is a count or an id.

/** Card brands by prefix, with the lengths they issue: Visa, Mastercard (51-55, 2221-2720), Amex, Diners, JCB, Discover, UnionPay. */
const BRANDS: readonly [RegExp, readonly number[]][] = [
  [/^4/, [13, 16, 19]],
  [/^(?:5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/, [16]],
  [/^3[47]/, [15]],
  [/^3(?:0[0-5]|[689])/, [14, 15, 16, 17, 18, 19]],
  [/^35(?:2[89]|[3-8]\d)/, [16, 17, 18, 19]],
  [/^6(?:011|4[4-9]|5)/, [16, 17, 18, 19]],
  [/^62/, [16, 17, 18, 19]],
];

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

/** A card number: a brand's prefix and length, and Luhn valid. */
export function isCardNumber(match: string): boolean {
  const digits = match.replace(/[ -]/g, "");
  return BRANDS.some(([prefix, lengths]) => prefix.test(digits) && lengths.includes(digits.length)) && luhnValid(digits);
}

/** Attribute keys that hold counts, sizes, times, and ids: their digits are never a card number. */
const NUMERIC_KEY = /(?:^|[._-])(?:count|counts|total|sum|size|length|len|rows|bytes|ms|seconds|duration|slots|qty|quantity|amount|offset|limit|seq|version|timestamp|time|id|ids|uuid|rand|random|seed|nonce)$/i;

/** True for a key whose value is a number of something or an id, so the card pattern skips it. */
export const isNumericKey = (key: string): boolean => NUMERIC_KEY.test(key);

/** A JSON or `key=value` label right before a match that names a count or an id (`"remaining_count": `). */
const NUMERIC_LABEL = /(?:count|total|sum|size|length|rows|bytes|ms|slots|qty|quantity|amount|offset|limit|seq|version|timestamp|id|ids|rand|seed|nonce)["']?\s*[:=]\s*["']?$/i;

/** True when a digit run is part of a decimal number (`0.4111…`, `4111….5`) or follows a count or id label. */
export function numericContext(text: string, at: number, length: number): boolean {
  const before = text.slice(Math.max(0, at - 40), at);
  const after = text.slice(at + length, at + length + 2);
  return /\d[.,]$/.test(before) || /^[.,]\d/.test(after) || NUMERIC_LABEL.test(before);
}
