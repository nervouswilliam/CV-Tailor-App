"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CornerDownLeft, History, Loader2, MessageSquare, RotateCcw, ScrollText, Lightbulb, Eye, Check, CircleHelp, CircleMinus, CirclePlus, Compass } from "lucide-react";
import type { Analysis, Rationale } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; state?: "pending" | "proposed" | "accepted" | "rejected" | "error" };
export type VersionMeta = { id: string; changeSummary: string; createdAt: string | Date };

const TABS = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "rationale", label: "Rationale", icon: Lightbulb },
  { key: "jd", label: "Job", icon: ScrollText },
  { key: "history", label: "History", icon: History },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function RightPanel(props: {
  chat: ChatMessage[];
  chatBusy: boolean;
  onChat: (text: string) => void;
  rationale: Rationale | null;
  analysis: Analysis | null;
  jobDescription: string;
  jobUrl: string | null;
  resumeText: string;
  versions: VersionMeta[];
  currentVersionId: string | null;
  previewVersionId: string | null;
  onPreviewVersion: (id: string | null) => void;
  onRestoreVersion: (id: string) => void;
  tab?: Tab;
  onTab?: (t: Tab) => void;
}) {
  const [localTab, setLocalTab] = useState<Tab>("chat");
  const tab = props.tab ?? localTab;
  const setTab = props.onTab ?? setLocalTab;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-0.5 border-b px-2 pt-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-t-lg border-b-2 border-transparent px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              tab === key && "border-primary font-medium text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "chat" && <ChatTab messages={props.chat} busy={props.chatBusy} onSend={props.onChat} />}
        {tab === "rationale" && <RationaleTab rationale={props.rationale} />}
        {tab === "jd" && <JdTab analysis={props.analysis} jd={props.jobDescription} url={props.jobUrl} resumeText={props.resumeText} />}
        {tab === "history" && (
          <HistoryTab
            versions={props.versions}
            currentId={props.currentVersionId}
            previewId={props.previewVersionId}
            onPreview={props.onPreviewVersion}
            onRestore={props.onRestoreVersion}
          />
        )}
      </div>
    </div>
  );
}

const CHAT_EXAMPLES = ["Move my most recent company's AI bullets to the top", "Merge the two roles at my last company into one", "Swap the academic project for a more technical one", "Make the whole resume more business-focused"];

function ChatTab({ messages, busy, onSend }: { messages: ChatMessage[]; busy: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);
  const send = (t: string) => {
    if (!t.trim() || busy) return;
    onSend(t.trim());
    setText("");
  };
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-3 pt-4 text-center">
            <div className="mx-auto grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-4" />
            </div>
            <p className="text-sm text-muted-foreground">Give instructions for the whole resume. Changes show as a diff on the page for you to accept.</p>
            <div className="space-y-1.5">
              {CHAT_EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setText(ex)} className="block w-full rounded-lg border px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] rounded-2xl px-3 py-2 text-sm",
                m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                m.state === "error" && "bg-destructive/10 text-destructive",
              )}
            >
              {m.content}
              {m.role === "assistant" && m.state && m.state !== "error" && m.state !== "pending" && (
                <div className="mt-1 text-[11px] opacity-70">
                  {m.state === "proposed" ? "Review the highlighted changes on the page" : m.state === "accepted" ? "✓ Accepted" : "Rejected"}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Working on the resume…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t p-2">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="e.g. move Wisely.id above PT SIM"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send(text);
              }
            }}
            className="w-full resize-none rounded-lg border bg-background px-2.5 py-2 pr-10 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <button onClick={() => send(text)} disabled={!text.trim() || busy} className="absolute right-2 bottom-3 grid size-7 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send (Ctrl+Enter)">
            <CornerDownLeft className="size-3.5" />
          </button>
        </div>
        <div className="px-1 text-[11px] text-muted-foreground">Ctrl+Enter to send</div>
      </div>
    </div>
  );
}

