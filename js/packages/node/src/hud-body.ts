const CLOSE = "</body>";
// A `</body>` split over two chunks has at most this many bytes in the first one.
const SPLIT = CLOSE.length - 1;
// Past this much held text after a `</body>`, that one is let go: the page streams on, and a later one can still take the tag.
const HOLD_LIMIT = 64 * 1024;

/** Index of the last `</body>` in the bytes, in any case, or -1. Latin-1 keeps one char per byte, so the index is a byte index. */
export function lastBodyClose(bytes: Buffer): number {
  return bytes.toString("latin1").toLowerCase().lastIndexOf(CLOSE);
}

/** Holds the end of a streamed HTML body so the tag goes right before its last `</body>`, even one split over chunks. */
export class BodySplicer {
  readonly #tag: Buffer;
  #held: Buffer = Buffer.alloc(0);

  constructor(tag: string) {
    this.#tag = Buffer.from(tag, "utf8");
  }

  /** Take one chunk; returns the bytes that can go out now. */
  push(chunk: Buffer): Buffer {
    const all = this.#held.length ? Buffer.concat([this.#held, chunk]) : chunk;
    const at = lastBodyClose(all);
    const tail = Math.max(0, all.length - SPLIT);
    const from = at >= 0 && all.length - at <= HOLD_LIMIT ? at : tail;
    // A copy: the app may reuse its buffer once the write returns.
    this.#held = Buffer.from(all.subarray(from));
    return all.subarray(0, from);
  }

  /** The rest of the body, with the tag before the last `</body>` when there is one. */
  finish(chunk: Buffer): Buffer {
    const all = this.#held.length ? Buffer.concat([this.#held, chunk]) : chunk;
    this.#held = Buffer.alloc(0);
    const at = lastBodyClose(all);
    return at < 0 ? all : Buffer.concat([all.subarray(0, at), this.#tag, all.subarray(at)]);
  }
}
