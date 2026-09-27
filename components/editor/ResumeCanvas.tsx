"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import { diffWords } from "diff";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MitbTemplate, RichText, displayValue, type TemplateHooks } from "@/components/resume/MitbTemplate";
import type { Resume } from "@/lib/schemas";
import { childrenOf, findElement, formatMoney, getElementField, type ElementKind } from "@/lib/resume-utils";

export const MM = 96 / 25.4;
export const PAGE_W = 210 * MM;
export const PAGE_H = 297 * MM;
/** Printable height: A4 minus the template's top/bottom margins (13mm each; see mitb.css). */
export const CONTENT_H = (297 - 26) * MM;
/** One body line at 10.5pt × 1.235 line-height (Calibri single spacing). */
export const LINE_PX = 10.5 * 1.235 * (96 / 72);

export type Measure = { contentPx: number; overflowPx: number; overflowLines: number };
export type EditTarget = { id: string; field: string } | null;

type Props = {
  resume: Resume;
  compare?: Resume | null;
  mode: "edit" | "diff" | "readonly";
  zoom: number;
  selected: Set<string>;
  flagged: Set<string>;
  hovered: string | null;
  editing: EditTarget;
  onHover: (id: string | null) => void;
  onSelect: (id: string, additive: boolean) => void;
  onBackgroundClick: () => void;
  onStartEdit: (t: { id: string; field: string }) => void;
  onCommitEdit: (id: string, field: string, text: string | null) => void;
  onReorder: (containerId: string, orderedIds: string[]) => void;
  onDropBullet: (containerId: string, payload: string) => void;
  onMeasure: (m: Measure) => void;
};

export function ResumeCanvas(props: Props) {
  const { resume, compare, mode, zoom, selected, flagged, hovered, editing } = props;
  const contentRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const onMeasure = props.onMeasure;

  const measure = useCallback(() => {
    const content = pageRef.current?.querySelector<HTMLElement>("[data-mitb-content]");
    if (!content) return;
    const h = content.offsetHeight;
    const over = Math.max(0, h - CONTENT_H);
    onMeasure({ contentPx: h, overflowPx: over, overflowLines: over > 0.5 ? Math.max(1, Math.round(over / LINE_PX)) : 0 });
  }, [onMeasure]);

  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    document.fonts?.ready.then(measure);
    const content = pageRef.current?.querySelector<HTMLElement>("[data-mitb-content]");
    if (!content) return;
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);

  const interactive = mode === "edit";

  const hooks: TemplateHooks = {
    element: (id, kind, node) => {
      if (!isValidElement(node)) return node;
      const isNew = mode === "diff" && compare && !findElement(compare, id) && !id.startsWith("section.") && !id.startsWith("additional.");
      return cloneElement(node as ReactElement<Record<string, unknown>>, {
        "data-el": mode === "readonly" ? undefined : id,
        "data-kind": kind,
        "data-selected": selected.has(id) ? "true" : undefined,
        "data-hover": interactive && hovered === id && !selected.has(id) ? "true" : undefined,
        "data-flagged": interactive && flagged.has(id) ? "true" : undefined,
        title: interactive && flagged.has(id) ? "This bullet doesn't trace back to your profile or an answer" : undefined,
        className: [(node.props as { className?: string }).className, isNew ? "diff-add" : ""].filter(Boolean).join(" "),
      });
    },
    text: (id, field, value) => {
      if (editing && editing.id === id && editing.field === field && interactive) {
        return <InlineEditor key={`${id}:${field}`} value={value} onDone={(t) => props.onCommitEdit(id, field, t)} />;
      }
      if (mode === "diff" && compare) {
        const before = getElementField(compare, id, field);
        if (before !== undefined && before !== value) return <WordDiff before={formatMoney(before)} after={formatMoney(value)} />;
      }
      return (
        <span data-tid={id} data-field={field}>
          <RichText text={displayValue(field, value)} />
        </span>
      );
    },
    list: (containerId, kind, items) => {
      const ghosts = mode === "diff" && compare ? removedGhosts(compare, resume, containerId, kind) : [];
      if (!interactive) {
        const out: ReactNode[] = items.map((i) => <Keyed key={i.id}>{i.node}</Keyed>);
        for (const g of ghosts) out.splice(Math.min(g.index, out.length), 0, <Keyed key={`ghost-${g.id}`}>{g.node}</Keyed>);
        return out;
      }
      return (
        <SortableGroup
          containerId={containerId}
          items={items}
          disabled={!!editing}
          onReorder={props.onReorder}
          acceptsDrop={kind === "bullets"}
          onDropBullet={props.onDropBullet}
        />
      );
    },
  };

  // Event delegation: hover / click / double-click resolve to the innermost element.
  const elFrom = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-el]") : null);

  return (
    <div style={{ width: PAGE_W * zoom }} className="mx-auto">
      <div
        ref={pageRef}
        style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: PAGE_W }}
        className="relative shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)]"
        onMouseOver={(e) => interactive && props.onHover(elFrom(e.target)?.dataset.el ?? null)}
        onMouseLeave={() => interactive && props.onHover(null)}
        onClick={(e) => {
          if (!interactive || editing) return;
          if ((e.target as Element).closest("a")) e.preventDefault();
          const el = elFrom(e.target);
          if (el?.dataset.el) props.onSelect(el.dataset.el, e.shiftKey || e.metaKey || e.ctrlKey);
          else props.onBackgroundClick();
        }}
        onDoubleClick={(e) => {
          if (!interactive) return;
          const t = (e.target as Element).closest<HTMLElement>("[data-tid]");
          if (t?.dataset.tid && t.dataset.field) {
            e.preventDefault();
            props.onStartEdit({ id: t.dataset.tid, field: t.dataset.field });
          }
        }}
      >
        <div ref={contentRef}>
          <MitbTemplate resume={resume} hooks={hooks} />
        </div>
        {/* Page boundary: anything below this line would spill onto page 2. */}
        <div className="no-print pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-rose-500/70" style={{ top: PAGE_H }}>
          <span className="absolute -top-5 right-2 rounded bg-rose-500 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white">End of page 1</span>
        </div>
        <div className="no-print pointer-events-none absolute inset-x-0 bottom-0 bg-rose-500/[0.07]" style={{ top: PAGE_H }} />
      </div>
      <PageSpacer pageRef={pageRef} zoom={zoom} />
    </div>
  );
}

