import { z } from "zod";
import {
  ActivitySchema,
  BulletSchema,
  CompanySchema,
  EducationEntrySchema,
  ProjectSchema,
  RoleSchema,
  SECTION_KEYS,
  type Bullet,
  type Profile,
  type Resume,
  type SectionKey,
} from "./schemas";
import { newId } from "./ids";

export type { SectionKey };
export type AdditionalKey = "certifications" | "technicalSkills" | "languages" | "workAuthorization" | "volunteer";
export type ElementKind = "bullet" | "role" | "company" | "education" | "project" | "activity" | "additional" | "section";

export const ADDITIONAL_KEYS: AdditionalKey[] = [
  "certifications",
  "technicalSkills",
  "languages",
  "workAuthorization",
  "volunteer",
];
export const ADDITIONAL_LABELS: Record<AdditionalKey, string> = {
  certifications: "Certifications",
  technicalSkills: "Technical Skills",
  languages: "Language Skills",
  workAuthorization: "Work Authorization",
  volunteer: "Volunteer",
};
export const SECTION_LABELS: Record<SectionKey, string> = {
  education: "Education",
  experience: "Experience",
  academicProjects: "Academic Projects",
  extracurricular: "Extra-Curricular Activities / Leadership Roles",
  additional: "Additional",
};

/** Default section order, as in the base CV (projects before experience). */
export const SECTION_ORDER: SectionKey[] = [...SECTION_KEYS];

/** Id of the container holding the sections (for drag-and-drop reordering). */
export const SECTIONS_CONTAINER = "sections";

/** A resume's section order: its own order (deduplicated), with any missing sections appended in default order. */
export function sectionOrderOf(resume: Pick<Resume, "sectionOrder">): SectionKey[] {
  const own = (resume.sectionOrder ?? []).filter((k, i, a) => SECTION_KEYS.includes(k) && a.indexOf(k) === i);
  return [...own, ...SECTION_ORDER.filter((k) => !own.includes(k))];
}

export const additionalId = (k: AdditionalKey) => `additional.${k}`;
export const sectionId = (k: SectionKey) => `section.${k}`;

export type FoundElement = { id: string; kind: ElementKind; value: unknown; label: string };

/** Locate any selectable element by id. */
export function findElement(resume: Resume, id: string): FoundElement | null {
  if (id.startsWith("additional.")) {
    const k = id.slice(11) as AdditionalKey;
    if (!ADDITIONAL_KEYS.includes(k)) return null;
    return { id, kind: "additional", value: resume.additional[k] ?? [], label: `${ADDITIONAL_LABELS[k]} line` };
  }
  if (id.startsWith("section.")) {
    const k = id.slice(8) as SectionKey;
    if (!(k in SECTION_LABELS)) return null;
    return { id, kind: "section", value: resume[k] ?? [], label: `${SECTION_LABELS[k]} section` };
  }
  for (const e of resume.education) if (e.id === id) return { id, kind: "education", value: e, label: e.institution };
  for (const c of resume.experience) {
    if (c.id === id) return { id, kind: "company", value: c, label: c.name };
    for (const r of c.roles) {
      if (r.id === id) return { id, kind: "role", value: r, label: `${r.title} @ ${c.name}` };
      for (const b of r.bullets) if (b.id === id) return { id, kind: "bullet", value: b, label: `Bullet · ${r.title} @ ${c.name}` };
    }
  }
  for (const p of resume.academicProjects ?? []) {
    if (p.id === id) return { id, kind: "project", value: p, label: p.title };
    for (const b of p.bullets) if (b.id === id) return { id, kind: "bullet", value: b, label: `Bullet · ${p.title}` };
  }
  for (const a of resume.extracurricular ?? []) {
    if (a.id === id) return { id, kind: "activity", value: a, label: `${a.title} @ ${a.organisation}` };
    for (const b of a.bullets) if (b.id === id) return { id, kind: "bullet", value: b, label: `Bullet · ${a.organisation}` };
  }
  return null;
}

const sectionValueSchema: Record<SectionKey, z.ZodType> = {
  education: z.array(EducationEntrySchema),
  experience: z.array(CompanySchema),
  academicProjects: z.array(ProjectSchema),
  extracurricular: z.array(ActivitySchema),
  additional: z.object({
    certifications: z.array(z.string()).optional(),
    technicalSkills: z.array(z.string()),
    languages: z.array(z.string()),
    workAuthorization: z.array(z.string()),
    volunteer: z.array(z.string()).optional(),
  }),
};

