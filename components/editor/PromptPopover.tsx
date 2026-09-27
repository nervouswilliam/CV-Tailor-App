"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Loader2, RotateCw, Scissors, Sparkles, Target, Trash2, TrendingUp, X, Zap, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const QUICK_ACTIONS = [
  { key: "shorten", label: "Shorten", icon: Scissors, prompt: "Shorten this so it fits on one line where possible, keeping the strongest result." },
  { key: "verb", label: "Stronger verb", icon: Zap, prompt: "Start with a stronger, more specific action verb. Keep the content otherwise the same." },
  { key: "quant", label: "More quantified", icon: TrendingUp, prompt: "Make this more quantified using only numbers that exist in the profile or my answers. Do not invent metrics." },
  { key: "jd", label: "Match JD keywords", icon: Target, prompt: "Work in the job description's key terms where they are truthful for this experience." },
  { key: "rewrite", label: "Rewrite", icon: PenLine, prompt: "Rewrite this to be more compelling for this specific job." },
] as const;

type Props = {
  anchorIds: string[];
  label: string;
  status: "idle" | "loading" | "review";
  note?: string;
  error?: string | null;
  onSubmit: (prompt: string, label?: string) => void;
  onDelete: () => void;
  onAccept: () => void;
  onReject: () => void;
  onRetry: () => void;
  onClose: () => void;
  container: HTMLElement | null;
};

/** Floating prompt box anchored below the selected element(s) in the preview. */
export function PromptPopover(props: Props) {
  const { anchorIds, container, status } = props;
  const [prompt, setPrompt] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!container) return;
    const place = () => {
      const els = anchorIds.map((id) => container.querySelector<HTMLElement>(`[data-el="${CSS.escape(id)}"]`)).filter(Boolean) as HTMLElement[];
      if (!els.length) return setPos(null);
      const cr = container.getBoundingClientRect();
      const rects = els.map((e) => e.getBoundingClientRect());
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const top = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      const width = 440;
      const boxH = boxRef.current?.offsetHeight ?? 150;
      let y = bottom - cr.top + container.scrollTop + 8;
      // Flip above if it would run past the bottom of the scroll area.
      if (bottom + boxH + 16 > cr.bottom && top - cr.top > boxH + 16) y = top - cr.top + container.scrollTop - boxH - 8;
      const x = Math.min(Math.max(8, left - cr.left + container.scrollLeft), container.scrollWidth - width - 8);
      setPos({ top: y, left: x, width });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(container);
    const inner = container.firstElementChild;
    if (inner) ro.observe(inner);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchorIds, container, status]);

  useEffect(() => {
    if (status === "idle") inputRef.current?.focus({ preventScroll: true });
  }, [status, anchorIds]);

  if (!pos) return null;

  const submit = (p: string, label?: string) => {
    if (!p.trim() || status === "loading") return;
    props.onSubmit(p.trim(), label);
  };

  return (
    <div
      ref={boxRef}
      className="absolute z-30 rounded-xl border bg-popover p-2.5 text-popover-foreground shadow-xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">
          <Sparkles className="mr-1 inline size-3 text-primary" />
          {props.label}
        </span>
        <button onClick={props.onClose} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Close (Esc)">
          <X className="size-3.5" />
        </button>
      </div>

      {status === "review" ? (
        <div className="space-y-2">
          {props.note && <p className="text-sm">{props.note}</p>}
          <p className="text-xs text-muted-foreground">Changes are highlighted on the page.</p>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={props.onAccept}>
              <Check /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={props.onReject}>
              <X /> Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={props.onRetry}>
              <RotateCw /> Try again
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={status === "loading"}
              rows={2}
              placeholder="e.g. make this more business-focused, add the 30% metric"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submit(prompt);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  props.onClose();
                }
              }}
              className="w-full resize-none rounded-lg border bg-background px-2.5 py-2 pr-9 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
            />
            <button
              onClick={() => submit(prompt)}
              disabled={!prompt.trim() || status === "loading"}
              className="absolute right-1.5 bottom-2.5 grid size-6 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Submit (Ctrl+Enter)"
            >
              {status === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <CornerDownLeft className="size-3.5" />}
            </button>
          </div>
          {props.error && <p className="mt-1 text-xs text-destructive">{props.error}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK_ACTIONS.map((a) => (
              <Chip key={a.key} disabled={status === "loading"} onClick={() => submit(a.prompt, a.label)}>
                <a.icon className="size-3" /> {a.label}
              </Chip>
            ))}
            <Chip disabled={status === "loading"} onClick={props.onDelete} className="text-destructive hover:bg-destructive/10">
              <Trash2 className="size-3" /> Delete
            </Chip>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ children, onClick, disabled, className }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}
