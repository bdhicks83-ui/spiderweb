// PDF page-splitting helpers (pure pdf-lib, serverless-safe).
// Used to break a large PDF into small page-range chunks so each Claude
// transcription call stays well under output-token and function-timeout limits.
import { PDFDocument } from "pdf-lib";

export async function getPageCount(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return doc.getPageCount();
}

// Extract pages [start, endExclusive) into a new PDF, returned as base64.
export async function extractPageRangeBase64(
  buffer: Buffer,
  start: number,
  endExclusive: number
): Promise<string> {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = start; i < endExclusive; i++) indices.push(i);
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  const bytes = await out.save();
  return Buffer.from(bytes).toString("base64");
}

// How many pages to transcribe per Claude call. Small enough that ~15 pages of
// dense text still fits comfortably under an 8k-token output budget, and each
// call stays short enough to survive even a 60s serverless timeout.
export const PAGES_PER_CHUNK = 10;
