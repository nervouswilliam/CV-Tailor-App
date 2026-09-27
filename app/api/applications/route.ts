import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { newRowId } from "@/lib/ids";
import { errorResponse } from "@/lib/http";
import { ResumeSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const apps = await prisma.application.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        versions: { orderBy: { createdAt: "desc" }, take: 1 },
        exports: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { versions: true } },
      },
    });
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const generated = apps.filter((a) => a._count.versions > 0);
    return NextResponse.json({
      stats: {
        total: generated.length,
        thisWeek: generated.filter((a) => a.createdAt.getTime() >= weekAgo).length,
        mostRecentCompany: generated[0]?.company ?? null,
      },
      applications: apps.map((a) => ({
        id: a.id,
        company: a.company,
        roleTitle: a.roleTitle,
        status: a.status,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        versionCount: a._count.versions,
        resume: a.versions[0] ? ResumeSchema.parse(JSON.parse(a.versions[0].resume)) : null,
        lastExport: a.exports[0] ? { id: a.exports[0].id, filename: a.exports[0].filename, createdAt: a.exports[0].createdAt } : null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const CreateBody = z.object({
  company: z.string().trim().min(1, "Company is required"),
  roleTitle: z.string().trim().min(1, "Role title is required"),
  jobUrl: z.string().trim().optional().nullable(),
  jobDescription: z.string().trim().min(50, "Paste the full job description (at least a few sentences)."),
});

export async function POST(req: Request) {
  try {
    const data = CreateBody.parse(await req.json());
    const app = await prisma.application.create({
      data: { id: newRowId(), ...data, jobUrl: data.jobUrl || null },
    });
    return NextResponse.json(app);
  } catch (e) {
    return errorResponse(e);
  }
}
