import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";

/** Small JSON file for app preferences that don't need a database column. */
const PREFS_FILE = path.join(process.cwd(), "data", "preferences.json");

export type Preferences = { exportDir: string };
const DEFAULT_PREFS: Preferences = { exportDir: "" };

export async function getPreferences(): Promise<Preferences> {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(await fs.readFile(PREFS_FILE, "utf8")) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setPreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const next = { ...(await getPreferences()), ...patch };
  await fs.mkdir(path.dirname(PREFS_FILE), { recursive: true });
  await fs.writeFile(PREFS_FILE, JSON.stringify(next, null, 2));
  return next;
}

export class PathError extends Error {}

const norm = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);

/** Resolve an absolute path and require it to be inside the user's home folder. */
export function assertInsideHome(input: string): string {
  const raw = input.trim().replace(/^["']|["']$/g, "");
  if (!raw) throw new PathError("No folder given.");
  if (!path.isAbsolute(raw)) throw new PathError(`Use a full folder path, e.g. ${path.join(os.homedir(), "Documents", "CVs")}`);
  const p = path.resolve(raw);
  const home = path.resolve(os.homedir());
  if (norm(p) !== norm(home) && !norm(p).startsWith(norm(home) + path.sep)) {
    throw new PathError(`For safety the app only saves inside your user folder (${home}).`);
  }
  return p;
}

/**
 * Validate a folder the user wants PDFs saved to. It must be an absolute path inside
 * the user's home folder: the dev server is reachable from the local network, so it
 * must not be able to write anywhere on the machine. Missing folders are created.
 */
export async function resolveExportDir(input: string): Promise<string> {
  const dir = assertInsideHome(input);
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) throw new PathError(`${dir} is a file, not a folder.`);
  } catch (e) {
    if (e instanceof PathError) throw e;
    await fs.mkdir(dir, { recursive: true });
  }
  return dir;
}

/** Open the native "choose folder" dialog on this machine (Windows). Resolves to null if cancelled. */
export function pickFolder(initial?: string): Promise<string | null> {
  if (process.platform !== "win32") return Promise.reject(new PathError("Browse is only available on Windows; type the folder path instead."));
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$d.Description = 'Choose where CV Tailor saves your PDFs'",
    "$d.ShowNewFolderButton = $true",
    `if ($env:CVT_INITIAL -and (Test-Path -LiteralPath $env:CVT_INITIAL)) { $d.SelectedPath = $env:CVT_INITIAL }`,
    // A top-most owner window keeps the dialog in front of the browser.
    "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }",
    "if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }",
  ].join("; ");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-STA", "-NonInteractive", "-Command", script],
      { timeout: 5 * 60_000, windowsHide: true, env: { ...process.env, CVT_INITIAL: initial ?? "" } },
      (err, stdout) => {
        if (err) return reject(new PathError(`Could not open the folder picker: ${err.message}`));
        resolve(stdout.trim() || null);
      },
    );
  });
}

/** Show a file in Explorer (Windows) / Finder (macOS). */
export function revealInFolder(file: string) {
  if (process.platform === "win32") {
    spawn("explorer.exe", [`/select,"${file}"`], { windowsVerbatimArguments: true, detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", ["-R", file], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [path.dirname(file)], { detached: true, stdio: "ignore" }).unref();
  }
}
