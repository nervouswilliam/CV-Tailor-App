import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { PathError, pickFolder } from "@/lib/local-files";

const Body = z.object({ initial: z.string().optional() });

/** Open the native folder picker on this computer and return the chosen folder (null if cancelled). */
export async function POST(req: Request) {
  try {
    const { initial } = Body.parse(await req.json().catch(() => ({})));
    return NextResponse.json({ path: await pickFolder(initial) });
  } catch (e) {
    if (e instanceof PathError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
