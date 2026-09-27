"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, CircleAlert, Download, FileJson, Inbox, KeyRound, Loader2, Plug, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import { newId } from "@/lib/ids";
import { profileToMarkdown } from "@/lib/profile-md";
import { ProfileSchema, type Profile } from "@/lib/schemas";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete, EmptyState, FieldLabel } from "@/components/common/fields";
import { cn } from "@/lib/utils";

type Update = (fn: (p: Profile) => Profile, activity?: string) => void;

/* ------------------------------------------------------------------ */

type Provider = "api" | "claude-plan";
type SettingsDto = { systemPrompt: string; model: string; provider: Provider; apiKeySet: boolean; oauthTokenSet: boolean };

export function AiTab() {
  const [s, setS] = useState<SettingsDto | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState<Provider>("api");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<SettingsDto>("/api/settings").then((d) => {
      setS(d);
      setPrompt(d.systemPrompt);
      setModel(d.model);
      setProvider(d.provider);
    });
  }, []);

  if (!s) return <Card className="h-64 animate-pulse" />;
  const dirty = prompt !== s.systemPrompt || model !== s.model || provider !== s.provider;

  const save = async () => {
    setSaving(true);
    try {
      const d = await api<SettingsDto>("/api/settings", { method: "PUT", json: { systemPrompt: prompt, model, provider } });
      setS(d);
      toast.success("AI settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    const d = await api<{ systemPrompt: string }>("/api/settings/reset-prompt", { method: "POST" });
    setPrompt(d.systemPrompt);
    setS({ ...s, systemPrompt: d.systemPrompt });
    toast.success("System prompt reset to prompts/system.md");
  };
  const test = async () => {
    setTesting(true);
    try {
      await api("/api/settings/test", { method: "POST", json: { model, provider } });
      toast.success(`Connected to ${model} via ${provider === "claude-plan" ? "your Claude plan" : "the Anthropic API"}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="px-5">
        <div>
          <h3 className="font-medium">Provider</h3>
          <p className="text-sm text-muted-foreground">How the app pays for AI calls. Save to apply.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ProviderOption
            active={provider === "claude-plan"}
            onClick={() => setProvider("claude-plan")}
            title="Claude plan"
            body="Uses your Claude Pro / Max / Team subscription through the Claude Agent SDK. Calls count toward your plan's usage limits; no API credits needed."
            status={s.oauthTokenSet ? "CLAUDE_CODE_OAUTH_TOKEN set" : "Uses your `claude` CLI login"}
            ok={s.oauthTokenSet ? true : null}
          />
          <ProviderOption
            active={provider === "api"}
            onClick={() => setProvider("api")}
            title="Anthropic API"
            body="Pay per token with an API key from console.anthropic.com. The editor shows the cost per application."
            status={s.apiKeySet ? "ANTHROPIC_API_KEY set" : "ANTHROPIC_API_KEY not set"}
            ok={s.apiKeySet}
          />
        </div>
        {provider === "claude-plan" && !s.oauthTokenSet && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <p>Sign in once in a terminal, then click Test connection:</p>
              <p>
                <code className="rounded bg-background px-1 font-mono">claude</code> → type <code className="rounded bg-background px-1 font-mono">/login</code> → sign in with your Claude account.
              </p>
              <p className="text-muted-foreground">
                Or run <code className="font-mono">claude setup-token</code> and put the token in <code className="font-mono">.env.local</code> as <code className="font-mono">CLAUDE_CODE_OAUTH_TOKEN=…</code>, then restart <code className="font-mono">npm run dev</code>.
              </p>
            </div>
          </div>
        )}
        {provider === "api" && !s.apiKeySet && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            Add <code className="font-mono">ANTHROPIC_API_KEY=…</code> to <code className="font-mono">.env.local</code> in the project folder and restart <code className="font-mono">npm run dev</code>. The key stays on the server and is never sent to the browser.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1 space-y-1">
            <FieldLabel className="px-0">Model</FieldLabel>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-5" className="font-mono" />
          </div>
          <Button variant="outline" onClick={test} disabled={testing || (provider === "api" && !s.apiKeySet)}>
            {testing ? <Loader2 className="animate-spin" /> : <Plug />} Test connection
          </Button>
        </div>
      </Card>
      <Card className="px-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">System prompt</h3>
            <p className="text-sm text-muted-foreground">Sent with every AI call, followed by the app&apos;s output rules and your profile.</p>
          </div>
          <ConfirmDelete
            title="Reset the system prompt?"
            description="Your edits will be replaced with the contents of prompts/system.md."
            label="Reset"
            onConfirm={reset}
            trigger={(open) => (
              <Button variant="ghost" size="sm" onClick={open}>
                <RotateCcw /> Reset to default
              </Button>
            )}
          />
        </div>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[420px] font-mono text-[12.5px] leading-relaxed" />
        <div className="flex justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => { setPrompt(s.systemPrompt); setModel(s.model); }}>
              Discard
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || saving}>
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ProviderOption({ active, onClick, title, body, status, ok }: { active: boolean; onClick: () => void; title: string; body: string; status: string; ok: boolean | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("space-y-1.5 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50", active && "border-primary bg-primary/5 ring-1 ring-primary")}
    >
      <div className="flex items-center gap-2 font-medium">
        <span className={cn("grid size-4 place-items-center rounded-full border", active && "border-primary bg-primary")}>
          {active && <span className="size-1.5 rounded-full bg-primary-foreground" />}
        </span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
      <p className={cn("text-xs", ok === true ? "text-emerald-600 dark:text-emerald-400" : ok === false ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{status}</p>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function mergeProfiles(a: Profile, b: Profile): Profile {
  const fill = (x: string, y: string) => x || y;
  const uniq = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    personal: {
      name: fill(a.personal.name, b.personal.name),
      email: fill(a.personal.email, b.personal.email),
      phone: fill(a.personal.phone, b.personal.phone),
      linkedin: fill(a.personal.linkedin, b.personal.linkedin),
      languages: uniq(a.personal.languages, b.personal.languages),
      workAuthorization: uniq(a.personal.workAuthorization, b.personal.workAuthorization),
    },
    education: [...a.education, ...b.education],
    companies: [...a.companies, ...b.companies],
    projects: [...a.projects, ...b.projects],
    activities: [...a.activities, ...b.activities],
    certifications: [...a.certifications, ...b.certifications],
    skills: [...a.skills, ...b.skills.filter((s) => !a.skills.some((x) => x.name.toLowerCase() === s.name.toLowerCase()))],
    strategicNotes: [a.strategicNotes, b.strategicNotes].filter((s) => s.trim()).join("\n\n"),
  };
}

function counts(p: Profile) {
  const bullets =
    p.companies.reduce((n, c) => n + c.roles.reduce((m, r) => m + r.bullets.length, 0), 0) +
    p.projects.reduce((n, x) => n + x.bullets.length, 0) +
    p.activities.reduce((n, x) => n + x.bullets.length, 0);
  return [
    ["Education", p.education.length],
    ["Companies", p.companies.length],
    ["Roles", p.companies.reduce((n, c) => n + c.roles.length, 0)],
    ["Bullets", bullets],
    ["Projects", p.projects.length],
    ["Activities", p.activities.length],
    ["Skills", p.skills.length],
    ["Certifications", p.certifications.length],
  ] as const;
}

export function ImportExportTab({ profile, replace }: { profile: Profile; replace: (p: Profile, activity: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [review, setReview] = useState<Profile | null>(null);
  const reviewMd = useMemo(() => (review ? profileToMarkdown(review, { withIds: false }) : ""), [review]);
  const existingEmpty = counts(profile).every(([, n]) => n === 0);

  const parse = async () => {
    setParsing(true);
    try {
      const p = await api<Profile>("/api/ai/parse-profile", { method: "POST", json: { text } });
      setReview(p);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const restoreJson = async (file: File) => {
    try {
      const parsed = ProfileSchema.parse(JSON.parse(await file.text()));
      setReview(parsed);
    } catch {
      toast.error("That file is not a valid profile backup.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="px-5">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-primary" /> Import master document
          </h3>
          <p className="text-sm text-muted-foreground">Paste your existing Master Knowledge Document. The AI turns it into a structured profile, which you review before anything is saved.</p>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full text of your master document here…" className="min-h-60 text-[13px]" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{text.length.toLocaleString()} characters</span>
          <Button onClick={parse} disabled={parsing || text.trim().length < 20}>
            {parsing ? <Loader2 className="animate-spin" /> : <Sparkles />} {parsing ? "Parsing… (can take a minute)" : "Parse with AI"}
          </Button>
        </div>
      </Card>

      <Card className="px-5">
        <div>
          <h3 className="font-medium">Backup</h3>
          <p className="text-sm text-muted-foreground">Download the whole profile, or restore it from a JSON backup.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/profile/export?format=json" className={buttonVariants({ variant: "outline" })}>
            <FileJson /> Export JSON
          </a>
          <a href="/api/profile/export?format=md" className={buttonVariants({ variant: "outline" })}>
            <Download /> Export Markdown
          </a>
          <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
            <Upload /> Restore from JSON
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restoreJson(e.target.files[0])} />
          </label>
        </div>
      </Card>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review imported profile</DialogTitle>
            <DialogDescription>Check what was extracted. You can edit everything afterwards in the other tabs.</DialogDescription>
          </DialogHeader>
          {review && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {counts(review).map(([k, n]) => (
                  <Badge key={k} variant="secondary">
                    {k}: {n}
                  </Badge>
                ))}
              </div>
              <pre className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{reviewMd}</pre>
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Cancel
            </Button>
            {!existingEmpty && (
              <Button
                variant="outline"
                onClick={async () => {
                  await replace(mergeProfiles(profile, review!), "Merged imported master document into profile");
                  setReview(null);
                  setText("");
                }}
              >
                Merge into current profile
              </Button>
            )}
            <Button
              onClick={async () => {
                await replace(review!, "Imported master document into profile");
                setReview(null);
                setText("");
              }}
            >
              <Check /> {existingEmpty ? "Save profile" : "Replace current profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type SuggestionDto = { id: string; text: string; kind: string; status: string; createdAt: string; application: { company: string; roleTitle: string } | null };

type Destination = { key: string; label: string; group: string; apply: (p: Profile, text: string) => Profile };

function destinations(p: Profile): Destination[] {
  const bb = (text: string) => ({ id: newId(), text, tags: [], metrics: "" });
  const out: Destination[] = [];
  for (const c of p.companies)
    for (const r of c.roles)
      out.push({
        key: `role:${r.id}`,
        label: `${r.title} @ ${c.name}`,
        group: "Role bullet bank",
        apply: (x, t) => ({ ...x, companies: x.companies.map((cc) => (cc.id !== c.id ? cc : { ...cc, roles: cc.roles.map((rr) => (rr.id === r.id ? { ...rr, bullets: [...rr.bullets, bb(t)] } : rr)) })) }),
      });
  for (const c of p.companies)
    for (const r of c.roles)
      out.push({
        key: `ctx:${r.id}`,
        label: `${r.title} @ ${c.name}`,
        group: "Role context notes",
        apply: (x, t) => ({ ...x, companies: x.companies.map((cc) => (cc.id !== c.id ? cc : { ...cc, roles: cc.roles.map((rr) => (rr.id === r.id ? { ...rr, contextNotes: [rr.contextNotes, t].filter(Boolean).join("\n") } : rr)) })) }),
      });
  for (const pr of p.projects)
    out.push({ key: `proj:${pr.id}`, label: pr.title, group: "Project bullet bank", apply: (x, t) => ({ ...x, projects: x.projects.map((pp) => (pp.id === pr.id ? { ...pp, bullets: [...pp.bullets, bb(t)] } : pp)) }) });
  for (const a of p.activities)
    out.push({ key: `act:${a.id}`, label: a.organisation, group: "Activity bullets", apply: (x, t) => ({ ...x, activities: x.activities.map((aa) => (aa.id === a.id ? { ...aa, bullets: [...aa.bullets, bb(t)] } : aa)) }) });
  out.push({ key: "project:new", label: "New project", group: "Other", apply: (x, t) => ({ ...x, projects: [...x.projects, { id: newId(), title: t.slice(0, 60), date: "", type: "Personal", description: t, techStack: [], links: [], bullets: [] }] }) });
  out.push({ key: "skill", label: "Skill", group: "Other", apply: (x, t) => ({ ...x, skills: [...x.skills, { id: newId(), name: t, category: "", tags: [] }] }) });
  out.push({ key: "cert", label: "Certification", group: "Other", apply: (x, t) => ({ ...x, certifications: [...x.certifications, { id: newId(), name: t, category: "", tags: [] }] }) });
  out.push({ key: "notes", label: "Strategic notes", group: "Other", apply: (x, t) => ({ ...x, strategicNotes: [x.strategicNotes, t].filter(Boolean).join("\n") }) });
  return out;
}

export function SuggestionsTab({ profile, update, onCount }: { profile: Profile; update: Update; onCount?: (n: number) => void }) {
  const [items, setItems] = useState<SuggestionDto[] | null>(null);
  const [accepting, setAccepting] = useState<SuggestionDto | null>(null);
  const [text, setText] = useState("");
  const [dest, setDest] = useState("");
  const dests = useMemo(() => destinations(profile), [profile]);

  const load = () => api<SuggestionDto[]>("/api/suggestions").then((d) => { setItems(d); onCount?.(d.length); });
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (s: SuggestionDto, status: "accepted" | "dismissed", destination?: string) => {
    await api(`/api/suggestions/${s.id}`, { method: "PATCH", json: { status, destination } });
    const rest = (items ?? []).filter((x) => x.id !== s.id);
    setItems(rest);
    onCount?.(rest.length);
  };

  const suggestedDest = (s: SuggestionDto) =>
    s.kind === "skill" ? "skill" : s.kind === "certification" ? "cert" : s.kind === "project" ? "project:new" : dests.find((d) => d.group === "Role bullet bank")?.key ?? "notes";

  if (!items) return <Card className="h-40 animate-pulse" />;
  if (!items.length)
    return <EmptyState icon={<Inbox className="size-5" />} title="Inbox zero" description="When your probing answers or chat reveal new experience, it shows up here so you can add it to your profile." />;

  const groups = [...new Set(dests.map((d) => d.group))];
  return (
    <div className="space-y-2">
      {items.map((s) => (
        <Card key={s.id} size="sm" className="flex-row items-start gap-3 px-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm">{s.text}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="capitalize">{s.kind}</Badge>
              {s.application && <span>from {s.application.company} · {s.application.roleTitle}</span>}
              <span>{new Date(s.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <Button size="sm" onClick={() => { setAccepting(s); setText(s.text); setDest(suggestedDest(s)); }}>
            <Check /> Accept
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStatus(s, "dismissed")}>
            <X /> Dismiss
          </Button>
        </Card>
      ))}

      <Dialog open={!!accepting} onOpenChange={(o) => !o && setAccepting(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add to profile</DialogTitle>
            <DialogDescription>Edit the wording if needed and choose where it belongs.</DialogDescription>
          </DialogHeader>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24" />
          <select value={dest} onChange={(e) => setDest(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {dests.filter((d) => d.group === g).map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccepting(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                const d = dests.find((x) => x.key === dest);
                if (!d || !accepting) return;
                update((p) => d.apply(p, text.trim()));
                await setStatus(accepting, "accepted", `${d.group}: ${d.label}`);
                toast.success(`Added to ${d.group.toLowerCase()}`);
                setAccepting(null);
              }}
              disabled={!text.trim()}
            >
              Add to profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
