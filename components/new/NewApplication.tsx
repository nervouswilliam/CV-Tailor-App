"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, BookmarkPlus, Check, FastForward, Loader2, Search, Sparkles, SkipForward, Target, TriangleAlert, Wand2 } from "lucide-react";
import { api, streamApi } from "@/lib/client-api";
import type { Analysis, ProbingAnswer } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AiErrorAlert } from "@/components/common/AiErrorAlert";
import { FieldLabel } from "@/components/common/fields";

type QA = ProbingAnswer & { queued?: boolean };
type AppPayload = {
  application: { id: string; company: string; roleTitle: string; jobUrl: string | null; jobDescription: string; analysis: Analysis | null; probingQA: QA[] };
  versions: unknown[];
};

export function NewApplication() {
  const router = useRouter();
  const params = useSearchParams();
  const [appId, setAppId] = useState<string | null>(params.get("id"));
  const [form, setForm] = useState({ company: "", roleTitle: "", jobUrl: "", jobDescription: "" });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [qa, setQa] = useState<QA[]>([]);
  const [phase, setPhase] = useState<"form" | "analysing" | "questions" | "drafting">("form");
  const [error, setError] = useState<unknown>(null);
  const [draftChars, setDraftChars] = useState(0);
  const [loading, setLoading] = useState(!!params.get("id"));

  // Resume an in-progress application (?id=…).
  useEffect(() => {
    const id = params.get("id");
    if (!id) return;
    api<AppPayload>(`/api/applications/${id}`)
      .then(({ application: a, versions }) => {
        if (versions.length) return router.replace(`/applications/${id}`);
        setForm({ company: a.company, roleTitle: a.roleTitle, jobUrl: a.jobUrl ?? "", jobDescription: a.jobDescription });
        if (a.analysis) {
          setAnalysis(a.analysis);
          setQa(a.probingQA);
          setPhase("questions");
        }
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [params, router]);

  const analyse = useCallback(async () => {
    setError(null);
    setPhase("analysing");
    try {
      let id = appId;
      if (!id) {
        const app = await api<{ id: string }>("/api/applications", { method: "POST", json: form });
        id = app.id;
        setAppId(id);
        window.history.replaceState(null, "", `/applications/new?id=${id}`);
      } else {
        await api(`/api/applications/${id}`, { method: "PATCH", json: { company: form.company, roleTitle: form.roleTitle, jobUrl: form.jobUrl || null, jobDescription: form.jobDescription } });
      }
      const a = await api<Analysis>("/api/ai/analyse", { method: "POST", json: { applicationId: id } });
      setAnalysis(a);
      setQa(a.questions.map((q) => ({ questionId: q.id, question: q.question, answer: "", skipped: false })));
      setPhase("questions");
    } catch (e) {
      setError(e);
      setPhase(analysis ? "questions" : "form");
    }
  }, [appId, form, analysis]);

  const saveQa = useCallback(async (next: QA[]) => {
    if (appId) await api(`/api/applications/${appId}`, { method: "PATCH", json: { probingQA: next } });
  }, [appId]);

  const draft = useCallback(
    async (skipAll = false) => {
      if (!appId) return;
      setError(null);
      const next = skipAll ? qa.map((q) => ({ ...q, skipped: true })) : qa.map((q) => ({ ...q, skipped: q.skipped || !q.answer.trim() }));
      setQa(next);
      setPhase("drafting");
      setDraftChars(0);
      try {
        await saveQa(next);
        await streamApi<{ versionId: string }>("/api/ai/draft", { applicationId: appId }, { onProgress: (n) => setDraftChars(n) });
        toast.success("Draft ready");
        router.push(`/applications/${appId}?fresh=1`);
      } catch (e) {
        setError(e);
        setPhase("questions");
      }
    },
    [appId, qa, saveQa, router],
  );

  const addToProfile = async (q: QA) => {
    try {
      const res = await api<{ suggestions: unknown[] }>("/api/ai/suggest-profile-additions", {
        method: "POST",
        json: { applicationId: appId, text: `Q: ${q.question}\nA: ${q.answer}` },
      });
      const next = qa.map((x) => (x.questionId === q.questionId ? { ...x, queued: true } : x));
      setQa(next);
      await saveQa(next);
      toast.success(res.suggestions.length ? `${res.suggestions.length} new fact(s) sent to your profile inbox` : "Nothing new found. It may already be in your profile.", {
        action: res.suggestions.length ? { label: "Review", onClick: () => router.push("/settings?tab=suggestions") } : undefined,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const canAnalyse = form.company.trim() && form.roleTitle.trim() && form.jobDescription.trim().length >= 50;

  if (loading) return <div className="p-8"><div className="h-96 animate-pulse rounded-xl bg-muted" /></div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">New application</h1>
          <Stepper phase={phase} />
        </div>

        {error != null && <AiErrorAlert error={error} onRetry={phase === "form" ? analyse : undefined} />}

        {(phase === "form" || phase === "analysing") && (
          <Card className="px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel className="px-0">Company</FieldLabel>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Grab" autoFocus />
              </div>
              <div className="space-y-1.5">
                <FieldLabel className="px-0">Role title</FieldLabel>
                <Input value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} placeholder="Data Analyst" />
              </div>
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="px-0">Job posting URL (optional, for reference only)</FieldLabel>
              <Input value={form.jobUrl} onChange={(e) => setForm({ ...form, jobUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <FieldLabel className="px-0">Job description</FieldLabel>
              <Textarea
                value={form.jobDescription}
                onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
                placeholder="Paste the full job description: responsibilities, requirements, nice-to-haves…"
                className="min-h-80 text-[13px] leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canAnalyse) analyse();
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{form.jobDescription.trim().split(/\s+/).filter(Boolean).length} words</span>
              <Button size="lg" onClick={analyse} disabled={!canAnalyse || phase === "analysing"}>
                {phase === "analysing" ? <Loader2 className="animate-spin" /> : <Search />}
                {phase === "analysing" ? "Analysing…" : "Analyse"}
              </Button>
            </div>
          </Card>
        )}

        {phase === "analysing" && <AnalysisSkeleton />}

        {(phase === "questions" || phase === "drafting") && analysis && (
          <>
            <AnalysisView analysis={analysis} company={form.company} role={form.roleTitle} onEdit={() => setPhase("form")} />

            <Card className="px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 font-medium">
                    <Sparkles className="size-4 text-primary" /> A few questions before drafting
                  </h2>
                  <p className="text-sm text-muted-foreground">Answers can surface experience that isn&apos;t in your profile yet. Skip any you like.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => draft(true)} disabled={phase === "drafting"}>
                  <FastForward /> Skip all and draft
                </Button>
              </div>
              <div className="space-y-4">
                {qa.map((q, i) => {
                  const meta = analysis.questions.find((x) => x.id === q.questionId);
                  return (
                    <div key={q.questionId} className={cn("space-y-2 rounded-xl border p-4 transition-opacity", q.skipped && "opacity-50")}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">
                            <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                            {q.question}
                          </div>
                          {meta?.why && <div className="mt-0.5 text-xs text-muted-foreground">Why: {meta.why}</div>}
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            const next = qa.map((x) => (x.questionId === q.questionId ? { ...x, skipped: !x.skipped } : x));
                            setQa(next);
                            void saveQa(next);
                          }}
                        >
                          <SkipForward /> {q.skipped ? "Unskip" : "Skip"}
                        </Button>
                      </div>
                      {!q.skipped && (
                        <>
                          <Textarea
                            value={q.answer}
                            onChange={(e) => setQa(qa.map((x) => (x.questionId === q.questionId ? { ...x, answer: e.target.value, queued: false } : x)))}
                            onBlur={() => void saveQa(qa)}
                            placeholder="Your answer (facts, numbers, tools, outcomes)…"
                            className="min-h-20 text-[13px]"
                          />
                          {q.answer.trim().length > 15 && (
                            <div className="flex justify-end">
                              {q.queued ? (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Check className="size-3" /> Sent to profile inbox
                                </span>
                              ) : (
                                <Button variant="outline" size="xs" onClick={() => addToProfile(q)}>
                                  <BookmarkPlus /> Add to my profile
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-3 border-t pt-4">
                {phase === "drafting" && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {draftChars ? `Writing… ${draftChars.toLocaleString()} characters` : "Thinking about what to include…"}
                  </span>
                )}
                <Button size="lg" onClick={() => draft(false)} disabled={phase === "drafting"}>
                  <Wand2 /> Generate CV <ArrowRight />
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Stepper({ phase }: { phase: string }) {
  const steps = ["Job description", "Analysis & questions", "Draft"];
  const idx = phase === "form" || phase === "analysing" ? 0 : phase === "questions" ? 1 : 2;
  return (
    <ol className="mt-2 flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={cn("grid size-5 place-items-center rounded-full text-[11px] font-medium", i < idx ? "bg-primary text-primary-foreground" : i === idx ? "bg-primary/15 text-primary ring-1 ring-primary" : "bg-muted text-muted-foreground")}>
            {i < idx ? <Check className="size-3" /> : i + 1}
          </span>
          <span className={cn(i === idx ? "font-medium" : "text-muted-foreground")}>{s}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="gap-3 px-5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </Card>
      ))}
    </div>
  );
}

const strengthStyle = {
  strong: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  weak: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

function AnalysisView({ analysis, company, role, onEdit }: { analysis: Analysis; company: string; role: string; onEdit: () => void }) {
  return (
    <div className="space-y-4">
      <Card className="px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{analysis.roleType}</div>
            <h2 className="text-lg font-semibold">
              {role} · {company}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{analysis.summary}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit JD
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {analysis.keywords.map((k) => (
            <Badge key={k} variant="secondary">
              {k}
            </Badge>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-2 px-5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Target className="size-4 text-primary" /> Core requirements
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {analysis.coreRequirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {analysis.niceToHaves.length > 0 && (
            <>
              <h4 className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Nice to have</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {analysis.niceToHaves.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="gap-2 px-5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Check className="size-4 text-emerald-600" /> Profile matches
          </h3>
          <ul className="space-y-2 text-sm">
            {analysis.matches.map((m) => (
              <li key={m.requirement} className="space-y-0.5">
                <div className="flex items-start gap-2">
                  <span className={cn("mt-0.5 shrink-0 rounded px-1.5 text-[11px] font-medium capitalize", strengthStyle[m.strength])}>{m.strength}</span>
                  <span className="font-medium">{m.requirement}</span>
                </div>
                {m.profileItems.length > 0 && <div className="pl-[4.2rem] text-xs text-muted-foreground">{m.profileItems.join(" · ")}</div>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {analysis.gaps.length > 0 && (
        <Card className="gap-2 px-5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-amber-500" /> Gaps
          </h3>
          <ul className="grid gap-2 text-sm md:grid-cols-2">
            {analysis.gaps.map((g) => (
              <li key={g.gap} className="rounded-lg bg-muted/40 p-2.5">
                <div className="font-medium">{g.gap}</div>
                <div className="text-xs text-muted-foreground">{g.note}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