/** Zod schema that a replacement value for this element must satisfy. */
export function schemaForElement(el: FoundElement): z.ZodType {
  switch (el.kind) {
    case "bullet":
      return BulletSchema;
    case "role":
      return RoleSchema;
    case "company":
      return CompanySchema;
    case "education":
      return EducationEntrySchema;
    case "project":
      return ProjectSchema;
    case "activity":
      return ActivitySchema;
    case "additional":
      return z.array(z.string());
    case "section":
      return sectionValueSchema[el.id.slice(8) as SectionKey];
  }
}

/** Recursively turn "" into undefined for optional fields the AI may fill with blanks. */
function cleanOptional<T>(v: T): T {
  if (Array.isArray(v)) return v.map(cleanOptional) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if ((k === "descriptor" || k === "grade" || k === "location" || k === "sourceRef") && val === "") continue;
      if (k === "coursework" && Array.isArray(val) && val.length === 0) continue;
      out[k] = cleanOptional(val);
    }
    // company.location is required
    if ("roles" in out && !("location" in out)) out.location = "";
    return out as T;
  }
  return v;
}

/** Replace an element (returns a new resume). Mutations happen on a deep clone. */
export function replaceElement(resume: Resume, id: string, value: unknown): Resume {
  const r = structuredClone(resume);
  value = cleanOptional(value);
  if (id.startsWith("additional.")) {
    const k = id.slice(11) as AdditionalKey;
    const arr = value as string[];
    if ((k === "certifications" || k === "volunteer") && arr.length === 0) delete r.additional[k];
    else r.additional[k] = arr;
    return r;
  }
  if (id.startsWith("section.")) {
    const k = id.slice(8) as SectionKey;
    (r as Record<string, unknown>)[k] = value;
    return r;
  }
  const swap = <T extends { id: string }>(arr: T[] | undefined) => {
    if (!arr) return false;
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) {
      arr[i] = value as T;
      return true;
    }
    return false;
  };
  if (swap(r.education)) return r;
  if (swap(r.experience)) return r;
  for (const c of r.experience) {
    if (swap(c.roles)) return r;
    for (const ro of c.roles) if (swap(ro.bullets)) return r;
  }
  if (swap(r.academicProjects)) return r;
  for (const p of r.academicProjects ?? []) if (swap(p.bullets)) return r;
  if (swap(r.extracurricular)) return r;
  for (const a of r.extracurricular ?? []) if (swap(a.bullets)) return r;
  return r;
}

/** Remove an element (returns a new resume). Empty parents are left in place. */
export function deleteElement(resume: Resume, id: string): Resume {
  const r = structuredClone(resume);
  if (id.startsWith("additional.")) {
    const k = id.slice(11) as AdditionalKey;
    if (k === "certifications" || k === "volunteer") delete r.additional[k];
    else r.additional[k] = [];
    return r;
  }
  if (id.startsWith("section.")) {
    const k = id.slice(8) as SectionKey;
    if (k === "academicProjects" || k === "extracurricular") delete r[k];
    else if (k === "education" || k === "experience") r[k] = [];
    return r;
  }
  const drop = <T extends { id: string }>(arr: T[] | undefined) => (arr ? arr.filter((x) => x.id !== id) : arr);
  r.education = drop(r.education)!;
  r.experience = drop(r.experience)!.map((c) => ({
    ...c,
    roles: drop(c.roles)!.map((ro) => ({ ...ro, bullets: drop(ro.bullets)! })),
  }));
  if (r.academicProjects) {
    r.academicProjects = drop(r.academicProjects)!.map((p) => ({ ...p, bullets: drop(p.bullets)! }));
    if (!r.academicProjects.length) delete r.academicProjects;
  }
  if (r.extracurricular) {
    r.extracurricular = drop(r.extracurricular)!.map((a) => ({ ...a, bullets: drop(a.bullets)! }));
    if (!r.extracurricular.length) delete r.extracurricular;
  }
  return r;
}

/**
 * Reorder the children of a container. `containerId` is SECTIONS_CONTAINER (whole sections, by section id),
 * a section id (its entries), a company id (roles) or a role/project/activity id (bullets).
 */
