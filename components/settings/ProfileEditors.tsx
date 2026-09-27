"use client";

import { useState } from "react";
import { Briefcase, ChevronDown, ChevronRight, FolderGit2, GraduationCap, Trophy, Users } from "lucide-react";
import { newId } from "@/lib/ids";
import {
  ACTIVITY_KINDS,
  PROJECT_TYPES,
  type BankBullet,
  type Profile,
  type ProfileCompany,
  type ProfileRole,
  type TaggedItem,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemAttachments } from "./Attachments";
import { AddButton, AutoTextarea, ConfirmDelete, EmptyState, FieldLabel, InlineInput, SortableList, TagInput } from "@/components/common/fields";

type Update = (fn: (p: Profile) => Profile, activity?: string) => void;

export const BULLET_TAGS = ["technical", "business", "leadership", "ml", "stakeholder", "analytics", "product", "data", "impact"];

const newBullet = (text = ""): BankBullet => ({ id: newId(), text, tags: [], metrics: "" });

/* ------------------------------------------------------------------ */

export function BulletBank({ bullets, onChange }: { bullets: BankBullet[]; onChange: (b: BankBullet[]) => void }) {
  const set = (id: string, patch: Partial<BankBullet>) => onChange(bullets.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <FieldLabel>Bullet bank · {bullets.length}</FieldLabel>
      </div>
      {bullets.length === 0 && <p className="px-1.5 text-xs text-muted-foreground">No bullets yet. Add every achievement, even ones that won&apos;t fit on one page.</p>}
      <SortableList
        items={bullets}
        onReorder={onChange}
        className="space-y-1"
        render={(b, handle) => (
          <div className="group flex items-start gap-1 rounded-lg border border-transparent p-1 hover:border-border hover:bg-muted/30">
            <div className="pt-1.5">{handle}</div>
            <span className="pt-1.5 text-muted-foreground">•</span>
            <div className="min-w-0 flex-1">
              <AutoTextarea value={b.text} onChange={(v) => set(b.id, { text: v })} placeholder="Achievement: action verb, what, how, result" autoFocus={!b.text} />
              <div className="flex flex-wrap items-center gap-1">
                <TagInput value={b.tags} onChange={(v) => set(b.id, { tags: v })} placeholder="tags" className="min-w-40 flex-1" suggestions={BULLET_TAGS} />
                <InlineInput value={b.metrics} onChange={(v) => set(b.id, { metrics: v })} placeholder="metrics (e.g. 35% fewer tickets)" className="w-60 text-xs" />
              </div>
            </div>
            <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <ConfirmDelete title="Delete this bullet?" onConfirm={() => onChange(bullets.filter((x) => x.id !== b.id))} />
            </div>
          </div>
        )}
      />
      <AddButton onClick={() => onChange([...bullets, newBullet()])}>Add bullet</AddButton>
    </div>
  );
}