/** The scaled page is transformed, so reserve its scaled height in the layout. */
function PageSpacer({ pageRef, zoom }: { pageRef: React.RefObject<HTMLDivElement | null>; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const page = pageRef.current;
    const spacer = ref.current;
    if (!page || !spacer) return;
    const update = () => {
      const h = Math.max(page.offsetHeight, PAGE_H);
      spacer.style.height = `${h * zoom - page.offsetHeight}px`;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(page);
    return () => ro.disconnect();
  }, [pageRef, zoom]);
  return <div ref={ref} />;
}

function Keyed({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function removedGhosts(base: Resume, next: Resume, containerId: string, kind: "bullets" | "roles" | "entries") {
  const before = childrenOf(base, containerId);
  const after = new Set(childrenOf(next, containerId).map((c) => c.id));
  // Only render ghosts inside containers that still exist in the proposal.
  if (!containerId.startsWith("section.") && !findElement(next, containerId)) return [];
  return before
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => !after.has(c.id))
    .map(({ c, index }) => ({
      id: c.id,
      index,
      node:
        kind === "bullets" ? (
          <li className="mitb-bullet diff-ghost">
            <span className="diff-del">{formatMoney(c.text)}</span>
          </li>
        ) : (
          <div className="diff-ghost my-[2pt]">
            <span className="diff-del">Removed {c.kind}: {c.text}</span>
          </div>
        ),
    }));
}

function WordDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <>
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="diff-add">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="diff-del">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

function InlineEditor({ value, onDone }: { value: string; onDone: (t: string | null) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = value;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [value]);
  const finish = (t: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(t);
  };
  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(ref.current?.textContent ?? "");
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      }}
      onBlur={() => finish(ref.current?.textContent ?? "")}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Drag-and-drop reordering of bullets / roles / entries               */
/* ------------------------------------------------------------------ */

function SortableGroup({
  containerId,
  items,
  disabled,
  onReorder,
  acceptsDrop,
  onDropBullet,
}: {
  containerId: string;
  items: { id: string; node: ReactNode }[];
  disabled: boolean;
  onReorder: (containerId: string, ids: string[]) => void;
  acceptsDrop: boolean;
  onDropBullet: (containerId: string, payload: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const ids = items.map((i) => i.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    onReorder(containerId, next);
  };
  const content = (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((i) => (
          <SortableNode key={i.id} id={i.id} node={i.node} disabled={disabled} />
        ))}
      </SortableContext>
    </DndContext>
  );
  if (!acceptsDrop) return content;
  // Bullet lists also accept bullets dragged in from the profile library (HTML5 DnD).
  return (
    <DropZone containerId={containerId} onDropBullet={onDropBullet}>
      {content}
    </DropZone>
  );
}

function DropZone({ containerId, onDropBullet, children }: { containerId: string; onDropBullet: (c: string, p: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // Attach to the <ul> parent so the whole bullet list is a drop target.
    const ul = ref.current?.parentElement;
    if (!ul) return;
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("application/x-cv-bullet")) {
        e.preventDefault();
        ul.dataset.dropTarget = "true";
      }
    };
    const leave = () => delete ul.dataset.dropTarget;
    const drop = (e: DragEvent) => {
      const payload = e.dataTransfer?.getData("application/x-cv-bullet");
      delete ul.dataset.dropTarget;
      if (payload) {
        e.preventDefault();
        e.stopPropagation();
        onDropBullet(containerId, payload);
      }
    };
    ul.addEventListener("dragover", over);
    ul.addEventListener("dragleave", leave);
    ul.addEventListener("drop", drop);
    return () => {
      ul.removeEventListener("dragover", over);
      ul.removeEventListener("dragleave", leave);
      ul.removeEventListener("drop", drop);
    };
  }, [containerId, onDropBullet]);
  return (
    <>
      <span ref={ref} hidden />
      {children}
    </>
  );
}

function SortableNode({ id, node, disabled }: { id: string; node: ReactNode; disabled: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled });
  if (!isValidElement(node)) return <>{node}</>;
  const el = node as ReactElement<Record<string, unknown>>;
  const onPointerDown = (e: React.PointerEvent) => {
    // Innermost sortable wins; parents (role, company) must not also start a drag.
    listeners?.onPointerDown?.(e);
    e.stopPropagation();
  };
  return cloneElement(el, {
    ref: setNodeRef,
    ...attributes,
    role: undefined,
    tabIndex: undefined,
    onPointerDown,
    "data-dragging": isDragging ? "true" : undefined,
    style: {
      ...((el.props.style as object) ?? {}),
      transform: CSS.Translate.toString(transform),
      transition,
      position: isDragging ? "relative" : undefined,
      zIndex: isDragging ? 20 : undefined,
      background: isDragging ? "white" : undefined,
      boxShadow: isDragging ? "0 4px 16px rgba(0,0,0,0.15)" : undefined,
    },
  });
}

export type { ElementKind };
