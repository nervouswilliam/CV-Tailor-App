"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity as ActivityIcon,
  Copy,
  Download,
  FileDown,
  FilePlus2,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Building2,
  CalendarDays,
  Files,
  Inbox,
  User,
  ArrowUpDown,
  Flag,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { APPLICATION_STATUSES, type Resume } from "@/lib/schemas";
import { MitbTemplate } from "@/components/resume/MitbTemplate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDelete, EmptyState } from "@/components/common/fields";
import { cn } from "@/lib/utils";

type AppRow = {
  id: string;
  company: string;
  roleTitle: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  resume: Resume | null;
  lastExport: { id: string; filename: string; createdAt: string } | null;
};
type ListDto = { stats: { total: number; thisWeek: number; mostRecentCompany: string | null }; applications: AppRow[] };
type ActivityRow = { id: string; type: string; message: string; applicationId: string | null; createdAt: string };

export const STATUS_STYLE: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Finalised: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Applied: "bg-primary/15 text-primary",
  Interview: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<ListDto | null>(null);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    api<ListDto>("/api/applications").then(setData).catch((e) => toast.error(e.message));
    api<ActivityRow[]>("/api/activity?limit=25").then(setActivity).catch(() => setActivity([]));
  };
  useEffect(() => {
    load();
    try {
      const v = localStorage.getItem("dashboard-view");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saved view is browser-only, restored after hydration
      if (v === "grid" || v === "table") setView(v);
    } catch {}
  }, []);
  const chooseView = (v: "grid" | "table") => {
    setView(v);
    try {
      localStorage.setItem("dashboard-view", v);
    } catch {}
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.applications ?? []).filter(
      (a) => (status === "All" || a.status === status) && (!needle || `${a.company} ${a.roleTitle}`.toLowerCase().includes(needle)),
    );
  }, [data, q, status]);

  const open = (a: AppRow) => router.push(a.versionCount ? `/applications/${a.id}` : `/applications/new?id=${a.id}`);

  const setAppStatus = async (a: AppRow, s: string) => {
    setData((d) => d && { ...d, applications: d.applications.map((x) => (x.id === a.id ? { ...x, status: s } : x)) });
    await api(`/api/applications/${a.id}`, { method: "PATCH", json: { status: s } }).catch((e) => toast.error(e.message));
    api<ActivityRow[]>("/api/activity?limit=25").then(setActivity).catch(() => {});
  };

  const download = async (a: AppRow) => {
    setBusy(a.id);
    try {
      const res = await fetch(`/api/applications/${a.id}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "resume.pdf";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Downloaded ${name}`);
      load();
    } catch (e) {
      toast.error("PDF export failed", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (a: AppRow) => {
    try {
      const res = await api<{ id: string; hasResume: boolean }>(`/api/applications/${a.id}/duplicate`, { method: "POST" });
      toast.success(`Duplicated ${a.company}`);
      router.push(res.hasResume ? `/applications/${res.id}` : `/applications/new?id=${res.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (a: AppRow) => {
    try {
      await api(`/api/applications/${a.id}`, { method: "DELETE" });
      toast.success(`Deleted ${a.company} — ${a.roleTitle}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const actions = { open, download, duplicate, remove, setAppStatus, busy };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] gap-6 p-6 lg:p-8">
        <div className="min-w-0 flex-1 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Applications</h1>
              <p className="text-sm text-muted-foreground">Every tailored CV you&apos;ve generated.</p>
            </div>
            <Link href="/applications/new" className={buttonVariants({ size: "lg" })}>
              <FilePlus2 /> New Application
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={<Files className="size-4" />} label="CVs generated" value={data ? String(data.stats.total) : null} />
            <Stat icon={<CalendarDays className="size-4" />} label="This week" value={data ? String(data.stats.thisWeek) : null} />
            <Stat icon={<Building2 className="size-4" />} label="Most recent company" value={data ? data.stats.mostRecentCompany ?? "—" : null} />
          </div>

          {data && data.applications.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="size-5" />}
              title="No applications yet"
              description="Paste a job description and get a tailored, one-page MITB resume in about a minute. Set up your profile first so the AI has something to work with."
              action={
                <div className="flex gap-2">
                  <Link href="/settings?tab=import" className={buttonVariants({ variant: "outline" })}>
                    <User /> Set up profile
                  </Link>
                  <Link href="/applications/new" className={buttonVariants()}>
                    <FilePlus2 /> New Application
                  </Link>
                </div>
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-60 flex-1">
                  <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search company or role"
                    className="h-9 w-full rounded-lg border bg-background pr-3 pl-8 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {["All", ...APPLICATION_STATUSES].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={cn("h-8 rounded-full border px-3 text-xs transition-colors", status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-lg border bg-background p-0.5">
                  <button onClick={() => chooseView("grid")} className={cn("rounded-md p-1.5", view === "grid" ? "bg-muted" : "text-muted-foreground")} aria-label="Card view">
                    <LayoutGrid className="size-4" />
                  </button>
                  <button onClick={() => chooseView("table")} className={cn("rounded-md p-1.5", view === "table" ? "bg-muted" : "text-muted-foreground")} aria-label="Table view">
                    <List className="size-4" />
                  </button>
                </div>
              </div>

              {!data ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No applications match your filters.</p>
              ) : view === "grid" ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((a) => (
                    <AppCard key={a.id} a={a} {...actions} />
                  ))}
                </div>
              ) : (
                <AppTable rows={rows} {...actions} />
              )}
            </>
          )}
        </div>

        <aside className="hidden w-72 shrink-0 lg:block">
          <Card className="sticky top-0 gap-3 px-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <ActivityIcon className="size-4 text-primary" /> Activity
            </h2>
            {!activity ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="relative space-y-3 border-l pl-4">
                {activity.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute top-1 -left-[21px] grid size-2.5 place-items-center rounded-full bg-background ring-2 ring-primary/40" />
                    <div className="flex items-start gap-1.5 text-sm leading-snug">
                      <ActivityGlyph type={ev.type} />
                      {ev.applicationId ? (
                        <Link href={`/applications/${ev.applicationId}`} className="hover:underline">
                          {ev.message}
                        </Link>
                      ) : (
                        <span>{ev.message}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{timeAgo(ev.createdAt)}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ActivityGlyph({ type }: { type: string }) {
  const cls = "mt-0.5 size-3.5 shrink-0 text-muted-foreground";
  if (type === "generate") return <Wand2 className={cls} />;
  if (type === "export") return <FileDown className={cls} />;
  if (type === "edit") return <Pencil className={cls} />;
  if (type === "profile") return <Inbox className={cls} />;
  if (type === "status") return <Flag className={cls} />;
  if (type === "delete") return <Trash2 className={cls} />;
  if (type === "duplicate") return <Copy className={cls} />;
  return <ArrowUpDown className={cls} />;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <Card size="sm" className="flex-row items-center gap-3 px-4">
      <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        {value === null ? <div className="mt-1 h-5 w-16 animate-pulse rounded bg-muted" /> : <div className="truncate text-lg font-semibold">{value}</div>}
      </div>
    </Card>
  );
}

type Actions = {
  open: (a: AppRow) => void;
  download: (a: AppRow) => void;
  duplicate: (a: AppRow) => void;
  remove: (a: AppRow) => void;
  setAppStatus: (a: AppRow, s: string) => void;
  busy: string | null;
};

function StatusSelect({ a, setAppStatus }: { a: AppRow; setAppStatus: Actions["setAppStatus"] }) {
  return (
    <select
      value={a.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setAppStatus(a, e.target.value)}
      className={cn("h-6 cursor-pointer appearance-none rounded-full border-0 px-2.5 text-[11px] font-medium outline-none", STATUS_STYLE[a.status])}
      aria-label="Status"
    >
      {APPLICATION_STATUSES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}

function RowMenu({ a, open, download, duplicate, remove, busy }: { a: AppRow } & Actions) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ConfirmDelete
        title={`Delete ${a.company} — ${a.roleTitle}?`}
        description="The application, all its versions and exported PDFs will be deleted."
        onConfirm={() => remove(a)}
        trigger={(openConfirm) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
              {busy === a.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => open(a)}>
                <FileText /> Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => download(a)} disabled={!a.versionCount}>
                <Download /> Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicate(a)}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={openConfirm}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </div>
  );
}

function Thumbnail({ resume }: { resume: Resume | null }) {
  const scale = 0.36;
  return (
    <div className="relative h-52 overflow-hidden rounded-t-xl border-b bg-muted/60">
      {resume ? (
        <div className="pointer-events-none absolute top-4 left-1/2 origin-top -translate-x-1/2 shadow-md" style={{ width: 793.7 * scale, height: 1122.5 * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 793.7 }}>
            <MitbTemplate resume={resume} />
          </div>
        </div>
      ) : (
        <div className="grid h-full place-items-center text-xs text-muted-foreground">Not generated yet</div>
      )}
    </div>
  );
}

function AppCard({ a, ...actions }: { a: AppRow } & Actions) {
  return (
    <Card className="group cursor-pointer gap-0 py-0 transition-shadow hover:shadow-md hover:ring-foreground/20" onClick={() => actions.open(a)}>
      <Thumbnail resume={a.resume} />
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="truncate font-medium">{a.company}</div>
          <div className="truncate text-sm text-muted-foreground">{a.roleTitle}</div>
          <div className="flex items-center gap-2 pt-1">
            <StatusSelect a={a} setAppStatus={actions.setAppStatus} />
            <span className="text-[11px] text-muted-foreground" title={`Created ${new Date(a.createdAt).toLocaleString()}`}>
              Edited {timeAgo(a.updatedAt)}
            </span>
          </div>
        </div>
        <RowMenu a={a} {...actions} />
      </div>
    </Card>
  );
}

function AppTable({ rows, ...actions }: { rows: AppRow[] } & Actions) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Company</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Created</th>
            <th className="px-4 py-2 font-medium">Last edited</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} onClick={() => actions.open(a)} className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
              <td className="px-4 py-2.5 font-medium">{a.company}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{a.roleTitle}</td>
              <td className="px-4 py-2.5">
                <StatusSelect a={a} setAppStatus={actions.setAppStatus} />
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(a.updatedAt)}</td>
              <td className="px-2">
                <RowMenu a={a} {...actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
}
