import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "./db";
import { callStructured } from "./ai";

export const ATTACHMENT_DIR = path.join(process.cwd(), "data", "attachments");
/** Characters of extracted text sent to the AI (~45K tokens). Longer documents are flagged as truncated in the UI. */
export const MAX_SUMMARY_CHARS = 180_000;

export const ITEM_TYPES = ["role", "project", "activity", "education"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const AttachmentSummarySchema = z.object({
  summary: z.string().describe("3–6 sentences: what this document shows about the candidate's own work on this item"),
  keyFacts: z.array(z.string()).describe("Concrete facts: scope, responsibilities, stakeholders, decisions, outcomes"),
  metrics: z.array(z.string()).describe("Numbers with what they measure, e.g. '35% fewer support tickets'"),
  tools: z.array(z.string()).describe("Tools, languages, methods and frameworks used"),
  suggestedBullets: z
    .array(z.string())
    .describe("3–6 resume bullets strictly supported by the document, action verb first, key terms in **bold**"),
  caveats: z.string().describe("Anything ambiguous, e.g. team vs. individual contribution; empty if none"),
  fields: z
    .object({
      title: z.string().describe("Project name, role/job title, or activity position"),
      organisation: z.string().describe("Company, organisation or institution name"),
      location: z.string().describe('City/country, e.g. "Singapore"'),
      startDate: z.string().describe('e.g. "Jan 2024"'),
      endDate: z.string().describe('e.g. "Jun 2024" or "Present"'),
      date: z.string().describe('Single date or range for a project/activity, e.g. "Mar 2026" or "Jan – Apr 2026"'),
      description: z.string().describe("Project: 1–2 sentences on what it is, your role and the outcome. Role: one-line description of the company."),
      techStack: z.array(z.string()).describe("Tools, languages, libraries and methods used"),
      links: z.array(z.string()).describe("URLs that appear in the document (repo, demo, report)"),
      projectType: z.enum(["Academic", "Personal", "Startup", ""]).describe("Only for projects; empty if unclear"),
      degree: z.string().describe("Only for education"),
      grade: z.string().describe('Only for education, e.g. "CGPA: 3.6/4.0"'),
      coursework: z.array(z.string()).describe("Only for education"),
      contextNotes: z.string().describe("Only for roles: team size, product, scope and other context worth knowing"),
    })
    .describe('Values for the profile item\'s form fields, taken ONLY from the document. Use "" / [] for anything the document does not state.'),
});
export type AttachmentSummary = z.infer<typeof AttachmentSummarySchema> & {
  /** Set once the fields have been copied into the profile item (so it only happens once). */
  fieldsApplied?: boolean;
};

/** Public shape (no extracted text or file path). */
export function toDto(a: Awaited<ReturnType<typeof prisma.attachment.findFirstOrThrow>>) {
  return {
    id: a.id,
    itemId: a.itemId,
    itemType: a.itemType,
    itemLabel: a.itemLabel,
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    textLength: a.extractedText.length,
    truncated: a.truncated,
    status: a.status,
    error: a.error,
    summary: a.summary ? (JSON.parse(a.summary) as AttachmentSummary) : null,
    createdAt: a.createdAt,
  };
}
export type AttachmentDto = ReturnType<typeof toDto>;

/** Summarise an attachment's extracted text with the AI. Runs in the background after upload. */
export async function summariseAttachment(id: string) {
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return;
  await prisma.attachment.update({ where: { id }, data: { status: "processing", error: null } });
  try {
    const text = a.extractedText.slice(0, MAX_SUMMARY_CHARS);
    const out = await callStructured({
      endpoint: "summarise-attachment",
      schema: AttachmentSummarySchema,
      effort: "low",
      maxTokens: 12000,
      task: `The candidate attached the document below to this item in their profile: ${a.itemType} "${a.itemLabel}".
It may be a report, slide deck, write-up or presentation about that work. Extract what will help write tailored resume bullets later.

Rules:
- Only the candidate's own contribution counts. If the document describes team work and the candidate's part is unclear, say so in "caveats" rather than claiming it.
- Keep every number exactly as stated. Never invent or round figures.
- The profile (Master Knowledge Document) is included above for context: prefer facts that are NOT already in the item's bullet bank.
- Also fill "fields" with the values the app should put into this ${a.itemType}'s form (title, dates, tech stack, description, links, …). The item may be brand new with a placeholder name like "New project"; take the real name from the document. Only use values the document states; leave the rest empty.
${a.truncated ? "- The document was too long and has been cut off; mention that in caveats.\n" : ""}
<document filename="${a.filename}">
${text}
</document>`,
    });
    await prisma.attachment.update({ where: { id }, data: { status: "ready", summary: JSON.stringify(out) } });
  } catch (e) {
    await prisma.attachment.update({
      where: { id },
      data: { status: "error", error: e instanceof Error ? e.message : String(e) },
    });
  }
}

export async function deleteAttachment(id: string) {
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return;
  await fs.rm(a.filePath, { force: true });
  await prisma.attachment.delete({ where: { id } });
}

/** Remove attachments whose profile item no longer exists. */
export async function pruneAttachments(validItemIds: Set<string>) {
  const all = await prisma.attachment.findMany({ select: { id: true, itemId: true } });
  for (const a of all) if (!validItemIds.has(a.itemId)) await deleteAttachment(a.id);
}

/** Ready summaries grouped by item id, for the Master Knowledge Document. */
export async function attachmentContext(): Promise<Map<string, { filename: string; summary: AttachmentSummary }[]>> {
  const rows = await prisma.attachment.findMany({ where: { status: "ready" }, orderBy: { createdAt: "asc" } });
  const map = new Map<string, { filename: string; summary: AttachmentSummary }[]>();
  for (const r of rows) {
    if (!r.summary) continue;
    map.set(r.itemId, [...(map.get(r.itemId) ?? []), { filename: r.filename, summary: JSON.parse(r.summary) }]);
  }
  return map;
}
