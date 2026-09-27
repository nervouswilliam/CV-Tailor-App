import { NextResponse } from "next/server";
import { z } from "zod";
import { AiError, callStructured } from "@/lib/ai";
import { AiEditElements, toAiResume } from "@/lib/ai-schemas";
import { errorResponse } from "@/lib/http";
import { answersContext, jobContext, loadApplication } from "@/lib/applications";
import { ResumeSchema } from "@/lib/schemas";
import { findElement, schemaForElement, type FoundElement } from "@/lib/resume-utils";

const Body = z.object({
  applicationId: z.string(),
  resume: ResumeSchema,
  ids: z.array(z.string()).min(1).max(20),
  prompt: z.string().min(1).max(2000),
});

/**
 * Edit only the selected element(s). The full resume and JD are context; the
 * response is a patch — one replacement per selected id — validated per element type.
 */
export async function POST(req: Request) {
  try {
    const { applicationId, resume, ids, prompt } = Body.parse(await req.json());
    const app = await loadApplication(applicationId);
    if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

    const selected = ids.map((id) => findElement(resume, id)).filter((x): x is FoundElement => !!x);
    if (!selected.length) return NextResponse.json({ error: "Selected elements were not found in the resume." }, { status: 400 });

    const describe = (el: FoundElement) =>
      `<element id="${el.id}" kind="${el.kind}" label="${el.label}">\n${JSON.stringify(el.value, null, 2)}\n</element>`;

    const task = `${jobContext(app)}

${answersContext(app.probingQA)}

<current_resume>
${JSON.stringify(toAiResume(resume), null, 2)}
</current_resume>

The candidate selected ${selected.length === 1 ? "this element" : `these ${selected.length} elements`} on the resume:
${selected.map(describe).join("\n")}

<instruction>
${prompt}
</instruction>

Apply the instruction to the selected element(s) only. Return exactly one edit per selected element: "id" is the selected element's id and "value" is a JSON string of the complete replacement element in exactly the same shape as shown (same keys; a bare JSON array of strings for kind="additional"; a JSON array of entries for kind="section").
- Change only what the instruction asks; keep every nested id (roles, bullets) that you keep.
- Keep or update each bullet's "sourceRef" so it still points at the profile ids / answer ids the content comes from.
- Never invent facts or numbers. If the instruction asks for a metric that is not in the profile or answers, keep the claim qualitative and say so in "note".`;

    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await callStructured({
        endpoint: "edit-element",
        applicationId,
        schema: AiEditElements,
        effort: "low",
        maxTokens: 16000,
        task: attempt === 0 ? task : `${task}\n\nYour previous answer was rejected: ${lastErr}. Follow the shape exactly.`,
      });
      try {
        const edits = selected.map((el) => {
          const e = out.edits.find((x) => x.id === el.id);
          if (!e) throw new Error(`missing an edit for ${el.id}`);
          let value: unknown = JSON.parse(e.value);
          if (value && typeof value === "object" && !Array.isArray(value)) value = { ...value, id: el.id };
          const parsed = schemaForElement(el).safeParse(value);
          if (!parsed.success) throw new Error(`edit for ${el.id} did not match the ${el.kind} shape`);
          return { id: el.id, kind: el.kind, label: el.label, before: el.value, after: parsed.data };
        });
        return NextResponse.json({ edits, note: out.note });
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    throw new AiError("invalid_output", `The AI's edit could not be applied (${lastErr}). Try again.`, true);
  } catch (e) {
    return errorResponse(e);
  }
}
