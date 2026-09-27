import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 30), 100);
    const rows = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return NextResponse.json(rows);
  } catch (e) {
    return errorResponse(e);
  }
}