export function reorderChildren(resume: Resume, containerId: string, orderedIds: string[]): Resume {
  const r = structuredClone(resume);
  const sort = <T extends { id: string }>(arr: T[]) =>
    [...arr].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  if (containerId === SECTIONS_CONTAINER) {
    // Only visible sections are dragged; empty ones keep their slots and the visible ones fill the rest in the new order.
    const moved = orderedIds.map((id) => id.replace(/^section\./, "") as SectionKey).filter((k) => SECTION_KEYS.includes(k));
    const queue = [...moved];
    r.sectionOrder = sectionOrderOf(r).map((k) => (moved.includes(k) ? queue.shift()! : k));
    return r;
  }
  if (containerId.startsWith("section.")) {
    const k = containerId.slice(8) as SectionKey;
    if (k === "additional") return r;
    const arr = r[k] as { id: string }[] | undefined;
    if (arr) (r as Record<string, unknown>)[k] = sort(arr);
    return r;
  }
  for (const c of r.experience) {
    if (c.id === containerId) c.roles = sort(c.roles);
    for (const ro of c.roles) if (ro.id === containerId) ro.bullets = sort(ro.bullets);
  }
  for (const p of r.academicProjects ?? []) if (p.id === containerId) p.bullets = sort(p.bullets);
  for (const a of r.extracurricular ?? []) if (a.id === containerId) a.bullets = sort(a.bullets);
  return r;
}

/** Give every element a unique id (fixes AI-produced blanks/duplicates). Mutates and returns. */
export function ensureUniqueIds(resume: Resume): Resume {
  const seen = new Set<string>();
  const fix = <T extends { id: string }>(x: T) => {
    if (!x.id || seen.has(x.id) || x.id.startsWith("section.") || x.id.startsWith("additional.")) x.id = newId();
    seen.add(x.id);
  };
  resume.education.forEach(fix);
  resume.experience.forEach((c) => {
    fix(c);
    c.roles.forEach((r) => {
      fix(r);
      r.bullets.forEach(fix);
    });
  });
  resume.academicProjects?.forEach((p) => {
    fix(p);
    p.bullets.forEach(fix);
  });
  resume.extracurricular?.forEach((a) => {
    fix(a);
    a.bullets.forEach(fix);
  });
  return resume;
}

/** All bullets on the resume, with a context label. */
export function allBullets(resume: Resume): { bullet: Bullet; parentId: string; context: string }[] {
  const out: { bullet: Bullet; parentId: string; context: string }[] = [];
  for (const c of resume.experience)
    for (const r of c.roles) for (const b of r.bullets) out.push({ bullet: b, parentId: r.id, context: `${r.title} @ ${c.name}` });
  for (const p of resume.academicProjects ?? []) for (const b of p.bullets) out.push({ bullet: b, parentId: p.id, context: p.title });
  for (const a of resume.extracurricular ?? []) for (const b of a.bullets) out.push({ bullet: b, parentId: a.id, context: a.organisation });
  return out;
}

/** Every id in the profile that a resume bullet may cite as its sourceRef. */
export function profileSourceIds(profile: Profile): Set<string> {
  const ids = new Set<string>();
  profile.education.forEach((e) => ids.add(e.id));
  profile.companies.forEach((c) => {
    ids.add(c.id);
    c.roles.forEach((r) => {
      ids.add(r.id);
      r.bullets.forEach((b) => ids.add(b.id));
    });
  });
  profile.projects.forEach((p) => {
    ids.add(p.id);
    p.bullets.forEach((b) => ids.add(b.id));
  });
  profile.activities.forEach((a) => {
    ids.add(a.id);
    a.bullets.forEach((b) => ids.add(b.id));
  });
  profile.certifications.forEach((c) => ids.add(c.id));
  profile.skills.forEach((s) => ids.add(s.id));
  return ids;
}

/** Bullet ids whose sourceRef does not trace to the profile or an answered probing question. */
export function unsourcedBulletIds(resume: Resume, validRefs: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const { bullet } of allBullets(resume)) {
    const ref = bullet.sourceRef?.trim();
    if (!ref) {
      out.add(bullet.id);
      continue;
    }
    // A bullet may cite several sources separated by commas.
    const parts = ref.split(/[,\s]+/).filter(Boolean);
    if (!parts.some((p) => validRefs.has(p) || validRefs.has(p.replace(/^profile:/, "")))) out.add(bullet.id);
  }
  return out;
}