function Collapsible({ header, children, defaultOpen = true, handle, actions }: { header: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; handle?: React.ReactNode; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-1 px-3 py-2.5">
        {handle}
        <button onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">{header}</div>
        {actions}
      </div>
      {open && <div className="border-t px-4 py-3">{children}</div>}
    </Card>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return <div className={cn("grid gap-x-4 gap-y-2", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 4 && "sm:grid-cols-4")}>{children}</div>;
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-0.5", className)}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ */

export function PersonalTab({ profile, update }: { profile: Profile; update: Update }) {
  const p = profile.personal;
  const set = (patch: Partial<Profile["personal"]>) => update((x) => ({ ...x, personal: { ...x.personal, ...patch } }));
  return (
    <Card className="px-5">
      <div>
        <h3 className="font-medium">Resume header</h3>
        <p className="text-sm text-muted-foreground">Used verbatim at the top of every resume. The AI never writes these.</p>
      </div>
      <Grid>
        <Field label="Full name">
          <InlineInput value={p.name} onChange={(v) => set({ name: v })} placeholder="Jeremiah William Sebastian" className="border-border" />
        </Field>
        <Field label="Email">
          <InlineInput value={p.email} onChange={(v) => set({ email: v })} placeholder="you@example.com" className="border-border" />
        </Field>
        <Field label="Phone">
          <InlineInput value={p.phone} onChange={(v) => set({ phone: v })} placeholder="+65 …" className="border-border" />
        </Field>
        <Field label="LinkedIn URL">
          <InlineInput value={p.linkedin} onChange={(v) => set({ linkedin: v })} placeholder="linkedin.com/in/…" className="border-border" />
        </Field>
      </Grid>
      <Grid>
        <Field label="Languages">
          <TagInput value={p.languages} onChange={(v) => set({ languages: v })} placeholder="English (Fluent)…" className="border-border" />
        </Field>
        <Field label="Work authorization">
          <TagInput value={p.workAuthorization} onChange={(v) => set({ workAuthorization: v })} placeholder="e.g. Singapore Student Pass" className="border-border" />
        </Field>
      </Grid>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function EducationTab({ profile, update }: { profile: Profile; update: Update }) {
  const setEdu = (id: string, patch: Partial<Profile["education"][number]>) =>
    update((p) => ({ ...p, education: p.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const add = () =>
    update((p) => ({
      ...p,
      education: [...p.education, { id: newId(), institution: "New institution", location: "", startDate: "", endDate: "", degree: "", grade: "", coursework: [], notes: "" }],
    }));
  if (!profile.education.length)
    return <EmptyState icon={<GraduationCap className="size-5" />} title="No education yet" description="Add your degrees, newest first." action={<Button onClick={add}>Add education</Button>} />;
  return (
    <div className="space-y-3">
      <SortableList
        items={profile.education}
        onReorder={(education) => update((p) => ({ ...p, education }))}
        className="space-y-3"
        render={(e, handle) => (
          <Collapsible
            handle={handle}
            header={<InlineInput value={e.institution} onChange={(v) => setEdu(e.id, { institution: v })} className="font-medium" />}
            actions={<ConfirmDelete title={`Delete ${e.institution}?`} onConfirm={() => update((p) => ({ ...p, education: p.education.filter((x) => x.id !== e.id) }), `Removed ${e.institution} from education`)} />}
          >
            <div className="space-y-2">
              <Grid>
                <Field label="Degree">
                  <InlineInput value={e.degree} onChange={(v) => setEdu(e.id, { degree: v })} placeholder="Master of IT in Business" />
                </Field>
                <Field label="Location">
                  <InlineInput value={e.location} onChange={(v) => setEdu(e.id, { location: v })} placeholder="Singapore" />
                </Field>
              </Grid>
              <Grid cols={3}>
                <Field label="Start">
                  <InlineInput value={e.startDate} onChange={(v) => setEdu(e.id, { startDate: v })} placeholder="Aug 2025" />
                </Field>
                <Field label="End">
                  <InlineInput value={e.endDate} onChange={(v) => setEdu(e.id, { endDate: v })} placeholder="Dec 2026" />
                </Field>
                <Field label="Grade">
                  <InlineInput value={e.grade} onChange={(v) => setEdu(e.id, { grade: v })} placeholder="GPA 3.8 / 4.0" />
                </Field>
              </Grid>
              <Field label="Coursework (optional)">
                <TagInput value={e.coursework} onChange={(v) => setEdu(e.id, { coursework: v })} placeholder="Add a course" />
              </Field>
              <Field label="Notes (for the AI)">
                <AutoTextarea value={e.notes} onChange={(v) => setEdu(e.id, { notes: v })} placeholder="Scholarships, honours, thesis…" />
              </Field>
              <ItemAttachments itemId={e.id} itemType="education" itemLabel={`${e.degree || "Degree"} @ ${e.institution}`} />
            </div>
          </Collapsible>
        )}
      />
      <AddButton onClick={add}>Add education</AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RoleBlock({ role, company, onChange, onDelete, handle }: { role: ProfileRole; company: string; onChange: (r: ProfileRole) => void; onDelete: () => void; handle: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const set = (patch: Partial<ProfileRole>) => onChange({ ...role, ...patch });
  return (
    <div className="rounded-lg border bg-muted/20">
      <div className="flex items-center gap-1 px-2 py-1.5">
        {handle}
        <button onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <InlineInput value={role.title} onChange={(v) => set({ title: v })} className="flex-1 font-medium" placeholder="Role title" />
        <InlineInput value={role.startDate} onChange={(v) => set({ startDate: v })} className="w-24 text-right text-xs" placeholder="Start" />
        <span className="text-muted-foreground">–</span>
        <InlineInput value={role.endDate} onChange={(v) => set({ endDate: v })} className="w-24 text-xs" placeholder="End" />
        <ConfirmDelete title={`Delete role "${role.title}"?`} description="Its bullet bank will be deleted too." onConfirm={onDelete} />
      </div>
      {open && (
        <div className="space-y-3 border-t px-3 py-2">
          <Field label="Context notes (for the AI, never printed)">
            <AutoTextarea value={role.contextNotes} onChange={(v) => set({ contextNotes: v })} placeholder="Team size, product, scope, anything the AI should know…" />
          </Field>
          <BulletBank bullets={role.bullets} onChange={(bullets) => set({ bullets })} />
          <ItemAttachments
            itemId={role.id}
            itemType="role"
            itemLabel={`${role.title} @ ${company}`}
            bankTexts={role.bullets.map((b) => b.text)}
            onAddBullet={(t) => set({ bullets: [...role.bullets, newBullet(t)] })}
          />
        </div>
      )}
    </div>
  );
}

export function ExperienceTab({ profile, update }: { profile: Profile; update: Update }) {
  const setCo = (id: string, fn: (c: ProfileCompany) => ProfileCompany) =>
    update((p) => ({ ...p, companies: p.companies.map((c) => (c.id === id ? fn(c) : c)) }));
  const add = () =>
    update((p) => ({
      ...p,
      companies: [...p.companies, { id: newId(), name: "New company", location: "", descriptor: "", notes: "", roles: [{ id: newId(), title: "Role title", startDate: "", endDate: "", contextNotes: "", bullets: [] }] }],
    }));
  if (!profile.companies.length)
    return <EmptyState icon={<Briefcase className="size-5" />} title="No experience yet" description="Add companies, their roles, and a bank of bullets for each role. Or import your master document." action={<Button onClick={add}>Add company</Button>} />;
  return (
    <div className="space-y-3">
      <SortableList
        items={profile.companies}
        onReorder={(companies) => update((p) => ({ ...p, companies }))}
        className="space-y-3"
        render={(c, handle) => (
          <Collapsible
            handle={handle}
            defaultOpen={profile.companies.length <= 3}
            header={
              <div className="flex items-center gap-2">
                <InlineInput value={c.name} onChange={(v) => setCo(c.id, (x) => ({ ...x, name: v }))} className="font-medium" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.roles.length} role{c.roles.length === 1 ? "" : "s"} · {c.roles.reduce((n, r) => n + r.bullets.length, 0)} bullets
                </span>
              </div>
            }
            actions={<ConfirmDelete title={`Delete ${c.name}?`} description="All roles and bullets under it will be deleted." onConfirm={() => update((p) => ({ ...p, companies: p.companies.filter((x) => x.id !== c.id) }), `Removed ${c.name} from profile`)} />}
          >
            <div className="space-y-3">
              <Grid>
                <Field label="Location">
                  <InlineInput value={c.location} onChange={(v) => setCo(c.id, (x) => ({ ...x, location: v }))} placeholder="Singapore" />
                </Field>
                <Field label="Descriptor (one italic line)">
                  <InlineInput value={c.descriptor} onChange={(v) => setCo(c.id, (x) => ({ ...x, descriptor: v }))} placeholder="Series A fintech serving…" />
                </Field>
              </Grid>
              <Field label="Notes (for the AI)">
                <AutoTextarea value={c.notes} onChange={(v) => setCo(c.id, (x) => ({ ...x, notes: v }))} placeholder="How to frame this company, context…" />
              </Field>
              <FieldLabel>Roles</FieldLabel>
              <SortableList
                items={c.roles}
                onReorder={(roles) => setCo(c.id, (x) => ({ ...x, roles }))}
                className="space-y-2"
                render={(r, rh) => (
                  <RoleBlock
                    role={r}
                    company={c.name}
                    handle={rh}
                    onChange={(nr) => setCo(c.id, (x) => ({ ...x, roles: x.roles.map((y) => (y.id === r.id ? nr : y)) }))}
                    onDelete={() => setCo(c.id, (x) => ({ ...x, roles: x.roles.filter((y) => y.id !== r.id) }))}
                  />
                )}
              />
              <AddButton onClick={() => setCo(c.id, (x) => ({ ...x, roles: [...x.roles, { id: newId(), title: "New role", startDate: "", endDate: "", contextNotes: "", bullets: [] }] }))}>Add role</AddButton>
            </div>
          </Collapsible>
        )}
      />
      <AddButton onClick={add}>Add company</AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ProjectsTab({ profile, update }: { profile: Profile; update: Update }) {
  const set = (id: string, patch: Partial<Profile["projects"][number]>) =>
    update((p) => ({ ...p, projects: p.projects.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const add = () =>
    update((p) => ({ ...p, projects: [...p.projects, { id: newId(), title: "New project", date: "", type: "Academic", description: "", techStack: [], links: [], bullets: [] }] }));
  if (!profile.projects.length)
    return <EmptyState icon={<FolderGit2 className="size-5" />} title="No projects yet" description="Academic, personal and startup projects. At most two appear on a resume." action={<Button onClick={add}>Add project</Button>} />;
  return (
    <div className="space-y-3">
      <SortableList
        items={profile.projects}
        onReorder={(projects) => update((p) => ({ ...p, projects }))}
        className="space-y-3"
        render={(pr, handle) => (
          <Collapsible
            handle={handle}
            defaultOpen={profile.projects.length <= 3}
            header={
              <div className="flex items-center gap-2">
                <InlineInput value={pr.title} onChange={(v) => set(pr.id, { title: v })} className="font-medium" />
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{pr.type}</span>
              </div>
            }
            actions={<ConfirmDelete title={`Delete ${pr.title}?`} onConfirm={() => update((p) => ({ ...p, projects: p.projects.filter((x) => x.id !== pr.id) }), `Removed project ${pr.title}`)} />}
          >
            <div className="space-y-3">
              <Grid cols={3}>
                <Field label="Date">
                  <InlineInput value={pr.date} onChange={(v) => set(pr.id, { date: v })} placeholder="Mar 2026" />
                </Field>
                <Field label="Type">
                  <select value={pr.type} onChange={(e) => set(pr.id, { type: e.target.value as (typeof PROJECT_TYPES)[number] })} className="h-7 w-full rounded-md border bg-background px-1.5 text-sm">
                    {PROJECT_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Tech stack">
                  <TagInput value={pr.techStack} onChange={(v) => set(pr.id, { techStack: v })} placeholder="Python, SQL…" />
                </Field>
              </Grid>
              <Field label="Description">
                <AutoTextarea value={pr.description} onChange={(v) => set(pr.id, { description: v })} placeholder="What it is, your role, outcome" />
              </Field>
              <Field label="Links">
                <TagInput value={pr.links} onChange={(v) => set(pr.id, { links: v })} placeholder="https://github.com/…" />
              </Field>
              <BulletBank bullets={pr.bullets} onChange={(bullets) => set(pr.id, { bullets })} />
              <ItemAttachments
                itemId={pr.id}
                itemType="project"
                itemLabel={pr.title}
                bankTexts={pr.bullets.map((b) => b.text)}
                onAddBullet={(t) => set(pr.id, { bullets: [...pr.bullets, newBullet(t)] })}
              />
            </div>
          </Collapsible>
        )}
      />
      <AddButton onClick={add}>Add project</AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ActivitiesTab({ profile, update }: { profile: Profile; update: Update }) {
  const set = (id: string, patch: Partial<Profile["activities"][number]>) =>
    update((p) => ({ ...p, activities: p.activities.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const add = () =>
    update((p) => ({ ...p, activities: [...p.activities, { id: newId(), organisation: "New organisation", title: "", date: "", kind: "Extracurricular", bullets: [] }] }));
  if (!profile.activities.length)
    return <EmptyState icon={<Users className="size-5" />} title="No activities yet" description="Clubs, leadership roles and volunteering." action={<Button onClick={add}>Add activity</Button>} />;
  return (
    <div className="space-y-3">
      <SortableList
        items={profile.activities}
        onReorder={(activities) => update((p) => ({ ...p, activities }))}
        className="space-y-3"
        render={(a, handle) => (
          <Collapsible
            handle={handle}
            header={
              <div className="flex items-center gap-2">
                <InlineInput value={a.organisation} onChange={(v) => set(a.id, { organisation: v })} className="font-medium" />
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs">{a.kind}</span>
              </div>
            }
            actions={<ConfirmDelete title={`Delete ${a.organisation}?`} onConfirm={() => update((p) => ({ ...p, activities: p.activities.filter((x) => x.id !== a.id) }))} />}
          >
            <div className="space-y-3">
              <Grid cols={3}>
                <Field label="Title">
                  <InlineInput value={a.title} onChange={(v) => set(a.id, { title: v })} placeholder="President" />
                </Field>
                <Field label="Date">
                  <InlineInput value={a.date} onChange={(v) => set(a.id, { date: v })} placeholder="Sep 2025 – Present" />
                </Field>
                <Field label="Kind">
                  <select value={a.kind} onChange={(e) => set(a.id, { kind: e.target.value as (typeof ACTIVITY_KINDS)[number] })} className="h-7 w-full rounded-md border bg-background px-1.5 text-sm">
                    {ACTIVITY_KINDS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              </Grid>
              <BulletBank bullets={a.bullets} onChange={(bullets) => set(a.id, { bullets })} />
              <ItemAttachments
                itemId={a.id}
                itemType="activity"
                itemLabel={`${a.title ? `${a.title}, ` : ""}${a.organisation}`}
                bankTexts={a.bullets.map((b) => b.text)}
                onAddBullet={(t) => set(a.id, { bullets: [...a.bullets, newBullet(t)] })}
              />
            </div>
          </Collapsible>
        )}
      />
      <AddButton onClick={add}>Add activity</AddButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TaggedList({ title, description, items, onChange, namePlaceholder, categoryPlaceholder }: { title: string; description: string; items: TaggedItem[]; onChange: (i: TaggedItem[]) => void; namePlaceholder: string; categoryPlaceholder: string }) {
  const set = (id: string, patch: Partial<TaggedItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  return (
    <Card className="gap-2 px-5">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
      <SortableList
        items={items}
        onReorder={onChange}
        className="space-y-0.5"
        render={(i, handle) => (
          <div className="group flex items-center gap-1 rounded-md hover:bg-muted/40">
            {handle}
            <InlineInput value={i.name} onChange={(v) => set(i.id, { name: v })} placeholder={namePlaceholder} className="flex-[2]" />
            <InlineInput value={i.category} onChange={(v) => set(i.id, { category: v })} placeholder={categoryPlaceholder} className="flex-1 text-xs text-muted-foreground" />
            <TagInput value={i.tags} onChange={(v) => set(i.id, { tags: v })} placeholder="tags" className="flex-1" />
            <div className="opacity-0 group-hover:opacity-100">
              <ConfirmDelete title={`Delete "${i.name}"?`} onConfirm={() => onChange(items.filter((x) => x.id !== i.id))} />
            </div>
          </div>
        )}
      />
      <div>
        <AddButton onClick={() => onChange([...items, { id: newId(), name: "", category: "", tags: [] }])}>Add</AddButton>
      </div>
    </Card>
  );
}

export function ListsTab({ profile, update }: { profile: Profile; update: Update }) {
  return (
    <div className="space-y-4">
      <TaggedList
        title="Technical skills"
        description="Grouped by category in the AI's view (e.g. Programming, BI, Cloud)."
        items={profile.skills}
        onChange={(skills) => update((p) => ({ ...p, skills }))}
        namePlaceholder="Python"
        categoryPlaceholder="Category"
      />
      <TaggedList
        title="Certifications"
        description="Name and year, e.g. AWS Certified Cloud Practitioner (2024)."
        items={profile.certifications}
        onChange={(certifications) => update((p) => ({ ...p, certifications }))}
        namePlaceholder="Certification (year)"
        categoryPlaceholder="Issuer"
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Trophy className="size-3.5" /> Volunteer and extracurricular experience lives under the Activities tab.
      </p>
    </div>
  );
}

export function StrategicTab({ profile, update }: { profile: Profile; update: Update }) {
  return (
    <Card className="px-5">
      <div>
        <h3 className="font-medium">Strategic notes</h3>
        <p className="text-sm text-muted-foreground">Framing preferences the AI should follow on every application: how to describe each company, your career narrative, what to emphasise or avoid.</p>
      </div>
      <AutoTextarea
        value={profile.strategicNotes}
        onChange={(v) => update((p) => ({ ...p, strategicNotes: v }))}
        minRows={14}
        className="border-border font-mono text-[13px]"
        placeholder="e.g. Describe Wisely.id as a seed-stage fintech; frame the SWE → analytics move as a deliberate progression…"
      />
    </Card>
  );
}
