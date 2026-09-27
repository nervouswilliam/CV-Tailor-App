import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { newRowId } from "@/lib/ids";

export async function GET(req: Request) {
  try {
    const status = new URL(req.url).searchParams.get("status") ?? "pending";
    const rows = await prisma.profileSuggestion.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { createdAt: "desc" },
      include: { application: { select: { company: true, roleTitle: true } } },
    });
    return NextResponse.json(rows);
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({
  applicationId: z.string().nullable().optional(),
  items: z.array(z.object({ text: z.string().min(1), kind: z.string().default("fact") })),
});

/** Queue suggestions directly (e.g. "Add to my profile" next to a probing answer). */
export async function POST(req: Request) {
  try {
    const { applicationId, items } = Body.parse(await req.json());
    await prisma.profileSuggestion.createMany({
      data: items.map((i) => ({ id: newRowId(), applicationId: applicationId ?? null, text: i.text, kind: i.kind })),
    });
    return NextResponse.json({ ok: true, count: items.length });
  } catch (e) {
    return errorResponse(e);
  }
}