/** Plain text of the whole resume, for keyword matching. */
export function resumePlainText(r: Resume): string {
  const parts: string[] = [];
  r.education.forEach((e) => parts.push(e.institution, e.degree, e.grade ?? "", ...(e.coursework ?? [])));
  r.experience.forEach((c) => {
    parts.push(c.name, c.descriptor ?? "");
    c.roles.forEach((ro) => parts.push(ro.title, ...ro.bullets.map((b) => b.text)));
  });
  r.academicProjects?.forEach((p) => parts.push(p.title, ...p.bullets.map((b) => b.text)));
  r.extracurricular?.forEach((a) => parts.push(a.organisation, a.title, ...a.bullets.map((b) => b.text)));
  ADDITIONAL_KEYS.forEach((k) => parts.push(...(r.additional[k] ?? [])));
  return parts.join("\n");
}

/** Format long money amounts as $1K / $1M / $1B. */
export function formatMoney(text: string): string {
  return text.replace(/(US|S|SGD|USD)?\$\s?(\d{1,3}(?:,\d{3})+|\d{4,})(\.\d+)?(?![\dKMB])/g, (m, cur = "", digits) => {
    const n = Number(String(digits).replace(/,/g, ""));
    const fmt = (v: number, s: string) => `${cur}$${Number.isInteger(v) ? v : v.toFixed(1).replace(/\.0$/, "")}${s}`;
    if (n >= 1e9) return fmt(n / 1e9, "B");
    if (n >= 1e6) return fmt(n / 1e6, "M");
    if (n >= 1e3) return fmt(n / 1e3, "K");
    return m;
  });
}

/** Sanitise a "save as" filename. */
export function sanitiseFilename(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .replace(/\.pdf$/i, "")
      .slice(0, 120) || "resume"
  );
}

export function defaultSaveAs(name: string, company: string, role: string): string {
  return sanitiseFilename([name || "Resume", company, role].filter(Boolean).join("_"));
}

/** Split a comma-separated line, ignoring commas inside parentheses. */
export function splitList(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Set one text field of an element (manual double-click editing). Returns a new resume. */
export function setElementField(resume: Resume, id: string, field: string, text: string): Resume {
  const el = findElement(resume, id);
  if (!el) return resume;
  if (el.kind === "additional") return replaceElement(resume, id, splitList(text));
  const value = structuredClone(el.value) as Record<string, unknown>;
  if (field === "coursework") value.coursework = splitList(text);
  else value[field] = text;
  return replaceElement(resume, id, value);
}

/** Read a text field (for diffing against another version). */
export function getElementField(resume: Resume, id: string, field: string): string | undefined {
  const el = findElement(resume, id);
  if (!el) return undefined;
  if (el.kind === "additional") return (el.value as string[]).join(", ");
  const v = (el.value as Record<string, unknown>)[field];
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "string" ? v : undefined;
}

/** Children of a container, by id (for diff ghosts of removed items). */
export function childrenOf(resume: Resume, containerId: string): { id: string; kind: ElementKind; text: string }[] {
  if (containerId.startsWith("section.")) {
    const k = containerId.slice(8) as SectionKey;
    if (k === "education") return resume.education.map((e) => ({ id: e.id, kind: "education", text: e.institution }));
    if (k === "experience") return resume.experience.map((c) => ({ id: c.id, kind: "company", text: c.name }));
    if (k === "academicProjects") return (resume.academicProjects ?? []).map((p) => ({ id: p.id, kind: "project", text: p.title }));
    if (k === "extracurricular") return (resume.extracurricular ?? []).map((a) => ({ id: a.id, kind: "activity", text: a.organisation }));
    return [];
  }
  const el = findElement(resume, containerId);
  if (!el) return [];
  const v = el.value as { roles?: { id: string; title: string }[]; bullets?: { id: string; text: string }[] };
  if (el.kind === "company") return (v.roles ?? []).map((r) => ({ id: r.id, kind: "role", text: r.title }));
  return (v.bullets ?? []).map((b) => ({ id: b.id, kind: "bullet", text: b.text }));
}

/** Insert a bullet at the end of a role / project / activity. */
export function appendBullet(resume: Resume, containerId: string, bullet: Bullet): Resume {
  const r = structuredClone(resume);
  for (const c of r.experience) for (const ro of c.roles) if (ro.id === containerId) ro.bullets.push(bullet);
  for (const p of r.academicProjects ?? []) if (p.id === containerId) p.bullets.push(bullet);
  for (const a of r.extracurricular ?? []) if (a.id === containerId) a.bullets.push(bullet);
  return r;
}
