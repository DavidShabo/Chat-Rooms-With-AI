// Fails the build with a clear message if a client component ever imports
// this, instead of a confusing "node:fs can't be bundled" error.
import "server-only";

import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Read-only, sandboxed filesystem access for the assistant.
 *
 * Design rules, in order of importance:
 *   1. Disabled unless PIXI_FILE_ROOTS names directories explicitly.
 *   2. Every resolved path must sit inside one of those roots — checked
 *      after realpath(), so symlinks can't point out of the sandbox.
 *   3. Secrets are denied by name even inside an allowed root.
 *   4. Read-only. There is no write, move or delete here by design.
 */

const MAX_READ_BYTES = 200_000;
const MAX_FIND_RESULTS = 50;
const MAX_DEPTH = 12;
/**
 * Whole-drive searches would otherwise run for minutes. The walk stops when
 * this elapses and returns whatever it found, which keeps chat responsive.
 */
const FIND_BUDGET_MS = 6_000;

/**
 * Directories never worth walking. Build output and caches are noise;
 * credential stores are skipped so a broad search can't surface them.
 */
const SKIP_DIRS = new Set([
  // Build output / caches
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "obj",
  "bin",
  ".cache",
  ".vscode",
  ".idea",
  "__pycache__",
  ".venv",
  "venv",
  // Credential stores
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  // Windows system noise — huge, and nothing a user asks about lives here
  "$recycle.bin",
  "system volume information",
  "windows",
  "winsxs",
  "programdata",
  "$windows.~ws",
  "$windows.~bt",
  "recovery",
  "perflogs",
  "appdata",
  "temp",
  "tmp",
]);

/**
 * Denied even inside an allowed root. Reading a file is enough to leak it,
 * so this list is about content, not convenience.
 */
const DENIED_PATTERNS = [
  /(^|[\\/])\.env($|\.)/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.git-credentials$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.(pem|key|pfx|p12|keystore|jks)$/i,
  /(^|[\\/])(credentials|secrets?)\.(json|ya?ml|toml|ini)$/i,
  /(^|[\\/])appsettings\.[^\\/]*\.json$/i,
  /(^|[\\/])\.pgpass$/i,
];

/** Extensions we're willing to return as text. */
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".rst", ".log",
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".csv", ".tsv",
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx",
  ".css", ".scss", ".less", ".html", ".htm", ".xml", ".svg",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cpp", ".hpp", ".cs", ".php",
  ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd",
  ".sql", ".graphql", ".prisma", ".proto",
  ".gitignore", ".editorconfig", ".dockerfile",
]);

/** Handled by extracting text rather than reading bytes directly. */
const PDF_EXTENSION = ".pdf";

export class FileAccessError extends Error {}

/**
 * Every drive on the machine. Used when PIXI_FILE_ROOTS is "*".
 * On Windows that means each mounted letter; elsewhere just "/".
 */
