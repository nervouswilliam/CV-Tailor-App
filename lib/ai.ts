import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { prisma } from "./db";
import { newRowId } from "./ids";
import { profileToMarkdown } from "./profile-md";
import { attachmentContext } from "./attachments";
import { getProfile, getSettings } from "./store";
import { PlanError, hasOauthToken, planStructured, planTest, type PlanUsage } from "./ai-plan";

export class AiError extends Error {
  constructor(
    public code: "missing_key" | "not_logged_in" | "auth" | "rate_limit" | "overloaded" | "invalid_output" | "refusal" | "truncated" | "api",
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** "api" = Anthropic API key (pay per token); "claude-plan" = Claude Agent SDK on your Claude subscription. */
export type Provider = "api" | "claude-plan";
export const PROVIDERS = ["api", "claude-plan"] as const;
export { hasOauthToken };

function client() {
  if (!hasApiKey()) {
    throw new AiError("missing_key", "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server, or switch the provider to your Claude plan in Settings → AI.");
  }
  return new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
}

/** $ per million tokens: [input, output]. Cache reads bill at 0.1x input, cache writes at 1.25x. */
const PRICING: Record<string, [number, number]> = {
  "claude-sonnet-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-fable-5-1": [10, 50],
  "claude-fable-5": [10, 50],
  "claude-opus-4-8": [5, 25],
  "claude-opus-4-7": [5, 25],
  "claude-opus-4-6": [5, 25],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5": [1, 5],
};

export function estimateCost(u: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): number {
  const [inp, out] = PRICING[u.model] ?? PRICING["claude-sonnet-5"];
  return (
    (u.inputTokens * inp + u.cacheReadTokens * inp * 0.1 + u.cacheWriteTokens * inp * 1.25 + u.outputTokens * out) / 1e6
  );
}

/** Rules the app enforces on every call, on top of the user's editable system prompt. */
const APP_RULES = `# Output rules (enforced by the CV Tailor app)
- Respond only with JSON matching the provided schema. Never return HTML, markdown layout or prose outside the JSON.
- The resume header (name, email, phone, LinkedIn) is filled in by the app from the profile. Never include it.
- Never invent experience, employers, dates, tools or metrics. Every bullet must trace to the Master Knowledge Document or to an answer the candidate gave.
- Set each bullet's "sourceRef" to the id in [brackets] of the profile bullet (or role/project/activity) it came from, or to "answer:<questionId>" when it comes from a probing answer. Use several ids separated by commas when a bullet combines sources. Leave it empty only if you truly cannot trace it; such bullets are flagged to the candidate.
- Preserve the "id" of every element you do not change. New elements get a new short id (8 lowercase letters/digits).
- Format money as $1K / $1M / $1B (S$ for Singapore dollars). Dates look like "Jan 2024" or "Present".
- Match the candidate's base CV style: wrap the key tools, techniques and results in a bullet in **double asterisks** to bold them (typically 1–3 phrases per bullet, never whole sentences). Keep existing **bold** markers when editing unless asked otherwise.`;

type CallOptions<S extends z.ZodType> = {
  endpoint: string;
  applicationId?: string | null;
  schema: S;
  /** The task-specific user message. */
  task: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** Include the serialised profile as context (default true). */
  withProfile?: boolean;
  /** Called with the accumulated raw JSON text as it streams. */
  onText?: (textSoFar: string) => void;
};

/**
 * Single entry point for every Claude call: system prompt + profile + task,
 * structured JSON output validated with Zod (retried once on failure),
 * streamed so long outputs don't time out, and token usage logged.
 */
export async function callStructured<S extends z.ZodType>(opts: CallOptions<S>): Promise<z.infer<S>> {
  const settings = await getSettings();
  const provider = (settings.provider as Provider) ?? "api";
  const withProfile = opts.withProfile ?? true;
  const profileMd = withProfile ? profileToMarkdown(await getProfile(), { attachments: await attachmentContext() }) : "";
  const promptText = settings.systemPrompt || "You are an expert resume writer.";
  const rulesAndProfile = APP_RULES + (withProfile ? `\n\n${profileMd}` : "");
  const effort = opts.effort ?? "medium";

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json =
        provider === "claude-plan"
          ? await runPlan(opts, settings.model, `${promptText}\n\n${rulesAndProfile}`, effort)
          : await runApi(opts, settings.model, promptText, rulesAndProfile, effort);
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new AiError("invalid_output", `The model's output did not match the schema: ${parsed.error.message.slice(0, 300)}`, true);
      }
      return parsed.data;
    } catch (e) {
      lastError = e;
      if (e instanceof AiError && e.retryable && attempt === 0) continue;
      throw normaliseError(e);
    }
  }
  throw normaliseError(lastError);
}

