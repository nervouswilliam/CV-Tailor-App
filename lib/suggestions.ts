import "server-only";
import { callStructured } from "./ai";
import { AiSuggestions } from "./ai-schemas";
import { prisma } from "./db";
import { newRowId } from "./ids";

/**
 * Ask the AI which facts in `text` (probing answers, chat messages) are new relative
 * to the profile, and queue them in the Profile suggestions inbox.
 */
export async function extractSuggestions(applicationId: string | null, text: string) {
  const out = await callStructured({
    endpoint: "suggest-profile-additions",
    applicationId,
    schema: AiSuggestions,
    effort: "low",
    maxTokens: 8000,
    task: `The candidate wrote the text below while tailoring a resume. List only concrete NEW facts about their experience (achievements, metrics, tools, responsibilities, projects, certifications, skills) that are not already in the Master Knowledge Document. Write each as a standalone statement that could be added to the profile, e.g. a resume-style bullet. Ignore instructions about formatting or wording, opinions, and anything already covered. Return an empty list if there is nothing new.

<text>
${text}
</text>`,
  });
  if (!out.suggestions.length) return [];
  const existing = await prisma.profileSuggestion.findMany({ where: { applicationId, status: "pending" }, select: { text: true } });
  const fresh = out.suggestions.filter((s) => !existing.some((e) => e.text === s.text));
  await prisma.profileSuggestion.createMany({
    data: fresh.map((s) => ({ id: newRowId(), applicationId, text: s.text, kind: s.kind })),
  });
  return fresh;
}
