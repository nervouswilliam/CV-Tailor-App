/**
 * Schemas sent to Claude as structured-output formats.
 *
 * Structured outputs work best with every property required, so these mirror
 * the app schemas in lib/schemas.ts but use "" / [] instead of optional fields.
 * `fromAi*` helpers convert them back to the app shapes.
 */
import { z } from "zod";
import {
  AnalysisSchema,
  RationaleSchema,
  type Resume,
  type ResumeHeader,
  type Profile,
  PROJECT_TYPES,
  ACTIVITY_KINDS,
} from "./schemas";
import { newId } from "./ids";

const AiBullet = z.object({
  id: z.string().describe("Keep the existing id when editing; use a new short id for new bullets"),
  text: z.string(),
  sourceRef: z
    .string()
    .describe('Profile bullet/role/project id this came from, or "answer:<questionId>". Empty only if unsourced.'),
});

const AiEducation = z.object({
  id: z.string(),
  institution: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  degree: z.string(),
  grade: z.string(),
  coursework: z.array(z.string()),
});

const AiRole = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(AiBullet),
});

const AiCompany = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  descriptor: z.string().describe("One-line italic description of the company, or empty"),
  roles: z.array(AiRole),
});

const AiProject = z.object({ id: z.string(), title: z.string(), date: z.string(), bullets: z.array(AiBullet) });
const AiActivity = z.object({
  id: z.string(),
  organisation: z.string(),
  title: z.string(),
  date: z.string(),
  bullets: z.array(AiBullet),
});

export const AiResumeBody = z.object({
  education: z.array(AiEducation),
  experience: z.array(AiCompany),
  academicProjects: z.array(AiProject).describe("At most 2; empty array to omit the section"),
  extracurricular: z.array(AiActivity).describe("Empty array to omit the section"),
  additional: z.object({
    certifications: z.array(z.string()),
    technicalSkills: z.array(z.string()),
    languages: z.array(z.string()),
    workAuthorization: z.array(z.string()),
    volunteer: z.array(z.string()),
  }),
});
export type AiResumeBodyT = z.infer<typeof AiResumeBody>;

export const AiAnalysis = AnalysisSchema;

export const AiDraft = z.object({ resume: AiResumeBody, rationale: RationaleSchema });

export const AiEditDocument = z.object({
  resume: AiResumeBody,
  changeSummary: z.string().describe("One short sentence describing what changed"),
});

export const AiFitPage = z.object({
  resume: AiResumeBody,
  cut: z.array(z.string()).describe("What was removed or shortened, most significant first"),
});

export const AiEditElements = z.object({
  edits: z.array(
    z.object({
      id: z.string().describe("The id of the selected element being replaced"),
      value: z.string().describe("The complete new element, as a JSON string in the same shape as the input element"),
    }),
  ),
  note: z.string().describe("One short sentence on what you changed"),
});

export const AiSuggestions = z.object({
  suggestions: z.array(
    z.object({
      text: z.string().describe("The new fact, written so it could be added to the profile as-is"),
      kind: z.enum(["experience", "project", "skill", "metric", "certification", "other"]),
    }),
  ),
});

const AiBankBullet = z.object({ text: z.string(), tags: z.array(z.string()), metrics: z.string() });
export const AiProfile = z.object({
  personal: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    linkedin: z.string(),
    languages: z.array(z.string()),
    workAuthorization: z.array(z.string()),
  }),
  education: z.array(
    z.object({
      institution: z.string(),
      location: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      degree: z.string(),
      grade: z.string(),
      coursework: z.array(z.string()),
      notes: z.string(),
    }),
  ),
  companies: z.array(
    z.object({
      name: z.string(),
      location: z.string(),
      descriptor: z.string(),
      notes: z.string(),
      roles: z.array(
        z.object({
          title: z.string(),
          startDate: z.string(),
          endDate: z.string(),
          contextNotes: z.string(),
          bullets: z.array(AiBankBullet),
        }),
      ),
    }),
  ),
  projects: z.array(
    z.object({
      title: z.string(),
      date: z.string(),
      type: z.enum(PROJECT_TYPES),
      description: z.string(),
      techStack: z.array(z.string()),
      links: z.array(z.string()),
      bullets: z.array(AiBankBullet),
    }),
  ),
  activities: z.array(
    z.object({
      organisation: z.string(),
      title: z.string(),
      date: z.string(),
      kind: z.enum(ACTIVITY_KINDS),
      bullets: z.array(AiBankBullet),
    }),
  ),
  certifications: z.array(z.object({ name: z.string(), category: z.string() })),
  skills: z.array(z.object({ name: z.string(), category: z.string() })),
  strategicNotes: z.string(),
});

