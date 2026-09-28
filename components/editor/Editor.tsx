"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Download,
  Flag,
  Loader2,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Redo2,
  Scissors,
  Undo2,
  X,
  Check,
  RotateCw,
  Eye,
  FolderOpen,
} from "lucide-react";
import { api, ApiError, streamApi } from "@/lib/client-api";
import { newId } from "@/lib/ids";
import { MitbTemplate } from "@/components/resume/MitbTemplate";
import { ResumeCanvas, CONTENT_H, LINE_PX, PAGE_W, type EditTarget } from "./ResumeCanvas";
import { PromptPopover } from "./PromptPopover";
import { RightPanel, type ChatMessage } from "./RightPanel";
import { LibraryPanel, type LibraryAdd } from "./LibraryPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { APPLICATION_STATUSES, type Analysis, type Profile, type Rationale, type Resume } from "@/lib/schemas";
import {
  appendBullet,
  allBullets,
  defaultSaveAs,
  deleteElement,
  findElement,
  profileSourceIds,
  reorderChildren,
  SECTIONS_CONTAINER,
  SECTION_LABELS,
  sectionOrderOf,
  replaceElement,
  resumePlainText,
  sanitiseFilename,
  setElementField,
  unsourcedBulletIds,
} from "@/lib/resume-utils";

type Version = { id: string; changeSummary: string; createdAt: string; resume: Resume };
type Payload = {
  application: {
    id: string;
    company: string;
    roleTitle: string;
    jobUrl: string | null;
    jobDescription: string;
    status: string;
    saveAs: string | null;
    analysis: Analysis | null;
    rationale: Rationale | null;
    probingQA: { questionId: string; answer: string; skipped: boolean }[];
  };
  versions: Version[];
  exports: { id: string; filename: string; createdAt: string; pageCount: number }[];
  usage: { cost: number; tokens: number; calls: number; planCalls: number };
};
type Proposal = {
  source: "element" | "document" | "fit" | "library";
  base: Resume;
  resume: Resume;
  summary: string;
  note?: string;
  ids?: string[];
  retry: () => void;
  activity: string;
  chatMsgId?: string;
};
type Measure = { overflowPx: number; overflowLines: number };

