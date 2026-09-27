import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { PDFDocument } from "pdf-lib";

const globalForBrowser = globalThis as unknown as { __pdfBrowser?: Promise<Browser> };

async function browser(): Promise<Browser> {
  const existing = globalForBrowser.__pdfBrowser;
  if (existing) {
    const b = await existing.catch(() => null);
    if (b?.isConnected()) return b;
  }
  globalForBrowser.__pdfBrowser = launch();
  return globalForBrowser.__pdfBrowser;
}

/**
 * Prefer an explicit channel (PDF_BROWSER_CHANNEL), then Playwright's bundled Chromium,
 * then an installed Edge / Chrome, so export still works if the Chromium download is blocked.
 */
async function launch(): Promise<Browser> {
  const env = process.env.PDF_BROWSER_CHANNEL;
  const channels: (string | undefined)[] = env ? [env] : [undefined, "msedge", "chrome"];
  const errors: string[] = [];
  for (const channel of channels) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch (e) {
      errors.push(`${channel ?? "bundled chromium"}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  throw new Error(errors.join("; "));
}

export const EXPORT_DIR = path.join(process.cwd(), "data", "exports");

export class PdfError extends Error {}

/**
 * Render a print URL (served by this app) to an A4 PDF with Playwright.
 * Returns the bytes and the page count, measured from the PDF itself.
 */
export async function renderPdf(url: string): Promise<{ pdf: Buffer; pageCount: number }> {
  let b: Browser;
  try {
    b = await browser();
  } catch (e) {
    throw new PdfError(
      `Could not start headless Chromium. Run "npx playwright install chromium". (${e instanceof Error ? e.message : e})`,
    );
  }
  const context = await b.newContext();
  const page = await context.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    if (!res || !res.ok()) throw new PdfError(`Print page returned ${res?.status() ?? "no response"}`);
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const doc = await PDFDocument.load(pdf);
    return { pdf: Buffer.from(pdf), pageCount: doc.getPageCount() };
  } finally {
    await context.close();
  }
}

export async function writeExport(filename: string, pdf: Buffer): Promise<string> {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const filePath = path.join(EXPORT_DIR, `${filename}.pdf`);
  await fs.writeFile(filePath, pdf);
  return filePath;
}
