import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { addVersion, logActivity } from "@/lib/store";
import { ResumeSchema } from "@/lib/schemas";
import { ensureUniqueIds } from "@/lib/resume-utils";
import { prisma } from "@/lib/db";

const Body = z.object({
  resume: ResumeSchema,
  changeSummary: z.string().min(1).max(300),
  /** Optional activity-feed message (e.g. "Edited 3 bullets"). */
  activity: z.string().optional(),
});

/** Every accepted change (AI or manual, undo/redo, restore) is saved as a new version. */
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/versions">) {
  try {
    const { id } = await ctx.params;
    const { resume, changeSummary, activity } = Body.parse(await req.json());
    const v = await addVersion(id, ensureUniqueIds(resume), changeSummary);
    if (activity) {
      const app = await prisma.application.findUnique({ where: { id }, select: { company: true, roleTitle: true } });
      await logActivity("edit", `${activity} — ${app?.company} ${app?.roleTitle}`, id);
    }
    return NextResponse.json({ id: v.id, changeSummary: v.changeSummary, createdAt: v.createdAt, resume: v.resume });
  } catch (e) {
    return errorResponse(e);
  }
}
