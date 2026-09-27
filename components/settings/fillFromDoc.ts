import { newId } from "@/lib/ids";
import { PROJECT_TYPES, type BankBullet, type Profile } from "@/lib/schemas";

/** Form values the AI extracted from an attached document (see AttachmentSummarySchema.fields). */
export type DocFields = {
  title: string;
  organisation: string;
  location: string;
  startDate: string;
  endDate: string;
  date: string;
  description: string;
  techStack: string[];
  links: string[];
  projectType: string;
  degree: string;
  grade: string;
  coursework: string[];
  contextNotes: string;
};

export type DocForFill = {
  itemId: string;
  itemType: "role" | "project" | "activity" | "education";
  summary: { fields?: DocFields; suggestedBullets?: string[] } | null;
};

/** Values the "Add …" buttons create; a field still holding one of these counts as empty. */
const PLACEHOLDERS = new Set(["", "new project", "new role", "role title", "new company", "new organisation", "new institution"]);
const isEmpty = (v: string | undefined) => !v || PLACEHOLDERS.has(v.trim().toLowerCase());
const clean = (v: string | undefined) => (v ?? "").trim();
/** Append items from `b` that aren't already in `a` (case-insensitive). */
const union = (a: string[], b: string[]) => {
  const seen = new Set(a.map((x) => x.toLowerCase()));
  const out = [...a];
  for (const raw of b) {
    const x = raw.trim();
    if (x && !seen.has(x.toLowerCase())) {
      seen.add(x.toLowerCase());
      out.push(x);
    }
  }
  return out;
};
const bullets = (texts: string[] | undefined): BankBullet[] => (texts ?? []).filter((t) => t.trim()).map((text) => ({ id: newId(), text, tags: [], metrics: "" }));

/**
 * Fill a profile item's empty (or placeholder) fields from a summarised document.
 * Never overwrites what the user typed; list fields (tech stack, links) are merged.
 * An empty bullet bank gets the document's suggested bullets.
 * Returns the new profile and the labels of the fields that changed.
 */
export function fillFromDoc(profile: Profile, doc: DocForFill): { profile: Profile; filled: string[] } {
  const f = doc.summary?.fields;
  const filled: string[] = [];
  if (!f && !doc.summary?.suggestedBullets?.length) return { profile, filled };
  const p = structuredClone(profile);

  /** Set a string field when it's empty and the document has a value. */
  const fillStr = <T extends Record<string, unknown>>(obj: T, key: keyof T & string, value: string | undefined, label: string) => {
    const v = clean(value);
    if (v && isEmpty(obj[key] as string)) {
      (obj as Record<string, unknown>)[key] = v;
      filled.push(label);
    }
  };
  const fillList = <T extends Record<string, unknown>>(obj: T, key: keyof T & string, value: string[] | undefined, label: string) => {
    const before = (obj[key] as string[]) ?? [];
    const after = union(before, value ?? []);
    if (after.length > before.length) {
      (obj as Record<string, unknown>)[key] = after;
      filled.push(label);
    }
  };
  const fillBank = (obj: { bullets: BankBullet[] }) => {
    if (obj.bullets.length === 0 && doc.summary?.suggestedBullets?.length) {
      obj.bullets = bullets(doc.summary.suggestedBullets);
      filled.push(`${obj.bullets.length} bullet${obj.bullets.length === 1 ? "" : "s"}`);
    }
  };

  if (doc.itemType === "project") {
    const pr = p.projects.find((x) => x.id === doc.itemId);
    if (!pr) return { profile, filled };
    if (f) {
      const wasNew = isEmpty(pr.title);
      fillStr(pr, "title", f.title, "title");
      fillStr(pr, "date", f.date || [f.startDate, f.endDate].filter(Boolean).join(" – "), "date");
      fillStr(pr, "description", f.description, "description");
      fillList(pr, "techStack", f.techStack, "tech stack");
      fillList(pr, "links", f.links, "links");
      // Type defaults to "Academic", so only set it on a brand-new project.
      if (wasNew && (PROJECT_TYPES as readonly string[]).includes(f.projectType) && pr.type !== f.projectType) {
        pr.type = f.projectType as (typeof PROJECT_TYPES)[number];
        filled.push("type");
      }
    }
    fillBank(pr);
  } else if (doc.itemType === "role") {
    const company = p.companies.find((c) => c.roles.some((r) => r.id === doc.itemId));
    const role = company?.roles.find((r) => r.id === doc.itemId);
    if (!company || !role) return { profile, filled };
    if (f) {
      fillStr(role, "title", f.title, "role title");
      fillStr(role, "startDate", f.startDate, "start date");
      fillStr(role, "endDate", f.endDate, "end date");
      fillStr(role, "contextNotes", f.contextNotes, "context notes");
      fillStr(company, "name", f.organisation, "company");
      fillStr(company, "location", f.location, "location");
      fillStr(company, "descriptor", f.description, "company descriptor");
    }
    fillBank(role);
  } else if (doc.itemType === "activity") {
    const a = p.activities.find((x) => x.id === doc.itemId);
    if (!a) return { profile, filled };
    if (f) {
      fillStr(a, "organisation", f.organisation, "organisation");
      fillStr(a, "title", f.title, "title");
      fillStr(a, "date", f.date || [f.startDate, f.endDate].filter(Boolean).join(" – "), "date");
    }
    fillBank(a);
  } else if (doc.itemType === "education") {
    const e = p.education.find((x) => x.id === doc.itemId);
    if (!e || !f) return { profile, filled };
    fillStr(e, "institution", f.organisation, "institution");
    fillStr(e, "degree", f.degree, "degree");
    fillStr(e, "location", f.location, "location");
    fillStr(e, "startDate", f.startDate, "start date");
    fillStr(e, "endDate", f.endDate, "end date");
    fillStr(e, "grade", f.grade, "grade");
    fillList(e, "coursework", f.coursework, "coursework");
  }

  return { profile: filled.length ? p : profile, filled };
}
