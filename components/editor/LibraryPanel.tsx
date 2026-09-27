"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GripVertical, Plus, Search, Library, Briefcase, FolderGit2, Users } from "lucide-react";
import type { BankBullet, Profile, Resume } from "@/lib/schemas";
import { allBullets } from "@/lib/resume-utils";
import { cn } from "@/lib/utils";

export type LibraryAdd = { kind: "bullet" | "company" | "role" | "project" | "activity"; id: string; label: string; text?: string };

/** Profile items not currently on the page. Bullets can be dragged onto a role, or added via the AI. */
export function LibraryPanel({ profile, resume, onAdd, busy }: { profile: Profile | null; resume: Resume; onAdd: (item: LibraryAdd) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const used = useMemo(() => {
    const refs = new Set<string>();
    for (const { bullet } of allBullets(resume)) for (const p of (bullet.sourceRef ?? "").split(/[,\s]+/)) if (p) refs.add(p);
    return {
      refs,
      companies: new Set(resume.experience.map((c) => c.name.trim().toLowerCase())),
      projects: new Set((resume.academicProjects ?? []).map((p) => p.title.trim().toLowerCase())),
      activities: new Set((resume.extracurricular ?? []).map((a) => a.organisation.trim().toLowerCase())),
    };
  }, [resume]);

  if (!profile) return <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>;

  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const unusedBullets = (bs: BankBullet[]) => bs.filter((b) => !used.refs.has(b.id) && b.text.trim() && match(b.text));

  const sections: { key: string; icon: React.ReactNode; title: string; groups: { id: string; kind: LibraryAdd["kind"]; title: string; sub?: string; onPage: boolean; bullets: BankBullet[] }[] }[] = [
    {
      key: "exp",
      icon: <Briefcase className="size-3.5" />,
      title: "Experience",
      groups: profile.companies.flatMap((c) =>
        c.roles.map((r) => ({
          id: r.id,
          kind: (used.companies.has(c.name.trim().toLowerCase()) ? "role" : "company") as LibraryAdd["kind"],
          title: r.title,
          sub: c.name,
          onPage: used.companies.has(c.name.trim().toLowerCase()) && (used.refs.has(r.id) || r.bullets.some((b) => used.refs.has(b.id))),
          bullets: unusedBullets(r.bullets),
        })),
      ),
    },
    {
      key: "proj",
      icon: <FolderGit2 className="size-3.5" />,
      title: "Projects",
      groups: profile.projects.map((p) => ({ id: p.id, kind: "project" as const, title: p.title, sub: p.type, onPage: used.projects.has(p.title.trim().toLowerCase()), bullets: unusedBullets(p.bullets) })),
    },
    {
      key: "act",
      icon: <Users className="size-3.5" />,
      title: "Activities",
      groups: profile.activities.map((a) => ({ id: a.id, kind: "activity" as const, title: a.organisation, sub: a.title, onPage: used.activities.has(a.organisation.trim().toLowerCase()), bullets: unusedBullets(a.bullets) })),
    },
  ];

  const empty = sections.every((s) => s.groups.every((g) => g.onPage && !g.bullets.length));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your profile" className="h-8 w-full rounded-lg border bg-background pr-2 pl-7 text-sm outline-none focus:border-ring" />
        </div>
        <p className="mt-1.5 px-0.5 text-[11px] leading-snug text-muted-foreground">Drag a bullet onto a role on the page, or click + to let the AI place it.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
        {profile.companies.length + profile.projects.length + profile.activities.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <Library className="mx-auto mb-2 size-5" />
            Your profile is empty. <Link href="/settings?tab=import" className="text-primary underline">Import your master doc</Link>.
          </div>
        )}
        {empty && profile.companies.length > 0 && <p className="p-3 text-sm text-muted-foreground">Everything in your profile is already on the page.</p>}
        {sections.map((s) => {
          const groups = s.groups.filter((g) => (!g.onPage && match(`${g.title} ${g.sub}`)) || g.bullets.length);
          if (!groups.length) return null;
          return (
            <section key={s.key} className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.icon} {s.title}
              </h4>
              {groups.map((g) => (
                <div key={g.id} className="rounded-lg border bg-background">
                  <div className="flex items-start gap-1.5 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{g.title}</div>
                      {g.sub && <div className="truncate text-[11px] text-muted-foreground">{g.sub}</div>}
                    </div>
                    {!g.onPage && (
                      <button
                        disabled={busy}
                        onClick={() => onAdd({ kind: g.kind, id: g.id, label: g.sub && g.kind !== "project" ? `${g.title} @ ${g.sub}` : g.title })}
                        className="flex shrink-0 items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                        title="Ask the AI to add this to the resume"
                      >
                        <Plus className="size-3" /> Add
                      </button>
                    )}
                  </div>
                  {g.bullets.length > 0 && (
                    <ul className="space-y-0.5 border-t px-1 py-1">
                      {g.bullets.map((b) => (
                        <li
                          key={b.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/x-cv-bullet", JSON.stringify({ bankId: b.id, text: b.text }));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          className={cn("group flex cursor-grab items-start gap-1 rounded-md px-1 py-1 text-xs leading-snug hover:bg-muted active:cursor-grabbing")}
                        >
                          <GripVertical className="mt-0.5 size-3 shrink-0 text-muted-foreground/40" />
                          <span className="flex-1">{b.text}</span>
                          <button
                            disabled={busy}
                            onClick={() => onAdd({ kind: "bullet", id: b.id, label: b.text.slice(0, 50), text: b.text })}
                            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
                            title="Ask the AI to add this bullet"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