export function Editor({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [current, setCurrent] = useState<Resume | null>(null);
  const [usage, setUsage] = useState<Payload["usage"] | null>(null);
  const [status, setStatus] = useState("Draft");
  const [saveAs, setSaveAs] = useState("");
  const [rationale, setRationale] = useState<Rationale | null>(null);

  // History
  const undoStack = useRef<Resume[]>([]);
  const redoStack = useRef<Resume[]>([]);
  // Stack depths mirrored into state so the undo/redo buttons re-render.
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = () => setHist({ undo: undoStack.current.length, redo: redoStack.current.length });

  // Interaction
  const [selected, setSelected] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [popStatus, setPopStatus] = useState<"idle" | "loading">("idle");
  const [popError, setPopError] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"chat" | "rationale" | "jd" | "history">("chat");
  const [libraryOpen, setLibraryOpen] = useState(true);

  // Layout
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const autoFit = useRef(params.get("fresh") === "1");
  const [exporting, setExporting] = useState(false);
  // Folder PDFs are saved to ("" = the browser's normal download).
  const [exportDir, setExportDir] = useState("");
  const [savedExportDir, setSavedExportDir] = useState("");
  const [suggestedDir, setSuggestedDir] = useState("");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api<{ exportDir: string; suggestedExportDir: string }>("/api/preferences")
      .then((p) => {
        setExportDir(p.exportDir);
        setSavedExportDir(p.exportDir);
        setSuggestedDir(p.suggestedExportDir);
      })
      .catch(() => {});
  }, []);

  const saveExportDir = useCallback(
    async (dir: string) => {
      if (dir.trim() === savedExportDir) return setExportDir(savedExportDir);
      try {
        const p = await api<{ exportDir: string }>("/api/preferences", { method: "PUT", json: { exportDir: dir } });
        setExportDir(p.exportDir);
        setSavedExportDir(p.exportDir);
        toast.success(p.exportDir ? "PDFs will be saved to this folder" : "PDFs will download through the browser", { description: p.exportDir || undefined });
      } catch (e) {
        setExportDir(savedExportDir);
        toast.error("Can't use that folder", { description: (e as Error).message });
      }
    },
    [savedExportDir],
  );

  const browseFolder = useCallback(async () => {
    setPicking(true);
    try {
      const r = await api<{ path: string | null }>("/api/system/pick-folder", { method: "POST", json: { initial: exportDir || suggestedDir } });
      if (r.path) await saveExportDir(r.path);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPicking(false);
    }
  }, [exportDir, suggestedDir, saveExportDir]);
  const [confirmExport, setConfirmExport] = useState(false);

  /* ---------------- load ---------------- */

  const load = useCallback(async () => {
    try {
      const [p, prof] = await Promise.all([api<Payload>(`/api/applications/${id}`), api<Profile>("/api/profile")]);
      if (!p.versions.length) return router.replace(`/applications/new?id=${id}`);
      setData(p);
      setProfile(prof);
      setVersions(p.versions);
      setCurrent(p.versions[p.versions.length - 1].resume);
      undoStack.current = p.versions.slice(0, -1).map((v) => v.resume);
      redoStack.current = [];
      setHist({ undo: undoStack.current.length, redo: 0 });
      setUsage(p.usage);
      setStatus(p.application.status);
      setRationale(p.application.rationale);
      setSaveAs(p.application.saveAs || defaultSaveAs(prof.personal.name || p.versions[0].resume.header.name, p.application.company, p.application.roleTitle));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
  }, [load]);

  const refreshUsage = useCallback(() => {
    api<Payload["usage"]>(`/api/applications/${id}?usage=1`).then(setUsage).catch(() => {});
  }, [id]);

  /* ---------------- versions / undo ---------------- */

  // Latest resume for async callbacks; also updated synchronously inside commit().
  const currentRef = useRef<Resume | null>(null);
  useLayoutEffect(() => {
    currentRef.current = current;
  }, [current]);

  const commit = useCallback(
    async (next: Resume, changeSummary: string, opts: { activity?: string; mode?: "normal" | "undo" | "redo" } = {}) => {
      const prev = currentRef.current;
      if (!prev) return;
      const mode = opts.mode ?? "normal";
      if (mode === "normal") {
        undoStack.current.push(prev);
        redoStack.current = [];
      } else if (mode === "undo") redoStack.current.push(prev);
      else undoStack.current.push(prev);
      setCurrent(next);
      currentRef.current = next;
      syncHist();
      try {
        const v = await api<Version>(`/api/applications/${id}/versions`, { method: "POST", json: { resume: next, changeSummary, activity: opts.activity } });
        setVersions((vs) => [...vs, v]);
      } catch (e) {
        toast.error(`Could not save: ${(e as Error).message}`);
      }
    },
    [id],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    syncHist();
    void commit(prev, "Undo", { mode: "undo" });
  }, [commit]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    syncHist();
    void commit(next, "Redo", { mode: "redo" });
  }, [commit]);

  /* ---------------- derived ---------------- */

  const validRefs = useMemo(() => {
    const s = profile ? profileSourceIds(profile) : new Set<string>();
    for (const q of data?.application.probingQA ?? []) if (!q.skipped && q.answer.trim()) s.add(`answer:${q.questionId}`);
    s.add("chat");
    return s;
  }, [profile, data]);

  const previewVersion = previewId ? versions.find((v) => v.id === previewId) : null;
  const displayResume = previewVersion?.resume ?? proposal?.resume ?? current;
  const flagged = useMemo(() => (current && profile ? unsourcedBulletIds(current, validRefs) : new Set<string>()), [current, profile, validRefs]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const mode: "edit" | "diff" | "readonly" = previewVersion ? "readonly" : proposal ? "diff" : "edit";

  /* ---------------- zoom ---------------- */

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !fitWidth) return;
    const update = () => setZoom(Math.max(0.5, Math.min(1.5, (el.clientWidth - 64) / PAGE_W)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitWidth, data]);
  const setZoomManual = (z: number) => {
    setFitWidth(false);
    setZoom(Math.round(Math.max(0.5, Math.min(1.5, z)) * 10) / 10);
  };

  /* ---------------- AI: element edits ---------------- */

  const runElementEdit = useCallback(
    async (ids: string[], prompt: string, label?: string) => {
      const base = currentRef.current;
      if (!base) return;
      setPopStatus("loading");
      setPopError(null);
      try {
        const out = await api<{ edits: { id: string; after: unknown }[]; note: string }>("/api/ai/edit-element", {
          method: "POST",
          json: { applicationId: id, resume: base, ids, prompt },
        });
        let next = base;
        for (const e of out.edits) next = replaceElement(next, e.id, e.after);
        const n = out.edits.length;
        const bullets = ids.filter((x) => findElement(base, x)?.kind === "bullet").length;
        setProposal({
          source: "element",
          base,
          resume: next,
          ids,
          note: out.note,
          summary: `AI edit: ${label ?? (prompt.length > 60 ? prompt.slice(0, 57) + "…" : prompt)}`,
          activity: bullets === n ? `Edited ${n} bullet${n === 1 ? "" : "s"}` : `Edited ${n} element${n === 1 ? "" : "s"}`,
          // eslint-disable-next-line react-hooks/immutability -- retry runs later, after declaration
          retry: () => void runElementEdit(ids, prompt, label),
        });
      } catch (e) {
        setPopError(e instanceof ApiError ? e.message : "The AI request failed");
      } finally {
        setPopStatus("idle");
        refreshUsage();
      }
    },
    [id, refreshUsage],
  );

  /* ---------------- AI: document-level edits ---------------- */

  const runDocumentEdit = useCallback(
    async (instruction: string, opts: { source: "document" | "library"; chatMsgId?: string; label: string; mineFacts?: boolean; history?: ChatMessage[] }) => {
      const base = currentRef.current;
      if (!base) return;
      setDocBusy(opts.label);
      setSelected([]);
      try {
        const history = (opts.history ?? []).filter((m) => m.state !== "error").slice(-10).map((m) => ({ role: m.role, content: m.content }));
        const out = await streamApi<{ resume: Resume; changeSummary: string }>("/api/ai/edit-document", {
          applicationId: id,
          resume: base,
          instruction,
          history,
          mineFacts: opts.mineFacts ?? false,
        });
        setProposal({
          source: opts.source,
          base,
          resume: out.resume,
          summary: out.changeSummary,
          activity: opts.source === "library" ? "Added from profile" : "Chat edit",
          chatMsgId: opts.chatMsgId,
          // eslint-disable-next-line react-hooks/immutability -- retry runs later, after declaration
          retry: () => void runDocumentEdit(instruction, opts),
        });
        if (opts.chatMsgId) {
          setChat((c) => c.map((m) => (m.id === opts.chatMsgId ? { ...m, content: out.changeSummary, state: "proposed" } : m)));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "The AI request failed";
        if (opts.chatMsgId) setChat((c) => c.map((m) => (m.id === opts.chatMsgId ? { ...m, content: msg, state: "error" } : m)));
        else toast.error(msg);
      } finally {
        setDocBusy(null);
        refreshUsage();
      }
    },
    [id, refreshUsage],
  );

  const onChat = (text: string) => {
    const userMsg: ChatMessage = { id: newId(), role: "user", content: text };
    const reply: ChatMessage = { id: newId(), role: "assistant", content: "…", state: "pending" };
    const history = chat;
    setChat((c) => [...c, userMsg, reply]);
    void runDocumentEdit(text, { source: "document", chatMsgId: reply.id, label: "Applying your instruction…", mineFacts: true, history });
  };

  const onLibraryAdd = (item: LibraryAdd) => {
    const instruction =
      item.kind === "bullet"
        ? `Add this bullet from my profile (profile id ${item.id}) to the resume: "${item.text}". Put it under the role / project it belongs to, tailor the wording to the job, set its sourceRef to ${item.id}, and trim the least relevant bullet elsewhere if needed to stay on one page.`
        : `Add my ${item.kind === "company" ? "experience" : item.kind} "${item.label}" (profile id ${item.id}) from the profile to the resume in the right section and position, with its 1–3 most relevant bullets from its bullet bank. Keep the resume on one page by trimming the least relevant content elsewhere if needed.`;
    void runDocumentEdit(instruction, { source: "library", label: `Adding "${item.label}"…` });
  };

  /* ---------------- AI: fit to page ---------------- */

  const runFit = useCallback(
    async (overflowLines: number, auto = false) => {
      const base = currentRef.current;
      if (!base) return;
      setDocBusy(auto ? "Resume overflows: trimming to one page…" : "Trimming to one page…");
      setSelected([]);
      try {
        const out = await api<{ resume: Resume; cut: string[] }>("/api/ai/fit-page", { method: "POST", json: { applicationId: id, resume: base, overflowLines } });
        setProposal({
          source: "fit",
          base,
          resume: out.resume,
          summary: "Trimmed to fit one page",
          note: out.cut.join(" · "),
          activity: "Fit to one page",
          // eslint-disable-next-line react-hooks/immutability -- retry runs later, after declaration
          retry: () => void runFit(overflowLines),
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fit failed");
      } finally {
        setDocBusy(null);
        refreshUsage();
      }
    },
    [id, refreshUsage],
  );

  // Auto-fit once after a fresh draft or an accepted document-level edit.
  useEffect(() => {
    if (!autoFit.current || !measure || proposal || docBusy || previewId) return;
    autoFit.current = false;
    if (params.get("fresh")) window.history.replaceState(null, "", `/applications/${id}`);
    if (measure.overflowLines > 0) void runFit(measure.overflowLines, true);
  }, [measure, proposal, docBusy, previewId, runFit, id, params]);

  /* ---------------- proposals ---------------- */

  const accept = useCallback(async () => {
    if (!proposal) return;
    const p = proposal;
    // Set before the state updates below so the auto-fit effect sees it on its next run.
    if (p.source === "document" || p.source === "library") autoFit.current = true;
    setProposal(null);
    setSelected([]);
    await commit(p.resume, p.summary, { activity: p.activity });
    if (p.chatMsgId) setChat((c) => c.map((m) => (m.id === p.chatMsgId ? { ...m, state: "accepted" } : m)));
    toast.success("Change accepted");
  }, [proposal, commit]);

  const reject = useCallback(() => {
    if (!proposal) return;
    if (proposal.chatMsgId) setChat((c) => c.map((m) => (m.id === proposal.chatMsgId ? { ...m, state: "rejected" } : m)));
    setProposal(null);
  }, [proposal]);

  const retry = useCallback(() => {
    if (!proposal) return;
    const p = proposal;
    setProposal(null);
    p.retry();
  }, [proposal]);

  /* ---------------- direct manipulation ---------------- */

  const onSelect = (elId: string, additive: boolean) => {
    setPopError(null);
    setSelected((s) => (additive ? (s.includes(elId) ? s.filter((x) => x !== elId) : [...s, elId]) : s.length === 1 && s[0] === elId ? [] : [elId]));
  };

  const deleteSelected = () => {
    const base = currentRef.current;
    if (!base || !selected.length) return;
    let next = base;
    for (const x of selected) next = deleteElement(next, x);
    const labels = selected.map((x) => findElement(base, x)?.label ?? x);
    setSelected([]);
    void commit(next, `Deleted ${labels.length === 1 ? labels[0] : `${labels.length} elements`}`, { activity: `Deleted ${labels.length} element${labels.length === 1 ? "" : "s"}` });
  };

  const onCommitEdit = (elId: string, field: string, text: string | null) => {
    setEditing(null);
    const base = currentRef.current;
    if (!base || text === null) return;
    const next = setElementField(base, elId, field, text.replace(/\s+/g, " ").trim());
    if (JSON.stringify(next) === JSON.stringify(base)) return;
    void commit(next, `Edited ${findElement(base, elId)?.label ?? "text"} by hand`, { activity: "Edited text by hand" });
  };

  const onReorder = (containerId: string, ids: string[]) => {
    const base = currentRef.current;
    if (!base) return;
    const next = reorderChildren(base, containerId, ids);
    const label =
      containerId === SECTIONS_CONTAINER
        ? `Moved sections: ${sectionOrderOf(next).map((k) => SECTION_LABELS[k].split(" /")[0]).join(" → ")}`
        : `Reordered ${findElement(base, containerId)?.label ?? "section"}`;
    void commit(next, label, containerId === SECTIONS_CONTAINER ? { activity: "Reordered sections" } : {});
  };

  const onDropBullet = useCallback(
    (containerId: string, payload: string) => {
      const base = currentRef.current;
      if (!base) return;
      try {
        const { bankId, text } = JSON.parse(payload) as { bankId: string; text: string };
        const next = appendBullet(base, containerId, { id: newId(), text, sourceRef: bankId });
        void commit(next, `Added bullet from profile to ${findElement(base, containerId)?.label ?? "resume"}`, { activity: "Added bullet from profile" });
      } catch {
        /* ignore malformed drops */
      }
    },
    [commit],
  );

  /* ---------------- export ---------------- */

  const doExport = useCallback(async () => {
    setConfirmExport(false);
    const filename = sanitiseFilename(saveAs);
    setSaveAs(filename);
    setExporting(true);
    try {
      const res = await fetch(`/api/applications/${id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, toFolder: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Export failed (${res.status})`);
      }
      const pages = Number(res.headers.get("X-Page-Count") ?? 1);
      const savedPath = decodeURIComponent(res.headers.get("X-Saved-Path") ?? "");
      const saveError = decodeURIComponent(res.headers.get("X-Save-Error") ?? "");
      const blob = await res.blob();
      if (!savedPath) {
        // No folder chosen (or it failed): hand the file to the browser's download.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      if (saveError) toast.warning("Couldn't save to your folder, so it was downloaded instead", { description: saveError });
      const pageNote = pages > 1 ? `Warning: ${pages} pages` : "1 page";
      toast[pages > 1 ? "warning" : "success"](`Saved ${filename}.pdf`, {
        description: savedPath ? `${pageNote} · ${savedPath}` : `${pageNote} · browser downloads`,
        action: savedPath
          ? { label: "Show in folder", onClick: () => void api("/api/system/reveal", { method: "POST", json: { path: savedPath } }).catch((e) => toast.error(e.message)) }
          : undefined,
      });
    } catch (e) {
      toast.error("PDF export failed", { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  }, [id, saveAs]);

  const requestExport = useCallback(() => {
    if (exporting) return;
    if (measure && measure.overflowLines > 0) setConfirmExport(true);
    else void doExport();
  }, [exporting, measure, doExport]);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        requestExport();
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (proposal) return;
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (!proposal) redo();
      } else if (e.key === "Escape") {
        if (proposal?.source === "element") reject();
        else if (previewId) setPreviewId(null);
        else setSelected([]);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length && !proposal) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onMeasure = useCallback((m: Measure) => {
    setMeasure((old) => (old && old.overflowLines === m.overflowLines && Math.abs(old.overflowPx - m.overflowPx) < 0.5 ? old : m));
  }, []);

  /* ---------------- render ---------------- */

  if (loadError) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="space-y-2">
          <CircleAlert className="mx-auto size-6 text-destructive" />
          <p className="text-sm">{loadError}</p>
          <Link href="/" className="text-sm text-primary underline">Back to dashboard</Link>
        </div>
      </div>
    );
  }
  if (!data || !current || !displayResume) return <EditorSkeleton />;

  const app = data.application;
  const popoverOpen = mode === "edit" || proposal?.source === "element";
  const popoverIds = proposal?.source === "element" ? proposal.ids ?? [] : selected;
  const selLabel =
    popoverIds.length === 1 ? findElement(current, popoverIds[0])?.label ?? "Element" : `${popoverIds.length} elements selected`;
  const currentVersionId = versions[versions.length - 1]?.id ?? null;
  const unsourcedCount = flagged.size;
  const bulletCount = allBullets(current).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header / save bar */}
      <header className="flex h-[4.25rem] shrink-0 items-center gap-3 border-b bg-background px-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push("/")} aria-label="Back to dashboard">
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{app.company}</div>
          <div className="truncate text-xs text-muted-foreground">{app.roleTitle}</div>
        </div>
        <select
          value={status}
          onChange={async (e) => {
            setStatus(e.target.value);
            await api(`/api/applications/${id}`, { method: "PATCH", json: { status: e.target.value } }).catch((err) => toast.error(err.message));
          }}
          className="h-7 rounded-md border bg-background px-1.5 text-xs"
          aria-label="Status"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="flex-1" />
        {usage && (
          <Tooltip>
            <TooltipTrigger render={<span className="hidden cursor-default text-[11px] text-muted-foreground tabular-nums xl:inline" />}>
              {usage.planCalls > 0 && usage.planCalls === usage.calls
                ? `${usage.calls} AI calls on your Claude plan`
                : `≈ $${usage.cost.toFixed(usage.cost < 0.1 ? 3 : 2)} AI cost`}
            </TooltipTrigger>
            <TooltipContent>
              {usage.calls} AI calls ({usage.planCalls} on your Claude plan, {usage.calls - usage.planCalls} via API) · {usage.tokens.toLocaleString()} tokens for this application
            </TooltipContent>
          </Tooltip>
        )}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5 gap-y-1">
          <label htmlFor="saveas" className="text-right text-xs text-muted-foreground">
            Save as
          </label>
          <Input
            id="saveas"
            value={saveAs}
            onChange={(e) => setSaveAs(e.target.value)}
            onBlur={() => {
              const f = sanitiseFilename(saveAs);
              setSaveAs(f);
              void api(`/api/applications/${id}`, { method: "PATCH", json: { saveAs: f } });
            }}
            className="h-7 w-[22rem] font-mono text-xs"
          />
          <span className="text-xs text-muted-foreground">.pdf</span>
          <label htmlFor="saveto" className="text-right text-xs text-muted-foreground">
            Save to
          </label>
          <Input
            id="saveto"
            value={exportDir}
            onChange={(e) => setExportDir(e.target.value)}
            onBlur={(e) => void saveExportDir(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder={suggestedDir ? `e.g. ${suggestedDir} (empty = browser downloads)` : "Folder (empty = browser downloads)"}
            title={exportDir || "Empty: PDFs download through the browser"}
            className="h-7 w-[22rem] font-mono text-xs"
          />
          <Button variant="outline" size="xs" onClick={browseFolder} disabled={picking} title="Choose a folder">
            {picking ? <Loader2 className="animate-spin" /> : <FolderOpen />} Browse…
          </Button>
        </div>
        <Button onClick={requestExport} disabled={exporting}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />} Save PDF
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: profile library */}
        {libraryOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-r bg-background">
            <div className="flex h-10 items-center justify-between border-b px-3">
              <span className="text-sm font-medium">Profile library</span>
              <Button variant="ghost" size="icon-xs" onClick={() => setLibraryOpen(false)} aria-label="Collapse library">
                <PanelLeftClose />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <LibraryPanel profile={profile} resume={current} onAdd={onLibraryAdd} busy={!!docBusy || !!proposal} />
            </div>
          </aside>
        )}

        {/* Centre: A4 preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
            {!libraryOpen && (
              <Button variant="ghost" size="icon-xs" onClick={() => setLibraryOpen(true)} aria-label="Open library">
                <PanelLeftOpen />
              </Button>
            )}
            <FitIndicator measure={measure} proposal={!!proposal} onFix={() => measure && runFit(measure.overflowLines)} busy={!!docBusy || !!proposal} />
            {unsourcedCount > 0 && !proposal && (
              <button
                onClick={() => setSelected([...flagged])}
                className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-500/25 dark:text-amber-200"
                title="Bullets that do not trace back to your profile or an answer"
              >
                <Flag className="size-3" /> {unsourcedCount} unsourced
              </button>
            )}
            <span className="hidden text-xs text-muted-foreground lg:inline">{bulletCount} bullets</span>
            <div className="flex-1" />
            <Button variant="ghost" size="icon-xs" onClick={undo} disabled={!hist.undo || !!proposal} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={redo} disabled={!hist.redo || !!proposal} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)">
              <Redo2 />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button variant="ghost" size="icon-xs" onClick={() => setZoomManual(zoom - 0.1)} aria-label="Zoom out">
              <Minus />
            </Button>
            <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setZoomManual(zoom + 0.1)} aria-label="Zoom in">
              <Plus />
            </Button>
            <Button variant={fitWidth ? "secondary" : "ghost"} size="icon-xs" onClick={() => setFitWidth(true)} aria-label="Fit to width" title="Fit to width">
              <Maximize2 />
            </Button>
          </div>

          {/* Banners */}
          {docBusy && (
            <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm">
              <Loader2 className="size-4 animate-spin text-primary" /> {docBusy}
            </div>
          )}
          {proposal && proposal.source !== "element" && (
            <div className="flex items-center gap-3 border-b bg-emerald-500/5 px-4 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{proposal.summary}</div>
                {proposal.note && <div className="truncate text-xs text-muted-foreground" title={proposal.note}>{proposal.note}</div>}
                <div className="text-[11px] text-muted-foreground">
                  <span className="diff-add px-1">added</span> <span className="diff-del px-1">removed</span> changes are highlighted on the page
                </div>
              </div>
              <Button size="sm" onClick={accept}>
                <Check /> Accept
              </Button>
              <Button size="sm" variant="outline" onClick={reject}>
                <X /> Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={retry}>
                <RotateCw /> Try again
              </Button>
            </div>
          )}
          {previewVersion && (
            <div className="flex items-center gap-3 border-b bg-sky-500/5 px-4 py-2 text-sm">
              <Eye className="size-4 text-sky-600" />
              <span className="flex-1">
                Previewing <span className="font-medium">{previewVersion.changeSummary}</span> ({new Date(previewVersion.createdAt).toLocaleString()})
              </span>
              <Button
                size="sm"
                onClick={() => {
                  setPreviewId(null);
                  void commit(previewVersion.resume, `Restored: ${previewVersion.changeSummary}`, { activity: "Restored a previous version" });
                }}
              >
                Restore this version
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreviewId(null)}>
                Back to current
              </Button>
            </div>
          )}

          <div
            ref={(el) => {
              scrollRef.current = el;
              if (el !== scrollEl) setScrollEl(el);
            }}
            className="relative min-h-0 flex-1 overflow-auto bg-muted/50 px-8 py-8"
            onClick={(e) => {
              if (e.target === e.currentTarget && mode === "edit") setSelected([]);
            }}
          >
            <ResumeCanvas
              resume={displayResume}
              compare={proposal?.base ?? null}
              mode={mode}
              zoom={zoom}
              selected={popoverOpen ? new Set(popoverIds) : selectedSet}
              flagged={flagged}
              hovered={hovered}
              editing={editing}
              onHover={setHovered}
              onSelect={onSelect}
              onBackgroundClick={() => setSelected([])}
              onStartEdit={(t) => {
                setSelected([]);
                setEditing(t);
              }}
              onCommitEdit={onCommitEdit}
              onReorder={onReorder}
              onDropBullet={onDropBullet}
              onMeasure={() => {}}
            />
            {popoverOpen && popoverIds.length > 0 && !editing && !docBusy && (
              <PromptPopover
                key={popoverIds.join(",")}
                anchorIds={popoverIds}
                container={scrollEl}
                label={selLabel}
                status={proposal?.source === "element" ? "review" : popStatus}
                note={proposal?.source === "element" ? proposal.note : undefined}
                error={popError}
                onSubmit={(p, label) => runElementEdit(popoverIds, p, label)}
                onDelete={deleteSelected}
                onAccept={accept}
                onReject={reject}
                onRetry={retry}
                onClose={() => {
                  if (proposal?.source === "element") reject();
                  setSelected([]);
                }}
              />
            )}
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Click to select · Shift-click to multi-select · Double-click text to edit by hand · Drag to reorder
            </p>
          </div>
          {/* Offscreen, unannotated render used only to measure page fit. */}
          <Measurer resume={proposal?.resume ?? current} onMeasure={onMeasure} />
        </div>

        {/* Right panel */}
        <aside className="w-[380px] shrink-0 border-l bg-background">
          <RightPanel
            tab={rightTab}
            onTab={setRightTab}
            chat={chat}
            chatBusy={!!docBusy}
            onChat={onChat}
            rationale={rationale}
            analysis={app.analysis}
            jobDescription={app.jobDescription}
            jobUrl={app.jobUrl}
            resumeText={resumePlainText(current)}
            versions={versions}
            currentVersionId={currentVersionId}
            previewVersionId={previewId}
            onPreviewVersion={(v) => {
              if (proposal) return toast.info("Accept or reject the pending change first.");
              setPreviewId(v === currentVersionId ? null : v);
            }}
            onRestoreVersion={(v) => {
              const ver = versions.find((x) => x.id === v);
              if (!ver || proposal) return;
              setPreviewId(null);
              void commit(ver.resume, `Restored: ${ver.changeSummary}`, { activity: "Restored a previous version" });
            }}
          />
        </aside>
      </div>

      <AlertDialog open={confirmExport} onOpenChange={setConfirmExport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>The resume overflows one page</AlertDialogTitle>
            <AlertDialogDescription>
              It runs over by about {measure?.overflowLines} line{measure?.overflowLines === 1 ? "" : "s"}, so the PDF will have 2 pages. Export anyway, or use “Fix length” first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doExport()}>Export anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FitIndicator({ measure, proposal, onFix, busy }: { measure: Measure | null; proposal: boolean; onFix: () => void; busy: boolean }) {
  if (!measure) return <span className="text-xs text-muted-foreground">Measuring…</span>;
  if (measure.overflowLines === 0)
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <CircleCheck className="size-3" /> Fits on 1 page{proposal && " (proposed)"}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
        <CircleAlert className="size-3" /> Overflows by ~{measure.overflowLines} line{measure.overflowLines === 1 ? "" : "s"}
        {proposal && " (proposed)"}
      </span>
      {!proposal && (
        <Button size="xs" variant="outline" onClick={onFix} disabled={busy}>
          <Scissors /> Fix length
        </Button>
      )}
    </span>
  );
}

/** Renders the plain template offscreen and reports how far the content exceeds the printable A4 area. */
function Measurer({ resume, onMeasure }: { resume: Resume; onMeasure: (m: Measure) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const run = () => {
      const content = ref.current?.querySelector<HTMLElement>("[data-mitb-content]");
      if (!content) return;
      const over = Math.max(0, content.offsetHeight - CONTENT_H);
      onMeasure({ overflowPx: over, overflowLines: over > 0.5 ? Math.max(1, Math.ceil(over / LINE_PX)) : 0 });
    };
    run();
    document.fonts?.ready.then(run);
  }, [resume, onMeasure]);
  return (
    <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] opacity-0" ref={ref}>
      <MitbTemplate resume={resume} />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-14 border-b bg-background" />
      <div className="flex flex-1">
        <div className="w-72 border-r bg-background" />
        <div className="flex flex-1 justify-center bg-muted/50 p-8">
          <div className="aspect-[210/297] h-full max-h-[900px] animate-pulse rounded bg-background shadow" />
        </div>
        <div className="w-[380px] border-l bg-background" />
      </div>
    </div>
  );
}
