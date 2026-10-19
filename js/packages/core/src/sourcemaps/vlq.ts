// Base64 VLQ decoding of a source map's `mappings` (Source Map v3).

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) VALUE[B64.charCodeAt(i)] = i;

/** One mapping, all 0-based: generated column, then source index, source line, source column, and name index when present. */
export type MapSegment = readonly number[];

interface Cursor {
  text: string;
  i: number;
}

function readVlq(c: Cursor): number {
  let result = 0;
  let shift = 0;
  let digit: number;
  do {
    const code = c.text.charCodeAt(c.i++);
    digit = code < 128 ? VALUE[code]! : -1;
    if (digit < 0) throw new Error("Not a valid source map mapping.");
    result += (digit & 31) * 2 ** shift;
    shift += 5;
  } while (digit & 32);
  const value = Math.floor(result / 2);
  return result % 2 === 1 ? -value : value;
}

const hasField = (c: Cursor) => c.i < c.text.length && c.text[c.i] !== "," && c.text[c.i] !== ";";

/** Every generated line's segments, in column order. Source, line, column, and name carry over from line to line. */
export function decodeMappings(mappings: string): MapSegment[][] {
  const lines: number[][][] = [[]];
  const c: Cursor = { text: mappings, i: 0 };
  let col = 0;
  const carry = [0, 0, 0, 0];
  while (c.i < mappings.length) {
    const ch = mappings[c.i];
    if (ch === ";") {
      lines.push([]);
      col = 0;
      c.i++;
    } else if (ch === ",") c.i++;
    else {
      col += readVlq(c);
      const seg = [col];
      for (let f = 0; f < 4 && hasField(c); f++) seg.push((carry[f]! += readVlq(c)));
      lines[lines.length - 1]!.push(seg);
    }
  }
  for (const line of lines) line.sort((a, b) => a[0]! - b[0]!);
  return lines;
}

/** Encode decoded segments (absolute values, as decodeMappings returns them) back into a `mappings` string. */
export function encodeMappings(lines: readonly (readonly MapSegment[])[]): string {
  const carry = [0, 0, 0, 0];
  return lines
    .map((line) => {
      let col = 0;
      return line
        .map((seg) => {
          let out = encodeVlq(seg[0]! - col);
          col = seg[0]!;
          for (let f = 1; f < seg.length; f++) (out += encodeVlq(seg[f]! - carry[f - 1]!)), (carry[f - 1] = seg[f]!);
          return out;
        })
        .join(",");
    })
    .join(";");
}

/** Encode one number as base64 VLQ (tests and tools build maps with it). */
export function encodeVlq(value: number): string {
  let v = value < 0 ? -value * 2 + 1 : value * 2;
  let out = "";
  do {
    let digit = v & 31;
    v = Math.floor(v / 32);
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
}
