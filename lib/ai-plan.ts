import "server-only";
import os from "node:os";
import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * "Claude plan" provider: runs a single structured-output turn through the
 * Claude Agent SDK, which authenticates with your Claude Code login (Pro / Max /
 * Team / Enterprise) and draws from your plan's usage limits instead of API credits.
 *
 * Auth, in order: CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) if set,
 * otherwise the login stored by `claude` → /login. ANTHROPIC_API_KEY is removed
 * from the subprocess environment so it can never silently bill the API instead.
 */

export class PlanError extends Error {
  constructor(
    public code: "not_logged_in" | "usage_limit" | "invalid_output" | "failed",
    message: string,
  ) {
    super(message);
  }
}

export type PlanUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export function hasOauthToken() {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim());
}

function planEnv() {
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "cv-tailor/0.1" };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

const LOGIN_HELP =
  'Claude Code is not logged in. Open a terminal and run "claude", then type /login and sign in with your Claude account. ' +
  'Or run "claude setup-token" and put the token in .env.local as CLAUDE_CODE_OAUTH_TOKEN=…, then restart the dev server.';

function classify(text: string): PlanError {
  if (/not logged in|\/login|invalid api key|oauth|authenticat/i.test(text)) return new PlanError("not_logged_in", LOGIN_HELP);
  if (/usage limit|rate limit|limit reached|resets at/i.test(text)) return new PlanError("usage_limit", `Your Claude plan's usage limit was hit: ${text}`);
  return new PlanError("failed", text);
}

export async function planStructured(opts: {
  model: string;
  system: string;
  task: string;
  schema: z.ZodType;
  effort: "low" | "medium" | "high";
  onText?: (textSoFar: string) => void;
}): Promise<{ json: unknown; usage: PlanUsage }> {
  const schema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete schema.$schema;

  const q = query({
    prompt: opts.task,
    options: {
      model: opts.model,
      systemPrompt: opts.system,
      tools: [], // no file/shell tools: this is a pure text-in, JSON-out call
      settingSources: [], // don't load the user's CLAUDE.md / settings
      persistSession: false,
      verbatimPrompts: true, // JD text is untrusted: no @file expansion or /commands
      cwd: os.tmpdir(),
      maxTurns: 4, // structured output is returned via a tool call, with room for retries
      thinking: { type: "adaptive" },
      effort: opts.effort,
      includePartialMessages: true,
      outputFormat: { type: "json_schema", schema },
      env: planEnv(),
    },
  });

  let partial = "";
  let result: SDKResultMessage | null = null;
  try {
    for await (const m of q) {
      if (m.type === "stream_event") {
        const ev = m.event;
        if (ev.type === "content_block_delta") {
          if (ev.delta.type === "input_json_delta") partial += ev.delta.partial_json;
          else if (ev.delta.type === "text_delta") partial += ev.delta.text;
          else continue;
          opts.onText?.(partial);
        }
      } else if (m.type === "result") {
        result = m;
      }
    }
  } catch (e) {
    throw classify(e instanceof Error ? e.message : String(e));
  }

  if (!result) throw new PlanError("failed", "Claude Code ended without a result.");
  const usage: PlanUsage = {
    inputTokens: result.usage.input_tokens ?? 0,
    outputTokens: result.usage.output_tokens ?? 0,
    cacheReadTokens: result.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: result.usage.cache_creation_input_tokens ?? 0,
  };
  if (result.subtype !== "success") {
    if (result.subtype === "error_max_structured_output_retries") throw new PlanError("invalid_output", "The model could not produce valid JSON for this schema.");
    throw classify(result.errors?.join("; ") || result.subtype);
  }
  if (result.is_error) throw classify(result.result || "Claude Code returned an error.");
  if (result.structured_output === undefined) {
    // Fall back to parsing the final text if the SDK didn't attach structured output.
    try {
      return { json: JSON.parse(result.result), usage };
    } catch {
      throw new PlanError("invalid_output", "The model did not return structured JSON.");
    }
  }
  return { json: result.structured_output, usage };
}

/** Settings → "Test connection" for the plan provider. */
export async function planTest(model: string) {
  await planStructured({
    model,
    system: "Reply with the requested JSON only.",
    task: 'Return {"ok": true}.',
    schema: z.object({ ok: z.boolean() }),
    effort: "low",
  });
}
