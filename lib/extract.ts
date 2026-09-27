import "server-only";
import { unzipSync, strFromU8 } from "fflate";

export class ExtractError extends Error {}

export const ACCEPTED_EXTENSIONS = [".pdf", ".pptx", ".docx", ".txt", ".md"] as const;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** Text of each <p> paragraph in an Office XML part, joining its <t> runs. */
function officeParagraphs(xml: string, ns: "a" | "w"): string[] {
  const out: string[] = [];
  const paraRe = new RegExp(`<${ns}:p[ >][\\s\\S]*?</${ns}:p>`, "g");
  const textRe = new RegExp(`<${ns}:t(?: [^>]*)?>([\\s\\S]*?)</${ns}:t>`, "g");
  for (const raw of xml.match(paraRe) ?? []) {
    // Tabs and line breaks are separate elements; turn them into text runs so words don't run together.
    const p = raw.replace(new RegExp(`<${ns}:(tab|br)\\b[^>]*/>`, "g"), (_m, tag) => `<${ns}:t>${tag === "tab" ? "\t" : "\n"}</${ns}:t>`);
    const text = [...p.matchAll(textRe)].map((m) => decodeXml(m[1])).join("");
    if (text.trim()) out.push(text.trim());
  }
  return out;
}

function numbered(files: Record<string, Uint8Array>, re: RegExp) {
  return Object.keys(files)
    .map((name) => ({ name, n: Number(re.exec(name)?.[1]) }))
    .filter((f) => !Number.isNaN(f.n))
    .sort((a, b) => a.n - b.n);
}

function extractPptx(buf: Uint8Array): string {
  const files = unzipSync(buf, { filter: (f) => /^ppt\/(slides|notesSlides)\/\w+\d+\.xml$/.test(f.name) });
  const notes = new Map(numbered(files, /notesSlides\/notesSlide(\d+)\.xml$/).map((f) => [f.n, files[f.name]]));
  const slides = numbered(files, /slides\/slide(\d+)\.xml$/);
  if (!slides.length) throw new ExtractError("No slides found in this PowerPoint file.");
  return slides
    .map(({ name, n }) => {
      const body = officeParagraphs(strFromU8(files[name]), "a").join("\n");
      const noteXml = notes.get(n);
      // Notes slides repeat the slide number placeholder; keep only real text.
      const noteText = noteXml ? officeParagraphs(strFromU8(noteXml), "a").filter((t) => !/^\d+$/.test(t)).join("\n") : "";
      return `--- Slide ${n} ---\n${body}${noteText ? `\n[Speaker notes]\n${noteText}` : ""}`;
    })
    .join("\n\n");
}

function extractDocx(buf: Uint8Array): string {
  const files = unzipSync(buf, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new ExtractError("This Word file has no document body.");
  return officeParagraphs(strFromU8(xml), "w").join("\n");
}

async function extractPdf(buf: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // pdf.js transfers (detaches) the buffer it is given, so pass a copy: the caller still needs the bytes to save the file.
  const pdf = await getDocumentProxy(buf.slice(), { verbosity: 0 }); // verbosity 0 silences pdf.js font warnings
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join("\n\n");
}

/** Extract plain text from an uploaded document. */
export async function extractDocumentText(buf: Uint8Array, filename: string): Promise<string> {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  let text: string;
  try {
    if (ext === ".pdf") text = await extractPdf(buf);
    else if (ext === ".pptx") text = extractPptx(buf);
    else if (ext === ".docx") text = extractDocx(buf);
    else if (ext === ".txt" || ext === ".md") text = new TextDecoder().decode(buf);
    else throw new ExtractError(`Unsupported file type "${ext}". Use PDF, PPTX, DOCX, TXT or MD.`);
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    throw new ExtractError(`Could not read ${filename}: ${e instanceof Error ? e.message : e}`);
  }
  const cleaned = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const letters = cleaned.replace(/--- (Page|Slide) \d+ ---/g, "").replace(/\s/g, "").length;
  if (letters < 20) {
    throw new ExtractError(
      ext === ".pdf"
        ? "No text found in this PDF. It is probably scanned images; export it with selectable text (or OCR it) and try again."
        : "No text found in this file.",
    );
  }
  return cleaned;
}
