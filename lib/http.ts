import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "./ai";

export function errorResponse(e: unknown) {
  if (e instanceof AiError) {
    const status = e.code === "missing_key" || e.code === "not_logged_in" ? 503 : e.code === "auth" ? 401 : e.code === "rate_limit" ? 429 : 502;
    return NextResponse.json({ error: e.message, code: e.code, retryable: e.retryable }, { status });
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
}

export type StreamEvent =
  | { type: "progress"; chars: number; partial?: string }
  | { type: "status"; message: string }
  | { type: "result"; data: unknown }
  | { type: "error"; error: string; code?: string; retryable?: boolean };

/** Stream newline-delimited JSON events to the client while `run` works. */
export function ndjsonStream(run: (send: (ev: StreamEvent) => void) => Promise<unknown>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (ev: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      try {
        const data = await run(send);
        send({ type: "result", data });
      } catch (e) {
        if (e instanceof AiError) send({ type: "error", error: e.message, code: e.code, retryable: e.retryable });
        else {
          console.error(e);
          send({ type: "error", error: e instanceof Error ? e.message : "Unexpected error" });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}

/** Throttle progress events so we don't flood the client. */
export function progressSender(send: (ev: StreamEvent) => void, withPartial = false) {
  let last = 0;
  return (text: string) => {
    const now = Date.now();
    if (now - last < 150) return;
    last = now;
    send({ type: "progress", chars: text.length, partial: withPartial ? text : undefined });
  };
}
