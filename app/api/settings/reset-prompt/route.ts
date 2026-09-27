import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { defaultSystemPrompt, getSettings } from "@/lib/store";
import { errorResponse } from "@/lib/http";

export async function POST() {
  try {
    await getSettings();
    const s = await prisma.settings.update({ where: { id: 1 }, data: { systemPrompt: defaultSystemPrompt() } });
    return NextResponse.json({ systemPrompt: s.systemPrompt });
  } catch (e) {
    return errorResponse(e);
  }
}