/* ------------------------------------------------------------------ */
/* Converters                                                          */
/* ------------------------------------------------------------------ */

const nonEmpty = (s: string) => (s && s.trim() ? s : undefined);
const nonEmptyArr = <T,>(a: T[]) => (a && a.length ? a : undefined);

export function fromAiResume(body: AiResumeBodyT, header: ResumeHeader): Resume {
  const bullet = (b: { id: string; text: string; sourceRef: string }) => ({
    id: b.id,
    text: b.text,
    sourceRef: nonEmpty(b.sourceRef),
  });
  return {
    header,
    education: body.education.map((e) => ({
      id: e.id,
      institution: e.institution,
      location: nonEmpty(e.location),
      startDate: e.startDate,
      endDate: e.endDate,
      degree: e.degree,
      grade: nonEmpty(e.grade),
      coursework: nonEmptyArr(e.coursework),
    })),
    experience: body.experience.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      descriptor: nonEmpty(c.descriptor),
      roles: c.roles.map((r) => ({ ...r, bullets: r.bullets.map(bullet) })),
    })),
    academicProjects: nonEmptyArr(body.academicProjects.slice(0, 2).map((p) => ({ ...p, bullets: p.bullets.map(bullet) }))),
    extracurricular: nonEmptyArr(body.extracurricular.map((a) => ({ ...a, bullets: a.bullets.map(bullet) }))),
    additional: {
      certifications: nonEmptyArr(body.additional.certifications),
      technicalSkills: body.additional.technicalSkills,
      languages: body.additional.languages,
      workAuthorization: body.additional.workAuthorization,
      volunteer: nonEmptyArr(body.additional.volunteer),
    },
  };
}

/** Resume → AI shape (for sending the current resume as context). Header is omitted: it never comes from the AI. */
export function toAiResume(r: Resume): AiResumeBodyT {
  const bullet = (b: { id: string; text: string; sourceRef?: string }) => ({
    id: b.id,
    text: b.text,
    sourceRef: b.sourceRef ?? "",
  });
  return {
    education: r.education.map((e) => ({
      id: e.id,
      institution: e.institution,
      location: e.location ?? "",
      startDate: e.startDate,
      endDate: e.endDate,
      degree: e.degree,
      grade: e.grade ?? "",
      coursework: e.coursework ?? [],
    })),
    experience: r.experience.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      descriptor: c.descriptor ?? "",
      roles: c.roles.map((ro) => ({ ...ro, bullets: ro.bullets.map(bullet) })),
    })),
    academicProjects: (r.academicProjects ?? []).map((p) => ({ ...p, bullets: p.bullets.map(bullet) })),
    extracurricular: (r.extracurricular ?? []).map((a) => ({ ...a, bullets: a.bullets.map(bullet) })),
    additional: {
      certifications: r.additional.certifications ?? [],
      technicalSkills: r.additional.technicalSkills,
      languages: r.additional.languages,
      workAuthorization: r.additional.workAuthorization,
      volunteer: r.additional.volunteer ?? [],
    },
  };
}

export function fromAiProfile(p: z.infer<typeof AiProfile>): Profile {
  const bb = (b: { text: string; tags: string[]; metrics: string }) => ({ id: newId(), ...b });
  return {
    personal: p.personal,
    education: p.education.map((e) => ({ id: newId(), ...e })),
    companies: p.companies.map((c) => ({
      id: newId(),
      ...c,
      roles: c.roles.map((r) => ({ id: newId(), ...r, bullets: r.bullets.map(bb) })),
    })),
    projects: p.projects.map((pr) => ({ id: newId(), ...pr, bullets: pr.bullets.map(bb) })),
    activities: p.activities.map((a) => ({ id: newId(), ...a, bullets: a.bullets.map(bb) })),
    certifications: p.certifications.map((c) => ({ id: newId(), name: c.name, category: c.category, tags: [] })),
    skills: p.skills.map((s) => ({ id: newId(), name: s.name, category: s.category, tags: [] })),
    strategicNotes: p.strategicNotes,
  };
}
