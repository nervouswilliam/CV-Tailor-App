import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { applicationCost, editorPayload } from "@/lib/applications";
import { logActivity } from "@/lib/store";
import { APPLICATION_STATUSES, ProbingAnswerSchema } from "@/lib/schemas";

export async function GET(req: Request, ctx: RouteContext<"/api/applications/[id]">) {
  try {
    const { id } = await ctx.params;
    if (new URL(req.url).searchParams.get("usage")) return NextResponse.json(await applicationCost(id));
    const payload = await editorPayload(id);
    if (!payload) return NextResponse.json({ error: "Application not found" }, { status: 404 });
    return NextResponse.json(payload);
  } catch (e) {
    return errorResponse(e);
  }
}

const PatchBody = z.object({
  company: z.string().trim().min(1).optional(),
  roleTitle: z.string().trim().min(1).optional(),
  jobUrl: z.string().nullable().optional(),
  jobDescription: z.string().min(1).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  saveAs: z.string().optional(),
  probingQA: z.array(ProbingAnswerSchema.extend({ queued: z.boolean().optional() })).optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/applications/[id]">) {
  try {
    const { id } = await ctx.params;
    const { probingQA, ...rest } = PatchBody.parse(await req.json());
    const before = await prisma.application.findUniqueOrThrow({ where: { id } });
    const app = await prisma.application.update({
      where: { id },
      data: { ...rest, ...(probingQA ? { probingQA: JSON.stringify(probingQA) } : {}) },
    });
    if (rest.status && rest.status !== before.status) {
      await logActivity("status", `Marked ${app.company} — ${app.roleTitle} as ${rest.status}`, id);
    }
    return NextResponse.json({ ok: true, status: app.status, saveAs: app.saveAs });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/applications/[id]">) {
  try {
    const { id } = await ctx.params;
    const app = await prisma.application.findUniqueOrThrow({ where: { id }, include: { exports: true } });
    await Promise.all(app.exports.map((e) => fs.rm(e.filePath, { force: true })));
    await prisma.application.delete({ where: { id } });
    await logActivity("delete", `Deleted application ${app.company} — ${app.roleTitle}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
