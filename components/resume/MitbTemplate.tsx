import type { ReactNode } from "react";
import type { Resume, Bullet } from "@/lib/schemas";
import {
  ADDITIONAL_KEYS,
  ADDITIONAL_LABELS,
  SECTION_LABELS,
  SECTION_ORDER,
  additionalId,
  formatMoney,
  sectionId,
  type ElementKind,
  type SectionKey,
} from "@/lib/resume-utils";
import "./mitb.css";

/**
 * The MITB SMU one-page resume layout, matched to the candidate's base CV.
 * Pure (no hooks) so it renders identically in the editor preview (client) and
 * the print route used for PDF export (server).
 *
 * The optional render hooks let the editor add selection, inline editing, diffs
 * and drag-and-drop without changing the markup the PDF gets.
 */
export type TemplateHooks = {
  /** Wrap a selectable element. */
  element?: (id: string, kind: ElementKind, node: ReactNode, opts: { block: boolean }) => ReactNode;
  /** Render a text field (default: money-formatted, with **bold** spans). */
  text?: (id: string, field: string, value: string) => ReactNode;
  /** Render a list of children (bullets / roles / section entries); lets the editor add drag-and-drop or diff ghosts. */
  list?: (containerId: string, kind: "bullets" | "roles" | "entries", items: { id: string; node: ReactNode }[]) => ReactNode;
};

/** Render text with **bold** markers (used for key tools and metrics inside bullets). */
export function RichText({ text }: { text: string }) {
  const parts = formatMoney(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : p ? <span key={i}>{p}</span> : null,
      )}
    </>
  );
}

/** Display form of a field: degrees get their name (before any "(") in bold, like the base CV. */
export function displayValue(field: string, value: string) {
  if (field !== "degree" || value.includes("**")) return value;
  const i = value.indexOf("(");
  if (i <= 0) return `**${value.trim()}**`;
  return `**${value.slice(0, i).trim()}** ${value.slice(i)}`;
}

const defaultText = (_id: string, field: string, v: string) => <RichText text={displayValue(field, v)} />;

