import { NextResponse } from "next/server";
import { z } from "zod";
import { callStructured } from "@/lib/ai";
import { AiFitPage, fromAiResume, toAiResume } from "@/lib/ai-schemas";
import { errorResponse } from "@/lib/http";
import { jobContext, loadApplication } from "@/lib/applications";
import { ResumeSchema } from "@/lib/schemas";
import { ensureUniqueIds } from "@/lib/resume-utils";

const Body = z.object({
  applicationId: z.string(),
  resume: ResumeSchema,
  overflowLines: z.number().min(0).max(200),
});

/** Cut the least relevant content (per the system prompt's cutting priority) so the resume fits one page. */
export async function POST(req: Request) {
  try {
    const { applicationId, resume, overflowLines } = Body.parse(await req.json());
    const app = await loadApplication(applicationId);
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const lines = Math.ceil(overflowLines);
    const out = await callStructured({
      endpoint: "fit-page",
      applicationId,
      schema: AiFitPage,
      effort: "medium",
      maxTokens: 32000,
      task: `${jobContext(app)}

<current_resume>
${JSON.stringify(toAiResume(resume), null, 2)}
</current_resume>

The rendered resume overflows one A4 page by about ${lines} line${lines === 1 ? "" : "s"} (a full-width bullet line is ~125 characters; a bullet that wraps to two lines costs two lines; every entry heading costs one line).
Cut or shorten content to remove at least ${lines + 1} lines, following the cutting priority in your instructions: remove the least relevant content for this job first. Do not rewrite anything that does not need to change; keep ids of everything you keep. List what you cut in "cut".`,
    });
    return NextResponse.json({ resume: ensureUniqueIds(fromAiResume(out.resume, resume.header)), cut: out.cut });
  } catch (e) {
    return errorResponse(e);
  }
}
