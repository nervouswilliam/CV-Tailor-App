import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/store";
import { PROVIDERS, hasApiKey, hasOauthToken } from "@/lib/ai";
import { errorResponse } from "@/lib/http";

// The API key itself is never returned: only whether it is set.
export async function GET() {
  try {
    const s = await getSettings();
    return NextResponse.json(dto(s));
  } catch (e) {
    return errorResponse(e);
  }
}

const dto = (s: { systemPrompt: string; model: string; provider: string }) => ({
  systemPrompt: s.systemPrompt,
  model: s.model,
  provider: s.provider,
  apiKeySet: hasApiKey(),
  oauthTokenSet: hasOauthToken(),
});

const Body = z.object({ systemPrompt: z.string().optional(), model: z.string().min(1).optional(), provider: z.enum(PROVIDERS).optional() });

export async function PUT(req: Request) {
  try {
    const data = Body.parse(await req.json());
    await getSettings();
    const s = await prisma.settings.update({ where: { id: 1 }, data });
    return NextResponse.json(dto(s));
  } catch (e) {
    return errorResponse(e);
  }
}
