"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import type { Profile } from "@/lib/schemas";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Loads the profile and autosaves (debounced) after every change.
 *
 * Saves send the whole profile, so this tab must never hold a stale copy:
 * it re-reads the profile whenever the tab regains focus (if everything here is
 * saved), and a load that finishes after a local edit is discarded.
 */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Profile | null>(null);
  /** Incremented on every local edit; `savedSeq` is the edit last written to the server. */
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const saving = useRef(false);
  const loadStarted = useRef(false);

  const reload = useCallback(async () => {
    const seq = editSeq.current;
    const p = await api<Profile>("/api/profile");
    if (editSeq.current !== seq) return; // edited while loading: keep the local version
    latest.current = p;
    setProfile(p);
  }, []);

  useEffect(() => {
    // Load once, even though React dev mode runs effects twice.
    if (loadStarted.current) return;
    loadStarted.current = true;
    reload().catch((e) => toast.error(`Could not load profile: ${e.message}`));
  }, [reload]);

  // Pick up changes made in another tab (or by the app itself) when coming back to this one.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (timer.current || saving.current || editSeq.current !== savedSeq.current) return; // unsaved local edits
      reload().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  const flush = useCallback(async (activity?: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!latest.current) return;
    const seq = editSeq.current;
    saving.current = true;
    setState("saving");
    try {
      await api<Profile>("/api/profile", { method: "PUT", json: { profile: latest.current, activity } });
      savedSeq.current = Math.max(savedSeq.current, seq);
      setState("saved");
    } catch (e) {
      setState("error");
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      saving.current = false;
    }
  }, []);

  /** Apply a change. `activity` (optional) is logged to the activity feed and saves immediately. */
  const update = useCallback(
    (fn: (p: Profile) => Profile, activity?: string) => {
      if (!latest.current) return;
      const next = fn(structuredClone(latest.current));
      latest.current = next;
      editSeq.current++;
      setProfile(next);
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      if (activity) {
        void flush(activity).then(() => toast.success(activity));
      } else {
        timer.current = setTimeout(() => void flush(), 700);
      }
    },
    [flush],
  );

  const replace = useCallback(
    async (p: Profile, activity: string) => {
      latest.current = p;
      editSeq.current++;
      setProfile(p);
      await flush(activity);
    },
    [flush],
  );

  // Save pending changes when leaving the page.
  useEffect(() => {
    const onUnload = () => {
      if (timer.current && latest.current) {
        navigator.sendBeacon?.("/api/profile", new Blob([JSON.stringify({ profile: latest.current })], { type: "application/json" }));
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      if (timer.current) void flush();
    };
  }, [flush]);

  return { profile, update, replace, state, reload };
}
