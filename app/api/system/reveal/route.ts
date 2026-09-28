import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { PathError, assertInsideHome, revealInFolder } from "@/lib/local-files";

const Body = z.object({ path: z.string().min(1) });

/** Show a saved PDF in Explorer. Only files inside the user's folder can be revealed. */
export async function POST(req: Request) {
  try {
    const { path: file } = Body.parse(await req.json());
    assertInsideHome(file); // same home-folder rule as saving
    await fs.access(file);
    revealInFolder(path.resolve(file));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PathError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
