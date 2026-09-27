import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";

/** Re-download a stored export. */
export async function GET(_req: Request, ctx: RouteContext<"/api/exports/[id]">) {
  try {
    const { id } = await ctx.params;
    const exp = await prisma.export.findUnique({ where: { id } });
    if (!exp) return NextResponse.json({ error: "Export not found" }, { status: 404 });
    const bytes = await fs.readFile(exp.filePath).catch(() => null);
    if (!bytes) return NextResponse.json({ error: "The exported file is missing from data/exports." }, { status: 410 });
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${exp.filename}"` },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
