// Résumé text extraction runs entirely in the browser. Files never leave the device;
// only the extracted text is sent to the AI, and only after explicit consent.
import { unzipSync, strFromU8 } from "fflate";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Same cap the server enforces. About 4,500 words: far more than a normal résumé. */
export const MAX_RESUME_CHARS = 30000;

export function normalizeText(s: string) {
  return s
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pdfText(buf: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""));
  }
  await task.destroy();
  return pages.join("\n\n");
}

function docxText(buf: ArrayBuffer) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("Not a valid .docx file");
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function extractResume(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 5 MB.");
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  let text: string;
  if (name.endsWith(".pdf") || file.type === "application/pdf") text = await pdfText(buf);
  else if (name.endsWith(".docx")) text = docxText(buf);
  else if (name.endsWith(".txt") || name.endsWith(".md")) text = new TextDecoder().decode(buf);
  else throw new Error("Use a PDF, DOCX or TXT file.");
  text = normalizeText(text);
  if (text.length < 200) throw new Error("We couldn't read enough text. If it's a scanned PDF, paste the text instead.");
  return text.slice(0, MAX_RESUME_CHARS);
}
