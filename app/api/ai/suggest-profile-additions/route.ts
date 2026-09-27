import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { extractSuggestions } from "@/lib/suggestions";

const Body = z.object({ applicationId: z.string().nullable().optional(), text: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { applicationId, text } = Body.parse(await req.json());
    const suggestions = await extractSuggestions(applicationId ?? null, text);
    return NextResponse.json({ suggestions });
  } catch (e) {
    return errorResponse(e);
  }
}