function RationaleTab({ rationale }: { rationale: Rationale | null }) {
  if (!rationale) return <p className="p-4 text-sm text-muted-foreground">No rationale yet. It is written with the first draft.</p>;
  const block = (title: string, icon: React.ReactNode, items: string[]) =>
    items.length > 0 && (
      <section className="space-y-1.5">
        <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon} {title}
        </h4>
        <ul className="space-y-1.5 text-sm">
          {items.map((t, i) => (
            <li key={i} className="rounded-lg bg-muted/50 px-2.5 py-1.5">
              {t}
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="h-full space-y-4 overflow-y-auto p-3">
      {block("Included", <CirclePlus className="size-3.5 text-emerald-600" />, rationale.included)}
      {block("Left out", <CircleMinus className="size-3.5 text-rose-500" />, rationale.excluded)}
      {block("Framing", <Compass className="size-3.5 text-primary" />, rationale.framing)}
      {block("Open questions", <CircleHelp className="size-3.5 text-amber-500" />, rationale.openQuestions)}
    </div>
  );
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function JdTab({ analysis, jd, url, resumeText }: { analysis: Analysis | null; jd: string; url: string | null; resumeText: string }) {
  const keywords = useMemo(() => [...new Set(analysis?.keywords ?? [])].filter(Boolean), [analysis]);
  const lower = resumeText.toLowerCase();
  const matched = new Set(keywords.filter((k) => lower.includes(k.toLowerCase())));
  const missing = keywords.filter((k) => !matched.has(k));
  const parts = useMemo(() => {
    if (!keywords.length) return [jd];
    const re = new RegExp(`(${[...keywords].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})`, "gi");
    return jd.split(re);
  }, [jd, keywords]);
  const kwLower = new Map(keywords.map((k) => [k.toLowerCase(), k]));
  return (
    <div className="h-full space-y-4 overflow-y-auto p-3">
      {keywords.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{matched.size}</span> of {keywords.length} key terms appear in the resume
          </div>
          {missing.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Not yet in the resume</div>
              <div className="flex flex-wrap gap-1">
                {missing.map((k) => (
                  <span key={k} className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-200">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary underline underline-offset-2">
          {url}
        </a>
      )}
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {parts.map((p, i) => {
          const k = kwLower.get(p.toLowerCase());
          if (!k) return <span key={i}>{p}</span>;
          return (
            <mark key={i} className={cn("rounded px-0.5", matched.has(k) ? "bg-emerald-500/20 text-inherit" : "bg-amber-500/25 text-inherit")}>
              {p}
            </mark>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTab({ versions, currentId, previewId, onPreview, onRestore }: { versions: VersionMeta[]; currentId: string | null; previewId: string | null; onPreview: (id: string | null) => void; onRestore: (id: string) => void }) {
  const list = [...versions].reverse();
  return (
    <div className="h-full overflow-y-auto p-2">
      <p className="px-2 py-1 text-xs text-muted-foreground">Ctrl+Z / Ctrl+Shift+Z to undo / redo. Click a version to preview it.</p>
      <ol className="space-y-0.5">
        {list.map((v, i) => {
          const isCurrent = v.id === currentId;
          const isPreview = v.id === previewId;
          return (
            <li
              key={v.id}
              className={cn("group flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted", isPreview && "bg-primary/10 ring-1 ring-primary/30")}
              onClick={() => onPreview(isCurrent ? null : isPreview ? null : v.id)}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", isCurrent ? "bg-primary" : "bg-muted-foreground/30")} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{v.changeSummary}</div>
                <div className="text-[11px] text-muted-foreground">
                  v{list.length - i} · {new Date(v.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {isCurrent && " · current"}
                </div>
              </div>
              {!isCurrent && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <Button size="icon-xs" variant="ghost" onClick={(e) => { e.stopPropagation(); onPreview(v.id); }} aria-label="Preview">
                    <Eye />
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={(e) => { e.stopPropagation(); onRestore(v.id); }} aria-label="Restore">
                    <RotateCcw />
                  </Button>
                </div>
              )}
              {isCurrent && <Check className="mt-1 size-3.5 text-primary" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
