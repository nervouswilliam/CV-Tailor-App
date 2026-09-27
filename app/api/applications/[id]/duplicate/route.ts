import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { newRowId } from "@/lib/ids";
import { errorResponse } from "@/lib/http";
import { logActivity } from "@/lib/store";

/** Start a new application pre-filled from an existing one (JD, analysis, answers and latest resume). */
export async function POST(_req: Request, ctx: RouteContext<"/api/applications/[id]/duplicate">) {
  try {
    const { id } = await ctx.params;
    const src = await prisma.application.findUniqueOrThrow({
      where: { id },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const copy = await prisma.application.create({
      data: {
        id: newRowId(),
        company: src.company,
        roleTitle: `${src.roleTitle} (copy)`,
        jobUrl: src.jobUrl,
        jobDescription: src.jobDescription,
        analysis: src.analysis,
        probingQA: src.probingQA,
        rationale: src.rationale,
        status: "Draft",
      },
    });
    if (src.versions[0]) {
      await prisma.resumeVersion.create({
        data: { id: newRowId(), applicationId: copy.id, resume: src.versions[0].resume, changeSummary: `Duplicated from ${src.company} — ${src.roleTitle}` },
      });
    }
    await logActivity("duplicate", `Duplicated ${src.company} — ${src.roleTitle}`, copy.id);
    return NextResponse.json({ id: copy.id, hasResume: !!src.versions[0] });
  } catch (e) {
    return errorResponse(e);
  }
}
