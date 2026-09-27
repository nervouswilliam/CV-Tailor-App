"use client";

export class ApiError extends Error {
  constructor(message: string, public code?: string, public retryable?: boolean) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, data?.code, data?.retryable);
  return data as T;
}

export type StreamHandlers = {
  onProgress?: (chars: number, partial?: string) => void;
  onStatus?: (message: string) => void;
};

/** POST and consume an NDJSON event stream; resolves with the final result. */
export async function streamApi<T>(url: string, json: unknown, handlers: StreamHandlers = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json), signal });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, data?.code, data?.retryable);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: T | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.type === "progress") handlers.onProgress?.(ev.chars, ev.partial);
      else if (ev.type === "status") handlers.onStatus?.(ev.message);
      else if (ev.type === "result") result = ev.data as T;
      else if (ev.type === "error") throw new ApiError(ev.error, ev.code, ev.retryable);
    }
  }
  if (result === undefined) throw new ApiError("The stream ended without a result.", "api", true);
  return result;
}
