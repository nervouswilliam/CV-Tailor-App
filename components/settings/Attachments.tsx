"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Presentation,
  RotateCw,
  Sparkles,
  Check,
  Upload,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDelete, FieldLabel } from "@/components/common/fields";
import type { DocFields } from "./fillFromDoc";

export type ItemType = "role" | "project" | "activity" | "education";
type Summary = {
  summary: string;
  keyFacts: string[];
  metrics: string[];
  tools: string[];
  suggestedBullets: string[];
  caveats: string;
  fields?: DocFields;
  fieldsApplied?: boolean;
};
export type AttachmentDto = {
  id: string;
  itemId: string;
  itemType: ItemType;
  itemLabel: string;
  filename: string;
  sizeBytes: number;
  textLength: number;
  truncated: boolean;
  status: "processing" | "ready" | "error";
  error: string | null;
  summary: Summary | null;
  createdAt: string;
};

const ACCEPT = ".pdf,.pptx,.docx,.txt,.md";

type Store = {
  all: AttachmentDto[] | null;
  uploading: Record<string, number>;
  upload: (files: File[], item: { itemId: string; itemType: ItemType; itemLabel: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  resummarise: (id: string) => Promise<void>;
  /** Copy the document's field values into its item's empty fields. */
  fill: (id: string) => void;
};
const Ctx = createContext<Store | null>(null);

/**
 * Loads every attachment once and polls while any is still being summarised.
 * When a summary is ready and its fields haven't been applied yet, `onFill` copies
 * them into the item's empty fields (once) and reports which fields changed.
 */
export function AttachmentsProvider({
  children,
  onFill,
  profileReady,
}: {
  children: ReactNode;
  onFill?: (doc: AttachmentDto) => string[];
  profileReady?: boolean;
}) {
  const [all, setAll] = useState<AttachmentDto[] | null>(null);
  const applying = useRef(new Set<string>());
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const rows = await api<AttachmentDto[]>("/api/attachments").catch(() => null);
    if (rows) setAll(rows);
    return rows;
  }, []);

  // Poll every 2.5s while something is processing.
  useEffect(() => {
    if (!all?.some((a) => a.status === "processing")) return;
    timer.current = setTimeout(async () => {
      const before = new Map(all.map((a) => [a.id, a.status]));
      const rows = await load();
      for (const r of rows ?? []) {
        if (before.get(r.id) === "processing" && r.status === "ready") toast.success(`Summarised ${r.filename}`, { description: `Now part of the context for ${r.itemLabel}` });
        if (before.get(r.id) === "processing" && r.status === "error") toast.error(`Couldn't summarise ${r.filename}`, { description: r.error ?? undefined });
      }
    }, 2500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [all, load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
    // Pick up summaries that finished while this tab was in the background.
    const refresh = () => document.visibilityState === "visible" && void load();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const markApplied = useCallback(async (id: string) => {
    const row = await api<AttachmentDto>(`/api/attachments/${id}`, { method: "PATCH", json: { fieldsApplied: true } }).catch(() => null);
    if (row) setAll((a) => (a ?? []).map((x) => (x.id === id ? row : x)));
  }, []);

  const fill = useCallback(
    (id: string, auto = false) => {
      const doc = all?.find((a) => a.id === id);
      if (!doc || !onFill) return;
      const filled = onFill(doc);
      if (filled.length) toast.success(`Filled ${filled.join(", ")}`, { description: `From ${doc.filename} → ${doc.itemLabel}` });
      else if (!auto) toast.info("Nothing to fill", { description: "Every field this document covers already has a value." });
      void markApplied(id);
    },
    [all, onFill, markApplied],
  );

  // Auto-fill once per document, as soon as its summary is ready and the profile is loaded.
  useEffect(() => {
    if (!profileReady || !all) return;
    for (const d of all) {
      if (d.status === "ready" && d.summary && !d.summary.fieldsApplied && !applying.current.has(d.id)) {
        applying.current.add(d.id);
        fill(d.id, true);
      }
    }
  }, [all, profileReady, fill]);

  const upload: Store["upload"] = async (files, item) => {
    setUploading((u) => ({ ...u, [item.itemId]: (u[item.itemId] ?? 0) + files.length }));
    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("itemId", item.itemId);
        fd.append("itemType", item.itemType);
        fd.append("itemLabel", item.itemLabel);
        const res = await fetch("/api/attachments", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
        setAll((a) => [...(a ?? []), data as AttachmentDto]);
      } catch (e) {
        toast.error(`Couldn't attach ${f.name}`, { description: (e as Error).message });
      } finally {
        setUploading((u) => ({ ...u, [item.itemId]: Math.max(0, (u[item.itemId] ?? 1) - 1) }));
      }
    }
  };
  const remove: Store["remove"] = async (id) => {
    await api(`/api/attachments/${id}`, { method: "DELETE" });
    setAll((a) => (a ?? []).filter((x) => x.id !== id));
  };
  const resummarise: Store["resummarise"] = async (id) => {
    const row = await api<AttachmentDto>(`/api/attachments/${id}`, { method: "POST" });
    setAll((a) => (a ?? []).map((x) => (x.id === id ? row : x)));
  };

  return <Ctx.Provider value={{ all, uploading, upload, remove, resummarise, fill }}>{children}</Ctx.Provider>;
}

function useAttachments() {
  const s = useContext(Ctx);
  if (!s) throw new Error("AttachmentsProvider missing");
  return s;
}

/** Count of documents on an item (for collapsed headers). */
export function useAttachmentCount(itemId: string) {
  const s = useContext(Ctx);
  return s?.all?.filter((a) => a.itemId === itemId).length ?? 0;
}

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * "Documents" panel for one profile item: attach PDFs / slide decks / write-ups, see the
 * AI's summary, and add the bullets it suggests to the item's bullet bank.
 */
export function ItemAttachments({
  itemId,
  itemType,
  itemLabel,
  bankTexts,
  onAddBullet,
}: {
  itemId: string;
  itemType: ItemType;
  itemLabel: string;
  bankTexts?: string[];
  onAddBullet?: (text: string) => void;
}) {
  const { all, uploading, upload, remove, resummarise, fill } = useAttachments();
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const docs = (all ?? []).filter((a) => a.itemId === itemId);
  const busy = (uploading[itemId] ?? 0) > 0;

  const onFiles = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length) void upload(files, { itemId, itemType, itemLabel });
  };

  return (
    <div
      className={cn("space-y-1.5 rounded-lg border border-dashed p-2 transition-colors", dragOver ? "border-primary bg-primary/5" : "border-border/70")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <FieldLabel className="flex items-center gap-1">
          <Paperclip className="size-3" /> Documents · {docs.length}
        </FieldLabel>
        <Button variant="ghost" size="xs" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ? "Reading…" : "Attach PDF / PPTX"}
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {docs.length === 0 && !busy && (
        <p className="px-1.5 text-xs text-muted-foreground">
          Drop a report, slide deck or write-up here (PDF, PPTX, DOCX). The AI reads it and uses it as context for every tailored CV.
        </p>
      )}
      {docs.map((d) => (
        <DocRow key={d.id} doc={d} bankTexts={bankTexts} onAddBullet={onAddBullet} onRemove={() => remove(d.id)} onRetry={() => resummarise(d.id)} onFill={() => fill(d.id)} />
      ))}
    </div>
  );
}

function DocRow({
  doc,
  bankTexts,
  onAddBullet,
  onRemove,
  onRetry,
  onFill,
}: {
  doc: AttachmentDto;
  bankTexts?: string[];
  onAddBullet?: (text: string) => void;
  onRemove: () => void;
  onRetry: () => void;
  onFill: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = doc.filename.toLowerCase().endsWith(".pptx") ? Presentation : FileText;
  const s = doc.summary;
  return (
    <div className="rounded-md bg-muted/40">
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <button onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground hover:bg-muted" disabled={!s} aria-label="Show summary">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <button onClick={() => s && setOpen(!open)} className="min-w-0 flex-1 truncate text-left text-sm">
          {doc.filename}
        </button>
        <span className="shrink-0 text-[11px] text-muted-foreground">{fmtSize(doc.sizeBytes)}</span>
        {doc.status === "processing" && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
            <Loader2 className="size-3 animate-spin" /> Summarising
          </span>
        )}
        {doc.status === "ready" && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
            <Sparkles className="size-3" /> In context
          </span>
        )}
        {doc.status === "error" && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive" title={doc.error ?? ""}>
            <CircleAlert className="size-3" /> Failed
          </span>
        )}
        <a href={`/api/attachments/${doc.id}?download=1`} target="_blank" rel="noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Open original">
          <ExternalLink className="size-3.5" />
        </a>
        {doc.status !== "processing" && (
          <button onClick={onRetry} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Summarise again">
            <RotateCw className="size-3.5" />
          </button>
        )}
        <ConfirmDelete title={`Remove ${doc.filename}?`} description="The AI will no longer use this document as context." label="Remove" onConfirm={onRemove} />
      </div>
      {doc.status === "error" && doc.error && <p className="px-7 pb-1.5 text-xs text-destructive">{doc.error}</p>}
      {doc.truncated && (
        <p className="px-7 pb-1.5 text-xs text-amber-700 dark:text-amber-300">
          Long document: only the first ~180K characters (of {doc.textLength.toLocaleString()}) were summarised.
        </p>
      )}
      {open && s && (
        <div className="space-y-2 border-t px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <p className="flex-1">{s.summary}</p>
            {s.fields && (
              <Button size="xs" variant="outline" onClick={onFill} title="Copy the title, dates, tech stack etc. from this document into any empty fields">
                <Wand2 /> Fill empty fields
              </Button>
            )}
          </div>
          <List title="Key facts" items={s.keyFacts} />
          <List title="Metrics" items={s.metrics} />
          {s.tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {s.tools.map((t) => (
                <span key={t} className="rounded bg-background px-1.5 py-0.5 text-[11px]">
                  {t}
                </span>
              ))}
            </div>
          )}
          {s.suggestedBullets.length > 0 && (
            <div className="space-y-1">
              <FieldLabel className="px-0">Suggested bullets</FieldLabel>
              {s.suggestedBullets.map((b) => {
                const inBank = bankTexts?.some((t) => t.trim() === b.trim());
                return (
                  <div key={b} className="flex items-start gap-2 rounded-md bg-background px-2 py-1.5 text-[13px]">
                    <span className="flex-1" dangerouslySetInnerHTML={{ __html: boldMd(b) }} />
                    {onAddBullet &&
                      (inBank ? (
                        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                          <Check className="size-3" /> In bank
                        </span>
                      ) : (
                        <Button size="xs" variant="outline" onClick={() => onAddBullet(b)}>
                          <Plus /> Add to bank
                        </Button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
          {s.caveats.trim() && <p className="text-xs text-amber-700 dark:text-amber-300">Note: {s.caveats}</p>}
        </div>
      )}
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <FieldLabel className="px-0">{title}</FieldLabel>
      <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Escape HTML, then turn **x** into <b>x</b>. */
function boldMd(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}
