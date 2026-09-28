import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Resume (rendered by components/resume/MitbTemplate.tsx)             */
/* ------------------------------------------------------------------ */

export const BulletSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceRef: z.string().optional(),
});

export const EducationEntrySchema = z.object({
  id: z.string(),
  institution: z.string(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  degree: z.string(),
  grade: z.string().optional(),
  coursework: z.array(z.string()).optional(),
});

export const RoleSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(BulletSchema),
});

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  descriptor: z.string().optional(),
  roles: z.array(RoleSchema),
});

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  bullets: z.array(BulletSchema),
});

export const ActivitySchema = z.object({
  id: z.string(),
  organisation: z.string(),
  title: z.string(),
  date: z.string(),
  bullets: z.array(BulletSchema),
});

export const HeaderSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  linkedin: z.string(),
});

export const AdditionalSchema = z.object({
  certifications: z.array(z.string()).optional(),
  technicalSkills: z.array(z.string()),
  languages: z.array(z.string()),
  workAuthorization: z.array(z.string()),
  volunteer: z.array(z.string()).optional(),
});

/** Resume sections, in the base CV's default order. */
export const SECTION_KEYS = ["education", "academicProjects", "experience", "extracurricular", "additional"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const ResumeSchema = z.object({
  header: HeaderSchema,
  /** Section order on the page (drag to change in the editor). Missing = default order. */
  sectionOrder: z.array(z.enum(SECTION_KEYS)).optional(),
  education: z.array(EducationEntrySchema),
  experience: z.array(CompanySchema),
  academicProjects: z.array(ProjectSchema).optional(),
  extracurricular: z.array(ActivitySchema).optional(),
  additional: AdditionalSchema,
});

export type Bullet = z.infer<typeof BulletSchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
export type Resume = z.infer<typeof ResumeSchema>;
export type ResumeHeader = z.infer<typeof HeaderSchema>;

/* ------------------------------------------------------------------ */
/* Profile (the structured "Master Knowledge Document")                */
/* ------------------------------------------------------------------ */

export const BankBulletSchema = z.object({
  id: z.string(),
  text: z.string(),
  tags: z.array(z.string()).default([]),
  metrics: z.string().default(""),
});

export const ProfileRoleSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  contextNotes: z.string().default(""),
  bullets: z.array(BankBulletSchema).default([]),
});

export const ProfileCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().default(""),
  descriptor: z.string().default(""),
  notes: z.string().default(""),
  roles: z.array(ProfileRoleSchema).default([]),
});

export const ProfileEducationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  location: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  degree: z.string().default(""),
  grade: z.string().default(""),
  coursework: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export const PROJECT_TYPES = ["Academic", "Personal", "Startup"] as const;

export const ProfileProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().default(""),
  type: z.enum(PROJECT_TYPES).default("Academic"),
  description: z.string().default(""),
  techStack: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  bullets: z.array(BankBulletSchema).default([]),
});

export const ACTIVITY_KINDS = ["Extracurricular", "Leadership", "Volunteer"] as const;

export const ProfileActivitySchema = z.object({
  id: z.string(),
  organisation: z.string(),
  title: z.string().default(""),
  date: z.string().default(""),
  kind: z.enum(ACTIVITY_KINDS).default("Extracurricular"),
  bullets: z.array(BankBulletSchema).default([]),
});

export const TaggedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().default(""),
  tags: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  personal: z
    .object({
      name: z.string().default(""),
      email: z.string().default(""),
      phone: z.string().default(""),
      linkedin: z.string().default(""),
      languages: z.array(z.string()).default([]),
      workAuthorization: z.array(z.string()).default([]),
    })
    .default({ name: "", email: "", phone: "", linkedin: "", languages: [], workAuthorization: [] }),
  education: z.array(ProfileEducationSchema).default([]),
  companies: z.array(ProfileCompanySchema).default([]),
  projects: z.array(ProfileProjectSchema).default([]),
  activities: z.array(ProfileActivitySchema).default([]),
  certifications: z.array(TaggedItemSchema).default([]),
  skills: z.array(TaggedItemSchema).default([]),
  strategicNotes: z.string().default(""),
});

export type BankBullet = z.infer<typeof BankBulletSchema>;
export type ProfileRole = z.infer<typeof ProfileRoleSchema>;
export type ProfileCompany = z.infer<typeof ProfileCompanySchema>;
export type ProfileEducation = z.infer<typeof ProfileEducationSchema>;
export type ProfileProject = z.infer<typeof ProfileProjectSchema>;
export type ProfileActivity = z.infer<typeof ProfileActivitySchema>;
export type TaggedItem = z.infer<typeof TaggedItemSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

/* ------------------------------------------------------------------ */
/* AI payloads                                                         */
/* ------------------------------------------------------------------ */

export const AnalysisSchema = z.object({
  roleType: z.string(),
  summary: z.string(),
  coreRequirements: z.array(z.string()),
  niceToHaves: z.array(z.string()),
  keywords: z.array(z.string()),
  matches: z.array(
    z.object({
      requirement: z.string(),
      profileItems: z.array(z.string()),
      strength: z.enum(["strong", "partial", "weak"]),
    }),
  ),
  gaps: z.array(z.object({ gap: z.string(), note: z.string() })),
  questions: z.array(z.object({ id: z.string(), question: z.string(), why: z.string() })),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const ProbingAnswerSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string(),
  skipped: z.boolean(),
});
export type ProbingAnswer = z.infer<typeof ProbingAnswerSchema>;

export const RationaleSchema = z.object({
  included: z.array(z.string()),
  excluded: z.array(z.string()),
  framing: z.array(z.string()),
  openQuestions: z.array(z.string()),
});
export type Rationale = z.infer<typeof RationaleSchema>;

export const APPLICATION_STATUSES = ["Draft", "Finalised", "Applied", "Interview", "Rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