/** Anthropic API (API key, pay per token). */
async function runApi<S extends z.ZodType>(
  opts: CallOptions<S>,
  model: string,
  promptText: string,
  rulesAndProfile: string,
  effort: "low" | "medium" | "high",
): Promise<unknown> {
  const anthropic = client();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: promptText },
    { type: "text", text: rulesAndProfile, cache_control: { type: "ephemeral" } },
  ];
  const stream = anthropic.messages.stream({
    model,
    max_tokens: opts.maxTokens ?? 32000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(opts.schema), effort },
    system,
    messages: [{ role: "user", content: opts.task }],
  });
  let text = "";
  stream.on("text", (delta) => {
    text += delta;
    opts.onText?.(text);
  });
  const msg = await stream.finalMessage();
  await logUsage(opts.endpoint, opts.applicationId ?? null, model, "api", {
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
  });

  if (msg.stop_reason === "refusal") throw new AiError("refusal", "The model declined this request.");
  if (msg.stop_reason === "max_tokens") throw new AiError("truncated", "The response was cut off (max tokens).", true);

  const out = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(out);
  } catch {
    throw new AiError("invalid_output", "The model returned invalid JSON.", true);
  }
}

/** Claude Agent SDK on the user's Claude plan (draws from subscription usage limits, not API credits). */
async function runPlan<S extends z.ZodType>(opts: CallOptions<S>, model: string, system: string, effort: "low" | "medium" | "high"): Promise<unknown> {
  const { json, usage } = await planStructured({ model, system, task: opts.task, schema: opts.schema, effort, onText: opts.onText });
  await logUsage(opts.endpoint, opts.applicationId ?? null, model, "claude-plan", usage);
  return json;
}

function normaliseError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof PlanError) {
    if (e.code === "not_logged_in") return new AiError("not_logged_in", e.message);
    if (e.code === "usage_limit") return new AiError("rate_limit", e.message);
    if (e.code === "invalid_output") return new AiError("invalid_output", e.message, true);
    return new AiError("api", `Claude Code error: ${e.message}`, true);
  }
  if (e instanceof Anthropic.AuthenticationError) return new AiError("auth", "The Anthropic API key was rejected.");
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError("auth", "The API key lacks permission for this model.");
  if (e instanceof Anthropic.NotFoundError) return new AiError("api", "Model not found. Check the model name in Settings → AI.");
  if (e instanceof Anthropic.RateLimitError) return new AiError("rate_limit", "Rate limited by the Anthropic API. Try again shortly.", true);
  if (e instanceof Anthropic.InternalServerError) return new AiError("overloaded", "The Anthropic API is overloaded. Try again.", true);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("api", "Could not reach the Anthropic API. Check your connection.", true);
  if (e instanceof Anthropic.APIError) return new AiError("api", `Anthropic API error: ${e.message}`, true);
  return new AiError("api", e instanceof Error ? e.message : String(e), true);
}

async function logUsage(endpoint: string, applicationId: string | null, model: string, provider: Provider, usage: PlanUsage) {
  await prisma.aiUsage.create({ data: { id: newRowId(), endpoint, applicationId, model, provider, ...usage } });
}

/** Minimal call used by Settings → "Test connection". */
export async function testConnection(model: string, provider: Provider): Promise<{ ok: true; model: string }> {
  try {
    if (provider === "claude-plan") await planTest(model);
    else await client().messages.create({ model, max_tokens: 16, messages: [{ role: "user", content: "Reply with OK." }] });
    return { ok: true, model };
  } catch (e) {
    throw normaliseError(e);
  }
}
