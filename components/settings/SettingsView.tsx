"use client";

import { useEffect, useState } from "react";
import { Bot, Briefcase, Check, CloudUpload, FolderGit2, GraduationCap, Inbox, Loader2, ListChecks, Lightbulb, User, Users, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "./useProfile";
import { ActivitiesTab, EducationTab, ExperienceTab, ListsTab, PersonalTab, ProjectsTab, StrategicTab } from "./ProfileEditors";
import { AiTab, ImportExportTab, SuggestionsTab } from "./SystemTabs";
import { api } from "@/lib/client-api";
import { AttachmentsProvider, type AttachmentDto } from "./Attachments";
import { fillFromDoc } from "./fillFromDoc";

const TABS = [
  { key: "personal", label: "Personal info", icon: User },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "experience", label: "Experience", icon: Briefcase },
  { key: "projects", label: "Projects", icon: FolderGit2 },
  { key: "activities", label: "Activities & volunteer", icon: Users },
  { key: "lists", label: "Skills & certifications", icon: ListChecks },
  { key: "strategy", label: "Strategic notes", icon: Lightbulb },
  { key: "suggestions", label: "Suggestions inbox", icon: Inbox },
  { key: "import", label: "Import / export", icon: CloudUpload },
  { key: "ai", label: "AI settings", icon: Bot },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function SettingsView() {
  const { profile, update, replace, state } = useProfile();
  const [tab, setTab] = useState<TabKey>("personal");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab comes from the URL, only known in the browser
    if (t && TABS.some((x) => x.key === t)) setTab(t);
    api<unknown[]>("/api/suggestions").then((d) => setPending(d.length)).catch(() => {});
  }, []);

  const choose = (t: TabKey) => {
    setTab(t);
    window.history.replaceState(null, "", `/settings?tab=${t}`);
  };
  const current = TABS.find((t) => t.key === tab)!;

  // Copy a summarised document's field values into its item's empty fields.
  const onFill = (doc: AttachmentDto) => {
    let filled: string[] = [];
    update((p) => {
      const r = fillFromDoc(p, doc);
      filled = r.filled;
      return r.profile;
    });
    return filled;
  };

  return (
    <AttachmentsProvider onFill={onFill} profileReady={!!profile}>
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Your profile is the single source of truth the AI draws from.</p>
        </div>
        <SaveIndicator state={state} />
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-56 shrink-0 space-y-0.5 overflow-y-auto border-r bg-background/60 p-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => choose(key)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                tab === key && "bg-muted font-medium text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {key === "suggestions" && pending > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">{pending}</span>}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-4 p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <current.icon className="size-4 text-primary" /> {current.label}
            </h2>
            {!profile && tab !== "ai" ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : (
              <>
                {tab === "personal" && <PersonalTab profile={profile!} update={update} />}
                {tab === "education" && <EducationTab profile={profile!} update={update} />}
                {tab === "experience" && <ExperienceTab profile={profile!} update={update} />}
                {tab === "projects" && <ProjectsTab profile={profile!} update={update} />}
                {tab === "activities" && <ActivitiesTab profile={profile!} update={update} />}
                {tab === "lists" && <ListsTab profile={profile!} update={update} />}
                {tab === "strategy" && <StrategicTab profile={profile!} update={update} />}
                {tab === "suggestions" && <SuggestionsTab profile={profile!} update={update} onCount={setPending} />}
                {tab === "import" && <ImportExportTab profile={profile!} replace={replace} />}
                {tab === "ai" && <AiTab />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </AttachmentsProvider>
  );
}

function SaveIndicator({ state }: { state: string }) {
  if (state === "idle") return null;
  return (
    <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", state === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
      {state === "saving" && <Loader2 className="size-3 animate-spin" />}
      {state === "saved" && <Check className="size-3" />}
      {state === "error" && <CircleAlert className="size-3" />}
      {state === "saving" ? "Saving…" : state === "saved" ? "All changes saved" : "Save failed"}
    </span>
  );
}
