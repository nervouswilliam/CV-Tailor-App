import { NextResponse } from "next/server";
import { z } from "zod";
import { callStructured } from "@/lib/ai";
import { AiAnalysis } from "@/lib/ai-schemas";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";
import { jobContext, loadApplication } from "@/lib/applications";
import { logActivity } from "@/lib/store";
import { newId } from "@/lib/ids";

const Body = z.object({ applicationId: z.string() });

/** Steps 1–3 of the system prompt: JD analysis, profile matches, gaps and 3–5 probing questions. */
export async function POST(req: Request) {
  try {
    const { applicationId } = Body.parse(await req.json());
    const app = await loadApplication(applicationId);
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const analysis = await callStructured({
      endpoint: "analyse",
      applicationId,
      schema: AiAnalysis,
      effort: "medium",
      maxTokens: 16000,
      task: `${jobContext(app)}

Carry out Steps 1–3 only (do not draft the resume yet):
1. Analyse the job description: role type, a one-paragraph summary of what the hiring manager needs, core requirements, nice-to-haves, and 10–20 keywords a recruiter or ATS would scan for (use the JD's exact wording).
2. Map the Master Knowledge Document to each core requirement. In "profileItems" name the specific items (e.g. "AI Engineer @ Wisely.id: RAG support bot") that match, and rate the match strong / partial / weak.
3. Identify gaps where evidence is missing or thin, and ask 3–5 short, specific probing questions that could surface real experience not yet written down (scope, metrics, tools, stakeholders, outcomes). Never ask about something the profile already answers. Give each question a short id like "q1".`,
    });

    // Normalise question ids so answers can be cited as "answer:<id>".
    const seen = new Set<string>();
    analysis.questions = analysis.questions.slice(0, 5).map((q) => {
      let id = q.id.replace(/[^a-z0-9_-]/gi, "") || `q${newId().slice(0, 4)}`;
      if (seen.has(id)) id = `${id}-${newId().slice(0, 3)}`;
      seen.add(id);
      return { ...q, id };
    });

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        analysis: JSON.stringify(analysis),
        probingQA: JSON.stringify(analysis.questions.map((q) => ({ questionId: q.id, question: q.question, answer: "", skipped: false }))),
      },
    });
    await logActivity("analyse", `Analysed JD for ${app.company} — ${app.roleTitle}`, applicationId);
    return NextResponse.json(analysis);
  } catch (e) {
    return errorResponse(e);
  }
}
