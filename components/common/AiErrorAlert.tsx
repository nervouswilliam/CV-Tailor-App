"use client";

import Link from "next/link";
import { CircleAlert, KeyRound, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/client-api";

/** Inline error for failed AI calls, with a retry button and a hint for a missing API key. */
export function AiErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  const notLoggedIn = e?.code === "not_logged_in";
  const missingKey = e?.code === "missing_key" || e?.code === "auth" || notLoggedIn;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      {missingKey ? <KeyRound className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
      <div className="flex-1 space-y-1">
        <div className="font-medium text-destructive">{notLoggedIn ? "Claude Code isn\u2019t signed in" : missingKey ? "Anthropic API key problem" : "The AI request failed"}</div>
        <p className="text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        {missingKey && !notLoggedIn && (
          <p className="text-muted-foreground">
            Put <code className="font-mono">ANTHROPIC_API_KEY=…</code> in <code className="font-mono">.env.local</code> (or switch to your Claude plan), restart the dev server, then check it under{" "}
            <Link href="/settings?tab=ai" className="text-primary underline underline-offset-2">
              Settings → AI
            </Link>
            .
          </p>
        )}
      </div>
      {onRetry && !missingKey && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
    </div>
  );
}
