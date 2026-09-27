import { z } from "zod";
import { callStructured } from "@/lib/ai";
import { AiEditDocument, fromAiResume, toAiResume } from "@/lib/ai-schemas";
import { ndjsonStream, progressSender } from "@/lib/http";
import { answersContext, jobContext, loadApplication } from "@/lib/applications";
import { ResumeSchema } from "@/lib/schemas";
import { ensureUniqueIds } from "@/lib/resume-utils";
import { extractSuggestions } from "@/lib/suggestions";

const Body = z.object({
  applicationId: z.string(),
  resume: ResumeSchema,
  instruction: z.string().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).default([]),
  /** Whether to mine the instruction for new profile facts (chat messages). */
  mineFacts: z.boolean().default(false),
});

/** Whole-resume instruction from the chat tab. Streams progress; returns the full proposed resume (not saved until accepted). */
export async function POST(req: Request) {
  const { applicationId, resume, instruction, history, mineFacts } = Body.parse(await req.json());
  return ndjsonStream(async (send) => {
    const app = await loadApplication(applicationId);
    if (!app) throw new Error("Application not found");

    const convo = history.length
      ? `<earlier_chat>\n${history.map((m) => `${m.role === "user" ? "Candidate" : "You"}: ${m.content}`).join("\n")}\n</earlier_chat>\n\n`
      : "";

    const out = await callStructured({
      endpoint: "edit-document",
      applicationId,
      schema: AiEditDocument,
      effort: "medium",
      maxTokens: 32000,
      onText: progressSender(send, true),
      task: `${jobContext(app)}

${answersContext(app.probingQA)}

<current_resume>
${JSON.stringify(toAiResume(resume), null, 2)}
</current_resume>

${convo}<instruction>
${instruction}
</instruction>

Apply the instruction to the resume and return the complete updated resume. Leave everything the instruction does not concern exactly as it is, with the same ids. If the instruction reveals new facts about the candidate, you may use them (sourceRef "chat") but never invent anything beyond what they said. Keep it to one page.`,
    });

    if (mineFacts && instruction.length > 40) {
      void extractSuggestions(applicationId, instruction).catch((e) => console.warn("suggestion extraction failed", e));
    }

    return {
      resume: ensureUniqueIds(fromAiResume(out.resume, resume.header)),
      changeSummary: out.changeSummary,
    };
  });
}
