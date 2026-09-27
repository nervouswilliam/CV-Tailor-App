import { z } from "zod";
import { callStructured } from "@/lib/ai";
import { AiDraft, fromAiResume } from "@/lib/ai-schemas";
import { ndjsonStream, progressSender } from "@/lib/http";
import { prisma } from "@/lib/db";
import { analysisContext, answersContext, jobContext, loadApplication } from "@/lib/applications";
import { addVersion, getProfile, headerFromProfile, logActivity } from "@/lib/store";
import { ensureUniqueIds } from "@/lib/resume-utils";
import { extractSuggestions } from "@/lib/suggestions";

const Body = z.object({ applicationId: z.string() });

/** Step 4–5: full first draft + rationale. Streams progress (NDJSON), saves version 1. */
export async function POST(req: Request) {
  const { applicationId } = Body.parse(await req.json());
  return ndjsonStream(async (send) => {
    const app = await loadApplication(applicationId);
    if (!app) throw new Error("Application not found");
    const profile = await getProfile();
    send({ type: "status", message: "Drafting your resume…" });

    const out = await callStructured({
      endpoint: "draft",
      applicationId,
      schema: AiDraft,
      effort: "high",
      maxTokens: 48000,
      onText: progressSender(send, true),
      task: `${jobContext(app)}

${analysisContext(app.analysis)}

${answersContext(app.probingQA)}

Carry out Steps 4 and 5: draft the tailored one-page resume in the MITB SMU format, then explain your decisions.

- It must fit on ONE A4 page (Calibri 10.5pt, ~1.3 cm margins): roughly 55–60 lines of content in total. A full-width bullet line holds ~125 characters; keep most bullets to one or two lines.
- Section order is fixed by the template: Education, Academic Projects (optional, max 2), Experience, Extra-curricular (optional), Additional. Leave optional sections as [] when they don't strengthen this application.
- Within Experience, list companies newest first and roles within a company newest first.
- Use company descriptors from the profile (edit for relevance if helpful). Use dates exactly as in the profile.
- Additional: certifications, technical skills (most relevant first, matching the JD's terms where truthful), languages and work authorization from the profile; volunteer only if relevant.
- Every bullet's sourceRef must cite profile ids or answer:<questionId>.
- Rationale: "included" = what you chose and why; "excluded" = notable items you left out and why; "framing" = how you positioned the candidate; "openQuestions" = anything the candidate should confirm.`,
    });

    const resume = ensureUniqueIds(fromAiResume(out.resume, headerFromProfile(profile)));
    const version = await addVersion(applicationId, resume, "First draft");
    await prisma.application.update({
      where: { id: applicationId },
      data: { rationale: JSON.stringify(out.rationale), saveAs: app.saveAs ?? undefined },
    });
    await logActivity("generate", `Generated CV for ${app.company} — ${app.roleTitle}`, applicationId);

    // Queue new facts from probing answers for the profile inbox (best effort, non-blocking).
    const fresh = app.probingQA.filter((q) => !q.skipped && q.answer.trim() && !q.queued);
    if (fresh.length) {
      void extractSuggestions(
        applicationId,
        fresh.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n"),
      )
        .then(() =>
          prisma.application.update({
            where: { id: applicationId },
            data: { probingQA: JSON.stringify(app.probingQA.map((q) => (fresh.includes(q) ? { ...q, queued: true } : q))) },
          }),
        )
        .catch((e) => console.warn("suggestion extraction failed", e));
    }

    return { versionId: version.id, rationale: out.rationale };
  });
}