async function allDrives(): Promise<string[]> {
  if (process.platform !== "win32") return ["/"];

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const found = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`;
      try {
        await readdir(root);
        return root;
      } catch {
        return null;
      }
    })
  );

  return found.filter((value): value is string => value !== null);
}

/** Configured roots, already resolved. Empty means the feature is off. */
export async function allowedRoots(): Promise<string[]> {
  const raw = process.env.PIXI_FILE_ROOTS;
  if (!raw?.trim()) return [];

  // "*" means the whole machine.
  if (raw.trim() === "*") {
    return allDrives();
  }

  const entries = raw
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const roots: string[] = [];
  for (const entry of entries) {
    try {
      const resolved = await realpath(path.resolve(entry));
      const info = await stat(resolved);
      if (info.isDirectory()) roots.push(resolved);
    } catch {
      // A root that doesn't exist is skipped rather than fatal.
    }
  }
  return roots;
}

export async function fileAccessEnabled(): Promise<boolean> {
  return (await allowedRoots()).length > 0;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  // Empty means child === parent, which is allowed.
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isDenied(target: string): boolean {
  return DENIED_PATTERNS.some((pattern) => pattern.test(target));
}

/**
 * Resolves a caller-supplied path and proves it's inside the sandbox.
 * Throws rather than returning null so a missed check can't read through.
 */
async function resolveInsideSandbox(input: string): Promise<string> {
  const roots = await allowedRoots();
  if (roots.length === 0) {
    throw new FileAccessError(
      "File access is turned off. Set PIXI_FILE_ROOTS in frontend/.env.local to enable it."
    );
  }

  if (!input?.trim()) {
    throw new FileAccessError("No path given.");
  }

  // Accept an absolute path, or one relative to any root.
  const candidates = path.isAbsolute(input)
    ? [input]
    : roots.map((root) => path.join(root, input));

  for (const candidate of candidates) {
    let resolved: string;
    try {
      // realpath collapses .. and follows symlinks, so the check below sees
      // the true destination rather than the requested spelling.
      resolved = await realpath(path.resolve(candidate));
    } catch {
      continue;
    }

    if (!roots.some((root) => isInside(resolved, root))) continue;
    if (isDenied(resolved)) {
      throw new FileAccessError("That file is excluded for safety.");
    }
    return resolved;
  }

  throw new FileAccessError(
    "That path isn't inside a folder Pixi is allowed to read."
  );
}

export type FoundFile = {
  path: string;
  name: string;
  size: number;
  modified: string;
};

/**
 * Finds files whose name contains `queryText` (case-insensitive), walking
 * each root breadth-first so shallow matches surface before deep ones.
 */
export async function findFiles(
  queryText: string,
  limit = 20
): Promise<FoundFile[]> {
  const roots = await allowedRoots();
  if (roots.length === 0) {
    throw new FileAccessError(
      "File access is turned off. Set PIXI_FILE_ROOTS in frontend/.env.local to enable it."
    );
  }

  const needle = queryText.trim().toLowerCase();
  if (!needle) throw new FileAccessError("Give something to search for.");

  const cap = Math.min(Math.max(limit, 1), MAX_FIND_RESULTS);
  const results: FoundFile[] = [];
  const queue: { dir: string; depth: number }[] = roots.map((dir) => ({
    dir,
    depth: 0,
  }));
  const seen = new Set<string>();
  const deadline = Date.now() + FIND_BUDGET_MS;

  // Breadth-first, so shallow matches surface before the walk goes deep —
  // which matters when the root is a whole drive.
  while (queue.length > 0 && results.length < cap) {
    if (Date.now() > deadline) break;

    const { dir, depth } = queue.shift()!;
    const key = dir.toLowerCase();
    if (seen.has(key) || depth > MAX_DEPTH) continue;
    seen.add(key);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // Unreadable directory — skip rather than fail the search.
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const name = entry.name.toLowerCase();
        if (!SKIP_DIRS.has(name) && !entry.name.startsWith(".")) {
          queue.push({ dir: full, depth: depth + 1 });
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (isDenied(full)) continue;
      if (!entry.name.toLowerCase().includes(needle)) continue;

      try {
        const info = await stat(full);
        results.push({
          path: full,
          name: entry.name,
          size: info.size,
          modified: info.mtime.toISOString(),
        });
      } catch {
        continue;
      }

      if (results.length >= cap) break;
    }
  }

  return results;
}

export type FileContents = {
  path: string;
  size: number;
  truncated: boolean;
  content: string;
  /** Present for PDFs, so the caller can say how much was covered. */
  pages?: number;
};

/**
 * Pulls text out of a PDF. Scanned PDFs hold images rather than text, so an
 * empty result means "no text layer", not "empty document" — say so plainly
 * instead of returning a blank string.
 */
async function extractPdfText(
  buffer: Buffer,
  cap: number
): Promise<{ content: string; truncated: boolean; pages: number }> {
  // Imported lazily so the PDF engine only loads when one is actually read.
  const { extractText, getDocumentProxy } = await import("unpdf");

  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(doc, { mergePages: true });

  const merged = Array.isArray(text) ? text.join("\n\n") : text;
  const cleaned = merged.replace(/[ \t]+\n/g, "\n").trim();

  if (!cleaned) {
    throw new FileAccessError(
      "That PDF has no text layer — it's probably scanned images, which Pixi can't read."
    );
  }

  return {
    content: cleaned.slice(0, cap),
    truncated: cleaned.length > cap,
    pages: totalPages,
  };
}

export async function readTextFile(
  input: string,
  maxBytes = MAX_READ_BYTES
): Promise<FileContents> {
  const resolved = await resolveInsideSandbox(input);

  const info = await stat(resolved);
  if (!info.isFile()) {
    throw new FileAccessError("That path isn't a file.");
  }

  const ext = path.extname(resolved).toLowerCase();
  const name = path.basename(resolved).toLowerCase();
  const cap = Math.min(Math.max(maxBytes, 1), MAX_READ_BYTES);

  // PDFs are binary containers — extract their text layer instead of
  // reading bytes, so the NUL check below doesn't reject them.
  if (ext === PDF_EXTENSION) {
    const buffer = await readFile(resolved);
    const extracted = await extractPdfText(buffer, cap);
    return {
      path: resolved,
      size: info.size,
      truncated: extracted.truncated,
      content: extracted.content,
      pages: extracted.pages,
    };
  }

  if (ext && !TEXT_EXTENSIONS.has(ext) && !TEXT_EXTENSIONS.has(name)) {
    throw new FileAccessError(
      `Pixi reads text files and PDFs; ${ext} isn't one of them.`
    );
  }

  const buffer = await readFile(resolved);
  const slice = buffer.subarray(0, cap);

  // A NUL byte in the first chunk means this is binary regardless of suffix.
  if (slice.includes(0)) {
    throw new FileAccessError("That file looks binary, not text.");
  }

  return {
    path: resolved,
    size: info.size,
    truncated: buffer.length > cap,
    content: slice.toString("utf8"),
  };
}