export function MitbTemplate({ resume, hooks = {}, className }: { resume: Resume; hooks?: TemplateHooks; className?: string }) {
  const T = hooks.text ?? defaultText;
  const E = (id: string, kind: ElementKind, node: ReactNode, block = true) =>
    hooks.element ? hooks.element(id, kind, node, { block }) : node;
  const L = (containerId: string, kind: "bullets" | "roles" | "entries", items: { id: string; node: ReactNode }[]) =>
    hooks.list ? hooks.list(containerId, kind, items) : items.map((i) => <FragmentKey key={i.id}>{i.node}</FragmentKey>);

  const bullets = (containerId: string, bs: Bullet[]) =>
    bs.length > 0 && (
      <ul className="mitb-bullets">
        {L(
          containerId,
          "bullets",
          bs.map((b) => ({
            id: b.id,
            node: E(b.id, "bullet", <li className="mitb-bullet" data-bullet={b.id}>{T(b.id, "text", b.text)}</li>),
          })),
        )}
      </ul>
    );

  const section = (key: SectionKey, children: ReactNode) =>
    E(
      sectionId(key),
      "section",
      <section className="mitb-section" data-section={key}>
        <div className="mitb-section-title">{SECTION_LABELS[key]}</div>
        {children}
      </section>,
    );

  const { header } = resume;
  const linkedinHref = header.linkedin ? (header.linkedin.startsWith("http") ? header.linkedin : `https://${header.linkedin}`) : "";

  const sections: Record<SectionKey, () => ReactNode> = {
    education: () =>
      resume.education.length > 0 &&
      section(
        "education",
        L(
          sectionId("education"),
          "entries",
          resume.education.map((e) => ({
            id: e.id,
            node: E(
              e.id,
              "education",
              <div className="mitb-entry mitb-edu">
                <div className="mitb-row">
                  <span>
                    <span className="mitb-strong mitb-caps">{T(e.id, "institution", e.institution)}</span>
                    {e.location && <>{" – "}{T(e.id, "location", e.location)}</>}
                  </span>
                  <span className="mitb-right">{dateRange(e.startDate, e.endDate, (f, v) => T(e.id, f, v))}</span>
                </div>
                <div>
                  {T(e.id, "degree", e.degree)}
                  {e.grade && <> ({T(e.id, "grade", e.grade.replace(/^\(|\)$/g, ""))})</>}
                </div>
                {e.coursework && e.coursework.length > 0 && (
                  <div>
                    <span className="mitb-label">Relevant Coursework: </span>
                    {T(e.id, "coursework", e.coursework.join(", "))}
                  </div>
                )}
              </div>,
            ),
          })),
        ),
      ),

    academicProjects: () =>
      resume.academicProjects &&
      resume.academicProjects.length > 0 &&
      section(
        "academicProjects",
        L(
          sectionId("academicProjects"),
          "entries",
          resume.academicProjects.map((p) => ({
            id: p.id,
            node: E(
              p.id,
              "project",
              <div className="mitb-entry mitb-project">
                <div className="mitb-row">
                  <span className="mitb-strong">{T(p.id, "title", p.title)}</span>
                  {p.date && <span className="mitb-right">{T(p.id, "date", p.date)}</span>}
                </div>
                {bullets(p.id, p.bullets)}
              </div>,
            ),
          })),
        ),
      ),

    experience: () =>
      resume.experience.length > 0 &&
      section(
        "experience",
        L(
          sectionId("experience"),
          "entries",
          resume.experience.map((c) => {
            const multi = c.roles.length > 1;
            const span = c.roles.length ? { start: c.roles[c.roles.length - 1].startDate, end: c.roles[0].endDate } : { start: "", end: "" };
            return {
              id: c.id,
              node: E(
                c.id,
                "company",
                <div className="mitb-entry">
                  <div className="mitb-row">
                    <span>
                      <span className="mitb-strong">{T(c.id, "name", c.name)}</span>
                      {c.location && <>{" – "}{T(c.id, "location", c.location)}</>}
                    </span>
                    <span className="mitb-right">
                      {multi
                        ? dateRange(span.start, span.end, (_f, v) => v)
                        : c.roles[0] && dateRange(c.roles[0].startDate, c.roles[0].endDate, (f, v) => T(c.roles[0].id, f, v))}
                    </span>
                  </div>
                  {c.descriptor && <div className="mitb-descriptor">{T(c.id, "descriptor", c.descriptor)}</div>}
                  {L(
                    c.id,
                    "roles",
                    c.roles.map((r) => ({
                      id: r.id,
                      node: E(
                        r.id,
                        "role",
                        <div className="mitb-role">
                          <div className="mitb-row">
                            <span className="mitb-strong">{T(r.id, "title", r.title)}</span>
                            {multi && <span className="mitb-right">{dateRange(r.startDate, r.endDate, (f, v) => T(r.id, f, v))}</span>}
                          </div>
                          {bullets(r.id, r.bullets)}
                        </div>,
                      ),
                    })),
                  )}
                </div>,
              ),
            };
          }),
        ),
      ),

    extracurricular: () =>
      resume.extracurricular &&
      resume.extracurricular.length > 0 &&
      section(
        "extracurricular",
        L(
          sectionId("extracurricular"),
          "entries",
          resume.extracurricular.map((a) => ({
            id: a.id,
            node: E(
              a.id,
              "activity",
              <div className="mitb-entry">
                <div className="mitb-row">
                  <span>
                    <span className="mitb-strong">{T(a.id, "organisation", a.organisation)}</span>
                    {a.title && <>{" – "}{T(a.id, "title", a.title)}</>}
                  </span>
                  <span className="mitb-right">{T(a.id, "date", a.date)}</span>
                </div>
                {bullets(a.id, a.bullets)}
              </div>,
            ),
          })),
        ),
      ),

    additional: () =>
      section(
        "additional",
        ADDITIONAL_KEYS.filter((k) => (resume.additional[k] ?? []).length > 0).map((k) => (
          <FragmentKey key={k}>
            {E(
              additionalId(k),
              "additional",
              <div className="mitb-additional-line">
                <span className="mitb-label">{ADDITIONAL_LABELS[k]}</span>: {T(additionalId(k), "items", (resume.additional[k] ?? []).join(", "))}
              </div>,
            )}
          </FragmentKey>
        )),
      ),
  };

  return (
    <div className={`mitb-page ${className ?? ""}`} data-mitb-page>
      <div className="mitb-content" data-mitb-content>
        <header className="mitb-header">
          <div className="mitb-name">{header.name || "Your Name"}</div>
          {(header.email || header.phone || header.linkedin) && (
            <div className="mitb-contact">
              <span />
              <span className="mitb-contact-item">
                {header.email && (
                  <a className="mitb-link" href={`mailto:${header.email}`}>
                    {header.email}
                  </a>
                )}
              </span>
              <span />
              <span className="mitb-contact-item">{header.phone && <a href={`tel:${header.phone.replace(/\s/g, "")}`}>{header.phone}</a>}</span>
              <span />
              <span className="mitb-contact-item">
                {header.linkedin && (
                  <a className="mitb-link" href={linkedinHref}>
                    {header.linkedin}
                  </a>
                )}
              </span>
            </div>
          )}
        </header>

        {SECTION_ORDER.map((k) => (
          <FragmentKey key={k}>{sections[k]()}</FragmentKey>
        ))}
      </div>
    </div>
  );
}

function FragmentKey({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function dateRange(start: string, end: string, T: (field: string, v: string) => ReactNode) {
  if (!start && !end) return null;
  if (!start || start === end) return T("endDate", end || start);
  return (
    <>
      {T("startDate", start)} – {T("endDate", end)}
    </>
  );
}
