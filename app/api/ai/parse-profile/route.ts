import { NextResponse } from "next/server";
import { z } from "zod";
import { callStructured } from "@/lib/ai";
import { AiProfile, fromAiProfile } from "@/lib/ai-schemas";
import { errorResponse } from "@/lib/http";

const Body = z.object({ text: z.string().min(20, "Paste your master document first.") });

/** Parse a pasted Master Knowledge Document into the structured profile. Not saved: the client reviews, then confirms. */
export async function POST(req: Request) {
  try {
    const { text } = Body.parse(await req.json());
    const out = await callStructured({
      endpoint: "parse-profile",
      schema: AiProfile,
      withProfile: false,
      effort: "medium",
      maxTokens: 64000,
      task: `Parse the candidate's Master Knowledge Document below into the structured profile schema.

Rules:
- Capture everything factual: every company, role, date, bullet, metric, project, activity, certification, skill, language and work authorization detail. Do not summarise away detail; the bullet banks should hold every achievement, even ones that would not fit on one page.
- Keep the candidate's wording for bullets. Put figures in "metrics" as well as in the text.
- Tag bullets with short lowercase tags where obvious (e.g. technical, business, leadership, ml, stakeholder, analytics).
- Put context that is not a bullet (team size, product, how to frame it) in the role "contextNotes" or company "notes".
- Put framing preferences and positioning advice in "strategicNotes".
- Use "" or [] for anything not present. Never invent.

<master_document>
${text}
</master_document>`,
    });
    return NextResponse.json(fromAiProfile(out));
  } catch (e) {
    return errorResponse(e);
  }
}
