import "server-only";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { newRowId } from "./ids";
import { ProfileSchema, ResumeSchema, type Profile, type Resume } from "./schemas";

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export function defaultSystemPrompt(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "prompts", "system.md"), "utf8");
  } catch {
    return "";
  }
}

/** Pull the "Strategic Principles" section out of the system prompt (used to pre-populate strategic notes). */
export function strategicPrinciplesFrom(prompt: string): string {
  const m = prompt.match(/^#+\s*Strategic Principles\s*\n([\s\S]*?)(?=^#\s|^##\s|$(?![\s\S]))/im);
  return m ? m[1].trim() : "";
}

export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (s) return s;
  return prisma.settings.create({ data: { id: 1, systemPrompt: defaultSystemPrompt(), model: DEFAULT_MODEL } });
}

export async function getProfile(): Promise<Profile> {
  const row = await prisma.profile.findUnique({ where: { id: 1 } });
  if (row) return ProfileSchema.parse(JSON.parse(row.data));
  const settings = await getSettings();
  const empty = ProfileSchema.parse({ strategicNotes: strategicPrinciplesFrom(settings.systemPrompt) });
  await prisma.profile.create({ data: { id: 1, data: JSON.stringify(empty) } });
  return empty;
}

export async function saveProfile(p: Profile): Promise<Profile> {
  const parsed = ProfileSchema.parse(p);
  await prisma.profile.upsert({
    where: { id: 1 },
    create: { id: 1, data: JSON.stringify(parsed) },
    update: { data: JSON.stringify(parsed) },
  });
  return parsed;
}

export function headerFromProfile(p: Profile): Resume["header"] {
  return { name: p.personal.name, email: p.personal.email, phone: p.personal.phone, linkedin: p.personal.linkedin };
}

export async function logActivity(type: string, message: string, applicationId?: string | null) {
  await prisma.activityLog.create({ data: { id: newRowId(), type, message, applicationId: applicationId ?? null } });
}

export async function latestVersion(applicationId: string) {
  return prisma.resumeVersion.findFirst({ where: { applicationId }, orderBy: { createdAt: "desc" } });
}

/** Persist a new resume version. The header is always re-applied from the profile. */
export async function addVersion(applicationId: string, resume: Resume, changeSummary: string) {
  const profile = await getProfile();
  const r = ResumeSchema.parse({ ...resume, header: headerFromProfile(profile) });
  const v = await prisma.resumeVersion.create({
    data: { id: newRowId(), applicationId, resume: JSON.stringify(r), changeSummary },
  });
  await prisma.application.update({ where: { id: applicationId }, data: { updatedAt: new Date() } });
  return { ...v, resume: r };
}

export const parseJson = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
