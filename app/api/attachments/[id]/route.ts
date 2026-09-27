import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { deleteAttachment, summariseAttachment, toDto } from "@/lib/attachments";

/** Download the original file (?download=1), or get the attachment with its extracted text. */
export async function GET(req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const { id } = await ctx.params;
    const a = await prisma.attachment.findUnique({ where: { id } });
    if (!a) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    if (new URL(req.url).searchParams.get("download")) {
      const bytes = await fs.readFile(a.filePath).catch(() => null);
      if (!bytes) return NextResponse.json({ error: "The file is missing from data/attachments." }, { status: 410 });
      return new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": a.mimeType, "Content-Disposition": `inline; filename="${encodeURIComponent(a.filename)}"` },
      });
    }
    return NextResponse.json({ ...toDto(a), extractedText: a.extractedText });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Re-run the AI summary (e.g. after an error, or after the profile changed). */
export async function POST(_req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const { id } = await ctx.params;
    const a = await prisma.attachment.update({ where: { id }, data: { status: "processing", error: null } });
    void summariseAttachment(id);
    return NextResponse.json(toDto(a));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Mark the summary's form fields as applied to the profile item ({ fieldsApplied: true }). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const { id } = await ctx.params;
    const { fieldsApplied } = (await req.json()) as { fieldsApplied?: boolean };
    const a = await prisma.attachment.findUnique({ where: { id } });
    if (!a?.summary) return NextResponse.json({ error: "Attachment has no summary yet" }, { status: 409 });
    const summary = { ...JSON.parse(a.summary), fieldsApplied: Boolean(fieldsApplied) };
    const updated = await prisma.attachment.update({ where: { id }, data: { summary: JSON.stringify(summary) } });
    return NextResponse.json(toDto(updated));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const { id } = await ctx.params;
    await deleteAttachment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
