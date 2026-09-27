import { renderPdf } from "@/lib/pdf";
import { errorResponse } from "@/lib/http";

/** Render the built-in sample resume to PDF (template / Playwright smoke test). */
export async function GET(req: Request) {
  try {
    const { pdf, pageCount } = await renderPdf(`${new URL(req.url).origin}/print/sample`);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="sample.pdf"',
        "X-Page-Count": String(pageCount),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
