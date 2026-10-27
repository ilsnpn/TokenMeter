// Converts a Gemini CLI chat (~/.gemini/tmp/<project>/chats/session-*.json) into the
// Claude Code JSONL shape the reader already understands, like codex.ts does for Codex.

import { cwdToProjectId, type ConvertedSession } from './codex';

interface GeminiTokens {
  input?: number;
  output?: number;
  cached?: number;
  thoughts?: number;
  tool?: number;
}

interface GeminiToolCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

interface GeminiMessage {
  id?: string;
  timestamp?: string;
  type?: string;
  content?: unknown;
  model?: string;
  tokens?: GeminiTokens;
  toolCalls?: GeminiToolCall[];
}

const shellTools = new Set(['run_shell_command', 'shell']);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(c => (typeof c === 'string' ? c : typeof c?.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** Older Gemini CLI versions name project folders by a SHA-256 of the path, which can't be reversed. */
export function geminiProjectLabel(dir: string): string {
  return /^[0-9a-f]{64}$/.test(dir) ? `Gemini ${dir.slice(0, 8)}` : dir;
}

/** `cwd` is the project path when known (newer CLIs write tmp/<project>/.project_root). */
export function convertGeminiChat(raw: string, cwd: string): ConvertedSession | null {
  let chat: { sessionId?: string; messages?: GeminiMessage[] };
  try { chat = JSON.parse(raw); } catch { return null; }
  const sessionId = String(chat.sessionId || '');
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  if (!sessionId || !messages.length) return null;

  const out: Record<string, unknown>[] = [];
  for (const m of messages) {
    const base = { sessionId, timestamp: m.timestamp || '', cwd, version: '', gitBranch: '', uuid: m.id || `${sessionId}-${out.length}`, parentUuid: null };
    const text = textOf(m.content);

    if (m.type === 'user') {
      if (text.trim()) out.push({ ...base, type: 'user', message: { role: 'user', content: text } });
      continue;
    }
    if (m.type !== 'gemini') continue;

    const content: unknown[] = text.trim() ? [{ type: 'text', text }] : [];
    for (const call of m.toolCalls || []) {
      const name = String(call.name || 'tool');
      const args = call.args || {};
      // write_file and replace already use Claude's Write/Edit argument names.
      const input = shellTools.has(name) ? { shell: true } : name === 'write_file' || name === 'replace' ? args : {};
      content.push({ type: 'tool_use', id: String(call.id || ''), name, input });
    }

    const t = m.tokens || {};
    const cached = t.cached || 0;
    // Gemini's prompt count includes cached tokens; thinking is billed as output.
    const usage = m.tokens
      ? {
          input_tokens: Math.max(0, (t.input || 0) + (t.tool || 0) - cached),
          output_tokens: (t.output || 0) + (t.thoughts || 0),
          cache_read_input_tokens: cached,
          cache_creation_input_tokens: 0,
        }
      : undefined;
    out.push({ ...base, type: 'assistant', message: { role: 'assistant', model: m.model || 'gemini', content, usage } });
  }

  if (!out.length) return null;
  return {
    projectId: cwdToProjectId(cwd),
    sessionId,
    text: out.map(e => JSON.stringify(e)).join('\n'),
  };
}
