// In-memory stand-ins for the few fs/path/os/readline calls the reader makes.
// Everything lives in this browser tab: nothing is uploaded or persisted.

import { convertCodexRollout } from './codex';
import { convertGeminiChat, geminiProjectLabel } from './gemini';

export const CLAUDE_ROOT = '/claude';

interface VFile {
  text: string;
  mtimeMs: number;
}

const files = new Map<string, VFile>();
const dirs = new Set<string>([CLAUDE_ROOT]);
let version = 0;
const listeners = new Set<() => void>();

// Only what the dashboard reads; credentials and settings are never touched.
const KEEP = /(?:^|\/)((?:projects|plans|todos)\/.+|stats-cache\.json|history\.jsonl)$/;

// Codex rollouts, converted to Claude's format on load (auth.json and the rest are skipped).
const CODEX = /(?:^|\/)(?:archived_)?sessions\/(?:[^/]+\/)*(rollout-[^/]+\.jsonl)$/;
const CODEX_PREFIX = 'codex/';

// Gemini CLI chats, and the file newer versions keep next to them with the project path.
// (Antigravity's conversations are binary databases and are not read.)
const GEMINI = /(?:^|\/)tmp\/([^/]+)\/(chats\/session-[^/]+\.json|\.project_root)$/;
const GEMINI_PREFIX = 'gemini/';

/** Maps an arbitrary picked/zipped path to its path inside .claude, or null to skip it. */
export function toClaudePath(rawPath: string): string | null {
  const p = rawPath.replace(/\\/g, '/');
  const m = p.match(KEEP);
  if (m) return m[1];
  const c = p.match(CODEX);
  if (c) return CODEX_PREFIX + c[1];
  const g = p.match(GEMINI);
  return g ? `${GEMINI_PREFIX}${g[1]}/${g[2]}` : null;
}

export interface LoadInput {
  path: string; // relative to .claude, e.g. "projects/foo/123.jsonl"
  size: number;
  mtimeMs: number;
  read: () => Promise<string>;
}

export async function loadFiles(inputs: LoadInput[], onProgress: (done: number, total: number) => void) {
  files.clear();
  dirs.clear();
  dirs.add(CLAUDE_ROOT);
  const total = inputs.reduce((s, f) => s + f.size, 0) || 1;
  let done = 0;
  let painted = performance.now();

  // Project paths first, so every Gemini chat knows its project; chats in name (= time) order,
  // since a resumed session continues in a new file under the same id.
  const geminiRoots = new Map<string, string>();
  for (const input of inputs) {
    const root = input.path.match(/^gemini\/([^/]+)\/\.project_root$/);
    if (root) geminiRoots.set(root[1], (await input.read()).trim().replace(/\\/g, '/'));
  }
  const isGemini = (i: LoadInput) => i.path.startsWith(GEMINI_PREFIX);
  inputs = [
    ...inputs.filter(i => !isGemini(i)),
    ...inputs.filter(isGemini).sort((a, b) => a.path.localeCompare(b.path)),
  ];

  for (const input of inputs) {
    // Let the browser repaint now and then, or the progress ruler never moves on screen.
    if (performance.now() - painted > 50) {
      await new Promise(r => setTimeout(r, 0));
      painted = performance.now();
    }
    let full = `${CLAUDE_ROOT}/${input.path}`;
    let text = await input.read();
    if (input.path.startsWith(CODEX_PREFIX)) {
      const session = convertCodexRollout(text);
      if (!session) { done += input.size; onProgress(done, total); continue; }
      full = `${CLAUDE_ROOT}/projects/${session.projectId}/${session.sessionId}.jsonl`;
      text = session.text;
    } else if (input.path.startsWith(GEMINI_PREFIX)) {
      const dir = input.path.split('/')[1];
      const session = input.path.endsWith('.project_root')
        ? null
        : convertGeminiChat(text, geminiRoots.get(dir) || geminiProjectLabel(dir));
      if (!session) { done += input.size; onProgress(done, total); continue; }
      full = `${CLAUDE_ROOT}/projects/${session.projectId}/${session.sessionId}.jsonl`;
      const previous = files.get(full);
      text = previous ? `${previous.text}
${session.text}` : session.text;
    }
    files.set(full, { text, mtimeMs: input.mtimeMs });
    for (let d = path.dirname(full); d.length > CLAUDE_ROOT.length; d = path.dirname(d)) dirs.add(d);
    done += input.size;
    onProgress(done, total);
  }
  version++;
  listeners.forEach(l => l());
}

export function clearFiles() {
  files.clear();
  dirs.clear();
  dirs.add(CLAUDE_ROOT);
  version = 0;
  listeners.forEach(l => l());
}

export function getVersion() {
  return version;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const path = {
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
  dirname: (p: string) => p.slice(0, p.lastIndexOf('/')) || '/',
  basename: (p: string, ext?: string) => {
    const base = p.slice(p.lastIndexOf('/') + 1);
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
  },
};

export const os = {
  homedir: () => '/',
};

function stat(p: string) {
  const f = files.get(p);
  if (!f && !dirs.has(p)) throw new Error(`ENOENT: ${p}`);
  const mtimeMs = f?.mtimeMs ?? 0;
  return { isDirectory: () => !f, mtimeMs, mtime: new Date(mtimeMs), size: f?.text.length ?? 0 };
}

export const fs = {
  existsSync: (p: string) => files.has(p) || dirs.has(p),
  statSync: stat,
  readFileSync: (p: string, _enc?: string) => {
    const f = files.get(p);
    if (!f) throw new Error(`ENOENT: ${p}`);
    return f.text;
  },
  readdirSync: (p: string) => {
    const prefix = p + '/';
    const names = new Set<string>();
    for (const key of [...files.keys(), ...dirs]) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
    }
    return [...names];
  },
  createReadStream: (p: string) => fs.readFileSync(p),
};

export const readline = {
  createInterface: ({ input }: { input: string; crlfDelay?: number }) => ({
    async *[Symbol.asyncIterator]() {
      for (const line of input.split(/\r?\n/)) yield line;
    },
  }),
};
