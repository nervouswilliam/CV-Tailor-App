# CV Tailor

Turn a job description into a tailored, one-page resume in the MITB SMU format. Paste a JD, answer a few probing questions, get a draft on a live A4 page, refine any part by clicking it, and save a PDF.

Single-user, runs locally. No auth.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then put your ANTHROPIC_API_KEY in it
npm run setup                      # create data/app.db, seed settings + profile, install headless Chromium
npm run dev                        # http://localhost:3000
```

- **Two ways to pay for AI calls** (Settings → AI → Provider):
  - **Claude plan**: runs through the Claude Agent SDK on your Claude Pro / Max / Team subscription and counts toward your plan's usage limits (see [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)). Sign in once with `claude` → `/login`, or run `claude setup-token` and set `CLAUDE_CODE_OAUTH_TOKEN` in `.env.local`. `ANTHROPIC_API_KEY` is stripped from these calls so they never bill the API.
  - **Anthropic API**: pay per token with `ANTHROPIC_API_KEY` in `.env.local`.
- Secrets live only in `.env.local` and are read by server routes. The browser only ever sees whether they are set.
- The model defaults to `claude-sonnet-5` (`ANTHROPIC_MODEL` in `.env`) and can be changed in **Settings → AI**.
- `npm run db:seed -- --demo` adds a demo application with a sample resume so you can try the editor without an API key.
- PDF export uses Playwright. If `playwright install chromium` can't download, it falls back to your installed Edge or Chrome automatically (or set `PDF_BROWSER_CHANNEL=msedge|chrome`).

## First run

1. **Settings → Import / export**: paste your master document and let the AI turn it into the structured profile. Review it, then save.
2. **Settings → Personal info**: check your name, email, phone and LinkedIn. These go into the resume header verbatim.
3. **Settings → AI**: replace the system prompt with your own (`prompts/system.md` is the default that "Reset to default" restores).
4. **New Application**: paste a JD → Analyse → answer or skip questions → Generate CV.

## Documents as context

Every role, project, activity and education entry in **Settings** has a **Documents** panel. Attach (or drag in) a PDF, PPTX (slides + speaker notes), DOCX, TXT or MD file about that work. The app extracts the text, and the AI summarises it into a summary, key facts, metrics, tools and suggested bullets. That summary is included under the item in the Master Knowledge Document for every analysis, draft and edit, and bullets based on it cite the item as their source. You can add suggested bullets to the item's bullet bank with one click.

Files are stored in `data/attachments/` and the extracted text in the database. Scanned PDFs without selectable text can't be read; export them with text or OCR them first.

## How it works

- The AI never writes layout. It returns a **structured JSON resume** (`lib/schemas.ts`), validated with Zod. `components/resume/MitbTemplate.tsx` renders it, and the same component is used for the preview and for the PDF (`/print/[id]`, printed by Playwright). That keeps the preview and the PDF identical.
- Every element has a stable id, so the AI can edit a single bullet (`/api/ai/edit-element` returns a patch for just the selected ids).
- Every accepted change is a new `ResumeVersion` row. Undo/redo, history and restore all work from those rows.
- Every bullet carries a `sourceRef` pointing at a profile item id or `answer:<questionId>`. Bullets without a traceable source are flagged in the editor.
- The one-page check measures the rendered template against the printable A4 area. After a draft or an accepted chat edit, an overflow triggers one automatic `fit-page` call, shown as a diff for approval. The PDF route reports the real page count.

| Path | What |
| --- | --- |
| `lib/ai.ts` | Every Claude call: system prompt + profile + task, structured output, Zod validation, one retry, usage logging |
| `lib/ai-schemas.ts` | Output schemas sent to Claude (all fields required) and converters to app shapes |
| `lib/profile-md.ts` | Serialises the profile into the "Master Knowledge Document" the AI reads |
| `app/api/ai/*` | analyse, draft, edit-element, edit-document, fit-page, parse-profile, suggest-profile-additions |
| `components/editor/*` | Editor: canvas (selection, diffs, inline edit, drag reorder), prompt popover, chat/rationale/JD/history, profile library |
| `prisma/schema.prisma` | SQLite schema (`data/app.db`) |

The profile is stored as a single Zod-validated JSON document (the `Profile` row). That makes nested editing and import/export much simpler than a table per section for a single-user app.

## Keyboard

| Keys | Action |
| --- | --- |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo |
| Ctrl+S | Save PDF |
| Ctrl+Enter | Submit prompt / chat / analyse |
| Esc | Close popover, clear selection, leave version preview |
| Delete | Delete selected elements |
| Shift-click | Multi-select |
| Double-click text | Edit by hand |

## Reference template

Put the official MITB template PDF in `reference/` to compare against. Spacing and typography live in `components/resume/mitb.css`, and the font is set in `app/layout.tsx` (`EB_Garamond`).
