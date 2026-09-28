import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { newRowId } from "@/lib/ids";
import { errorResponse } from "@/lib/http";
import { PdfError, renderPdf, writeExport } from "@/lib/pdf";
import { getProfile, logActivity } from "@/lib/store";
import { defaultSaveAs, sanitiseFilename } from "@/lib/resume-utils";
import fs from "node:fs/promises";
import path from "node:path";
import { PathError, getPreferences, resolveExportDir } from "@/lib/local-files";

const Body = z.object({
  filename: z.string().optional(),
  versionId: z.string().optional(),
  check: z.boolean().optional(),
  /** Also write the PDF into the user's chosen folder (Settings/editor "Save to"). */
  toFolder: z.boolean().optional(),
});

/**
 * Render the (latest or given) version to an A4 PDF with Playwright.
 * `check: true` only measures the page count; otherwise the PDF is saved to
 * data/exports/<filename>.pdf, recorded, and returned for download.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/export">) {
  try {
    const { id } = await ctx.params;
    const body = Body.parse(await req.json());
    const version = body.versionId
      ? await prisma.resumeVersion.findFirstOrThrow({ where: { id: body.versionId, applicationId: id } })
      : await prisma.resumeVersion.findFirstOrThrow({ where: { applicationId: id }, orderBy: { createdAt: "desc" } });

    const origin = new URL(req.url).origin;
    const { pdf, pageCount } = await renderPdf(`${origin}/print/${id}?version=${version.id}`);
    if (body.check) return NextResponse.json({ pageCount });

    const current = await prisma.application.findUniqueOrThrow({ where: { id } });
    const filename = sanitiseFilename(
      body.filename || current.saveAs || defaultSaveAs((await getProfile()).personal.name, current.company, current.roleTitle),
    );
    const filePath = await writeExport(filename, pdf);
    const app = await prisma.application.update({ where: { id }, data: { saveAs: filename } });
    const exp = await prisma.export.create({
      data: { id: newRowId(), applicationId: id, versionId: version.id, filename: `${filename}.pdf`, filePath, pageCount },
    });
    // Copy into the chosen folder, if one is set. On failure the browser download still happens.
    let savedPath = "";
    let saveError = "";
    if (body.toFolder) {
      const { exportDir } = await getPreferences();
      if (exportDir) {
        try {
          const dir = await resolveExportDir(exportDir);
          savedPath = path.join(dir, `${filename}.pdf`);
          await fs.writeFile(savedPath, pdf);
        } catch (e) {
          savedPath = "";
          saveError = e instanceof PathError ? e.message : `Could not write to ${exportDir}: ${e instanceof Error ? e.message : e}`;
        }
      }
    }

    await logActivity("export", `Exported PDF ${filename}.pdf — ${app.company} ${app.roleTitle}${pageCount > 1 ? ` (${pageCount} pages)` : ""}`, id);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        "X-Page-Count": String(pageCount),
        "X-Export-Id": exp.id,
        ...(savedPath ? { "X-Saved-Path": encodeURIComponent(savedPath) } : {}),
        ...(saveError ? { "X-Save-Error": encodeURIComponent(saveError) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof PdfError) return NextResponse.json({ error: e.message, code: "pdf" }, { status: 500 });
    return errorResponse(e);
  }
}
