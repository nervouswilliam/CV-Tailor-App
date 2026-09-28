import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { PathError, getPreferences, resolveExportDir, setPreferences } from "@/lib/local-files";

export async function GET() {
  try {
    const prefs = await getPreferences();
    // `suggestedExportDir` is shown as the input's placeholder.
    return NextResponse.json({ ...prefs, suggestedExportDir: path.join(os.homedir(), "Documents", "CVs") });
  } catch (e) {
    return errorResponse(e);
  }
}

const Body = z.object({ exportDir: z.string() });

/** Set (or clear, with "") the folder PDFs are saved to. The folder is validated and created if needed. */
export async function PUT(req: Request) {
  try {
    const { exportDir } = Body.parse(await req.json());
    const dir = exportDir.trim() ? await resolveExportDir(exportDir) : "";
    return NextResponse.json(await setPreferences({ exportDir: dir }));
  } catch (e) {
    if (e instanceof PathError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
