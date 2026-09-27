import type { BankBullet, Profile } from "./schemas";

const line = (label: string, v?: string | string[]) => {
  const s = Array.isArray(v) ? v.filter(Boolean).join(", ") : v;
  return s && s.trim() ? `- ${label}: ${s}\n` : "";
};

function bullets(bs: BankBullet[], withIds: boolean): string {
  return bs
    .map((b) => {
      const meta = [b.tags.length ? `tags: ${b.tags.join(", ")}` : "", b.metrics ? `metrics: ${b.metrics}` : ""]
        .filter(Boolean)
        .join("; ");
      return `  - ${withIds ? `[${b.id}] ` : ""}${b.text}${meta ? ` _(${meta})_` : ""}\n`;
    })
    .join("");
}

/** AI summary of a document attached to a profile item (see lib/attachments.ts). */
export type AttachedDoc = {
  filename: string;
  summary: { summary: string; keyFacts: string[]; metrics: string[]; tools: string[]; suggestedBullets: string[]; caveats: string };
};

function attachedDocs(docs: AttachedDoc[] | undefined): string {
  if (!docs?.length) return "";
  let md = "- Attached documents (summarised; these facts are part of the candidate's profile, cite the item id above as sourceRef):\n";
  for (const d of docs) {
    const s = d.summary;
    md += `  - "${d.filename}": ${s.summary}\n`;
    if (s.keyFacts.length) md += `    - Facts: ${s.keyFacts.join("; ")}\n`;
    if (s.metrics.length) md += `    - Metrics: ${s.metrics.join("; ")}\n`;
    if (s.tools.length) md += `    - Tools: ${s.tools.join(", ")}\n`;
    if (s.suggestedBullets.length) md += `    - Bullets supported by the document:\n${s.suggestedBullets.map((b) => `      - ${b}`).join("\n")}\n`;
    if (s.caveats.trim()) md += `    - Caveats: ${s.caveats}\n`;
  }
  return md;
}

/**
 * Serialise the structured profile to a readable "Master Knowledge Document".
 * With `withIds`, every element carries its id in [brackets] so the AI can cite it as a bullet's sourceRef.
 * `attachments` (item id → summarised documents) are listed under the item they belong to.
 */
export function profileToMarkdown(
  p: Profile,
  { withIds = true, attachments }: { withIds?: boolean; attachments?: Map<string, AttachedDoc[]> } = {},
): string {
  const id = (x: { id: string }) => (withIds ? ` [${x.id}]` : "");
  const docs = (itemId: string) => attachedDocs(attachments?.get(itemId));
  let md = "# Master Knowledge Document\n\n";

  md += "## Personal\n";
  md += line("Name", p.personal.name);
  md += line("Email", p.personal.email);
  md += line("Phone", p.personal.phone);
  md += line("LinkedIn", p.personal.linkedin);
  md += line("Languages", p.personal.languages);
  md += line("Work authorization", p.personal.workAuthorization);
  md += "\n";

  if (p.education.length) {
    md += "## Education\n";
    for (const e of p.education) {
      md += `### ${e.institution}${id(e)}\n`;
      md += line("Degree", e.degree);
      md += line("Location", e.location);
      md += line("Dates", [e.startDate, e.endDate].filter(Boolean).join(" – "));
      md += line("Grade", e.grade);
      md += line("Coursework", e.coursework);
      md += line("Notes", e.notes);
      md += docs(e.id);
      md += "\n";
    }
  }

  if (p.companies.length) {
    md += "## Experience\n";
    for (const c of p.companies) {
      md += `### ${c.name}${id(c)}\n`;
      md += line("Location", c.location);
      md += line("Descriptor", c.descriptor);
      md += line("Notes", c.notes);
      for (const r of c.roles) {
        md += `\n#### ${r.title}${id(r)} (${[r.startDate, r.endDate].filter(Boolean).join(" – ")})\n`;
        md += line("Context notes", r.contextNotes);
        if (r.bullets.length) md += "- Bullet bank:\n" + bullets(r.bullets, withIds);
        md += docs(r.id);
      }
      md += "\n";
    }
  }

  if (p.projects.length) {
    md += "## Projects\n";
    for (const pr of p.projects) {
      md += `### ${pr.title}${id(pr)} (${pr.type}${pr.date ? `, ${pr.date}` : ""})\n`;
      md += line("Description", pr.description);
      md += line("Tech stack", pr.techStack);
      md += line("Links", pr.links);
      if (pr.bullets.length) md += "- Bullet bank:\n" + bullets(pr.bullets, withIds);
      md += docs(pr.id);
      md += "\n";
    }
  }

  if (p.activities.length) {
    md += "## Extra-curricular, Leadership & Volunteer\n";
    for (const a of p.activities) {
      md += `### ${a.title ? `${a.title}, ` : ""}${a.organisation}${id(a)} (${a.kind}${a.date ? `, ${a.date}` : ""})\n`;
      if (a.bullets.length) md += bullets(a.bullets, withIds);
      md += docs(a.id);
      md += "\n";
    }
  }

  if (p.certifications.length) {
    md += "## Certifications\n";
    for (const c of p.certifications) md += `- ${c.name}${id(c)}${c.category ? ` (${c.category})` : ""}\n`;
    md += "\n";
  }

  if (p.skills.length) {
    md += "## Skills\n";
    const byCat = new Map<string, string[]>();
    for (const s of p.skills) {
      const k = s.category || "General";
      byCat.set(k, [...(byCat.get(k) ?? []), `${s.name}${id(s)}`]);
    }
    for (const [cat, names] of byCat) md += `- ${cat}: ${names.join(", ")}\n`;
    md += "\n";
  }

  if (p.strategicNotes.trim()) md += `## Strategic notes\n${p.strategicNotes.trim()}\n`;
  return md;
}
