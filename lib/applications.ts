import "server-only";
import { prisma } from "./db";
import { estimateCost } from "./ai";
import { parseJson } from "./store";
import { AnalysisSchema, ResumeSchema, type Analysis, type ProbingAnswer, type Rationale } from "./schemas";

export type ProbingQA = ProbingAnswer & { queued?: boolean };

export async function loadApplication(id: string) {
  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) return null;
  return {
    ...app,
    analysis: app.analysis ? AnalysisSchema.parse(JSON.parse(app.analysis)) : null,
    probingQA: parseJson<ProbingQA[]>(app.probingQA, []),
    rationale: parseJson<Rationale | null>(app.rationale, null),
  };
}
export type LoadedApplication = NonNullable<Awaited<ReturnType<typeof loadApplication>>>;

export async function applicationCost(applicationId: string) {
  const rows = await prisma.aiUsage.findMany({ where: { applicationId } });
  // Calls made on the Claude plan draw from subscription limits, not API credits, so they add no $ cost.
  const apiRows = rows.filter((r) => r.provider !== "claude-plan");
  const cost = apiRows.reduce((sum, r) => sum + estimateCost(r), 0);
  const tokens = rows.reduce((n, r) => n + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0);
  return { cost, tokens, calls: rows.length, planCalls: rows.length - apiRows.length };
}

export async function editorPayload(id: string) {
  const app = await loadApplication(id);
  if (!app) return null;
  const versions = await prisma.resumeVersion.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: "asc" },
  });
  const exports = await prisma.export.findMany({ where: { applicationId: id }, orderBy: { createdAt: "desc" } });
  return {
    application: app,
    versions: versions.map((v) => ({
      id: v.id,
      changeSummary: v.changeSummary,
      createdAt: v.createdAt,
      resume: ResumeSchema.parse(JSON.parse(v.resume)),
    })),
    exports,
    usage: await applicationCost(id),
  };
}

/** Text block describing the job, used in every application-scoped prompt. */
export function jobContext(app: { company: string; roleTitle: string; jobDescription: string }) {
  return `<job>
Company: ${app.company}
Role: ${app.roleTitle}

${app.jobDescription}
</job>`;
}

export function analysisContext(a: Analysis | null) {
  if (!a) return "";
  return `<analysis>
${JSON.stringify(a, null, 2)}
</analysis>`;
}

export function answersContext(qa: ProbingQA[]) {
  const answered = qa.filter((q) => !q.skipped && q.answer.trim());
  if (!answered.length) return "<candidate_answers>None: the candidate skipped the probing questions.</candidate_answers>";
  return `<candidate_answers>
${answered.map((q) => `[answer:${q.questionId}] Q: ${q.question}\nA: ${q.answer}`).join("\n\n")}
</candidate_answers>`;
}

/** The set of valid "answer:<id>" sourceRefs for an application. */
export function answerRefs(qa: ProbingQA[]) {
  return qa.filter((q) => !q.skipped && q.answer.trim()).map((q) => `answer:${q.questionId}`);
}
