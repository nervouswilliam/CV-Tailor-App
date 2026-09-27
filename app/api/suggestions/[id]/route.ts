import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { logActivity } from "@/lib/store";

const Body = z.object({ status: z.enum(["pending", "accepted", "dismissed"]), destination: z.string().optional() });

export async function PATCH(req: Request, ctx: RouteContext<"/api/suggestions/[id]">) {
  try {
    const { id } = await ctx.params;
    const { status, destination } = Body.parse(await req.json());
    const s = await prisma.profileSuggestion.update({ where: { id }, data: { status } });
    if (status === "accepted") {
      await logActivity("profile", `Added to profile${destination ? ` (${destination})` : ""}: "${s.text.slice(0, 60)}"`, s.applicationId);
    }
    return NextResponse.json(s);
  } catch (e) {
    return errorResponse(e);
  }
}
