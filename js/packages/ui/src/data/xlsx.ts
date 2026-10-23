// The first sheet of an Excel (.xlsx) file as rows of text, read in the browser with no library: a zip of XML parts.

const MAX_PART = 50 * 1024 * 1024;

type Parts = Map<string, () => Promise<string>>;

/** The zip's files by name, each read on demand. Only stored and deflated files, which is all Excel writes. */
function zipParts(buf: ArrayBuffer): Parts {
  const v = new DataView(buf);
  let end = buf.byteLength - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("This is not an Excel (.xlsx) file.");
  const parts: Parts = new Map();
  let at = v.getUint32(end + 16, true);
  for (let n = v.getUint16(end + 10, true); n > 0; n--) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("The Excel file is damaged.");
    const [method, size, full] = [v.getUint16(at + 10, true), v.getUint32(at + 20, true), v.getUint32(at + 24, true)];
    const [nameLen, extraLen, noteLen, local] = [v.getUint16(at + 28, true), v.getUint16(at + 30, true), v.getUint16(at + 32, true), v.getUint32(at + 42, true)];
    const name = new TextDecoder().decode(new Uint8Array(buf, at + 46, nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (full <= MAX_PART) parts.set(name, () => unzipOne(new Uint8Array(buf, start, size), method));
    at += 46 + nameLen + extraLen + noteLen;
  }
  return parts;
}

async function unzipOne(data: Uint8Array, method: number): Promise<string> {
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw new Error("The Excel file uses a kind of compression this page cannot read.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const all = (node: Document | Element, tag: string) => [...node.getElementsByTagNameNS("*", tag)];
/** A cell's or shared string's text: its runs joined, without phonetic guides. */
const textOf = (node: Element) => all(node, "t").filter((t) => t.parentElement?.localName !== "rPh").map((t) => t.textContent ?? "").join("");

/** The path of the workbook's first sheet, from its relationships. */
async function firstSheet(parts: Parts): Promise<string> {
  const book = xml(await parts.get("xl/workbook.xml")!());
  const rid = all(book, "sheet")[0]?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const rels = parts.get("xl/_rels/workbook.xml.rels");
  const target = rels && rid ? all(xml(await rels()), "Relationship").find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target") : null;
  if (!target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

/** The column of a cell reference: "C7" is 2. */
function columnOf(ref: string | null, fallback: number): number {
  const letters = /^[A-Z]+/.exec(ref ?? "")?.[0];
  if (!letters) return fallback;
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function cellText(c: Element, shared: string[]): string {
  const type = c.getAttribute("t");
  const value = all(c, "v")[0]?.textContent ?? "";
  if (type === "s") return shared[Number(value)] ?? "";
  if (type === "inlineStr") return textOf(c);
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  return value;
}

/** Every row of the first sheet; a missing cell is "". */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const parts = zipParts(buf);
  if (!parts.has("xl/workbook.xml")) throw new Error("This is not an Excel (.xlsx) file. Old .xls files: save as .xlsx or CSV first.");
  const strings = parts.get("xl/sharedStrings.xml");
  const shared = strings ? all(xml(await strings()), "si").map(textOf) : [];
  const sheet = parts.get(await firstSheet(parts));
  if (!sheet) throw new Error("The Excel file has no sheet.");
  return all(xml(await sheet()), "row").map((row) => {
    const out: string[] = [];
    all(row, "c").forEach((c, i) => (out[columnOf(c.getAttribute("r"), i)] = cellText(c, shared)));
    return Array.from(out, (cell) => cell ?? "");
  });
}
