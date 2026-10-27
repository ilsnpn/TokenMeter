// Converts an OpenAI Codex rollout (~/.codex/sessions/**/rollout-*.jsonl) into the
// Claude Code JSONL shape the reader already understands, so every page works unchanged.

interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface ContentItem { type?: string; text?: string }

export interface ConvertedSession {
  projectId: string;
  sessionId: string;
  text: string;
}

/** Codex injects context blocks as "user" messages; they are not things the user typed. */
const INJECTED = /^\s*<(environment_context|user_instructions|permissions instructions|turn_aborted|user_shell_command|collaboration_mode)|^\s*# AGENTS\.md/;

/** Claude Code names project folders by replacing every non-alphanumeric char of the cwd. */
export function cwdToProjectId(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

const shellTools = new Set(['shell', 'shell_command', 'exec_command', 'local_shell', 'unified_exec']);

/** Turns an apply_patch body into per-file edits so line counts work like Claude's Edit tool. */
function parsePatch(patch: string) {
  const edits: { file_path: string; old_string: string; new_string: string }[] = [];
  let cur: { file_path: string; old: string[]; add: string[] } | null = null;
  const flush = () => {
    if (cur) edits.push({ file_path: cur.file_path, old_string: cur.old.join('\n'), new_string: cur.add.join('\n') });
  };
  for (const line of patch.split(/\r?\n/)) {
    const file = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
    if (file) {
      flush();
      cur = { file_path: file[1].trim(), old: [], add: [] };
    } else if (cur && line.startsWith('+')) cur.add.push(line.slice(1));
    else if (cur && line.startsWith('-')) cur.old.push(line.slice(1));
  }
  flush();
  return edits;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as ContentItem[])
    .filter(c => c && typeof c.text === 'string')
    .map(c => c.text)
    .join('\n');
}

export function convertCodexRollout(raw: string): ConvertedSession | null {
  const out: Record<string, unknown>[] = [];
  let sessionId = '';
  let cwd = '';
  let version = '';
  let gitBranch = '';
  let model = '';
  let prevTotal = -1;
  let lastAssistant: Record<string, unknown> | null = null;

  const base = (timestamp: string) => ({ sessionId, timestamp, cwd, version, gitBranch, uuid: `${sessionId}-${out.length}`, parentUuid: null });

  const assistant = (timestamp: string, content: unknown[]) => {
    const entry = { ...base(timestamp), type: 'assistant', message: { role: 'assistant', model, content } };
    out.push(entry);
    lastAssistant = entry;
    return entry;
  };

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o: { type?: string; timestamp?: string; payload?: Record<string, unknown> };
    try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload || {};
    const ts = o.timestamp || '';

    if (o.type === 'session_meta') {
      if (sessionId) continue; // forked sessions repeat their parent's meta; keep the first
      sessionId = String(p.id || '');
      cwd = String(p.cwd || '').replace(/\\/g, '/');
      version = String(p.cli_version || '');
      const git = p.git as { branch?: string } | undefined;
      gitBranch = git?.branch || '';
      continue;
    }
    if (o.type === 'turn_context') {
      if (typeof p.model === 'string') model = p.model;
      if (!cwd && typeof p.cwd === 'string') cwd = p.cwd.replace(/\\/g, '/');
      continue;
    }
    if (o.type === 'compacted' || (o.type === 'response_item' && p.type === 'compaction')) {
      out.push({ ...base(ts), type: 'system', compactMetadata: { trigger: 'auto', preTokens: 0 } });
      continue;
    }

    if (o.type === 'event_msg' && p.type === 'token_count') {
      const info = p.info as { total_token_usage?: CodexUsage; last_token_usage?: CodexUsage } | null;
      const last = info?.last_token_usage;
      const total = info?.total_token_usage?.total_tokens ?? -1;
      // Codex repeats token_count events; only a moving total means a new model call.
      if (!last || total === prevTotal) continue;
      prevTotal = total;
      const cached = last.cached_input_tokens || 0;
      const usage = {
        input_tokens: Math.max(0, (last.input_tokens || 0) - cached),
        output_tokens: last.output_tokens || 0,
        cache_read_input_tokens: cached,
        cache_creation_input_tokens: last.cache_write_input_tokens || 0,
      };
      const target = (lastAssistant || assistant(ts, [])) as { message: { usage?: typeof usage } };
      const prev = target.message.usage;
      target.message.usage = prev
        ? {
            input_tokens: prev.input_tokens + usage.input_tokens,
            output_tokens: prev.output_tokens + usage.output_tokens,
            cache_read_input_tokens: prev.cache_read_input_tokens + usage.cache_read_input_tokens,
            cache_creation_input_tokens: prev.cache_creation_input_tokens + usage.cache_creation_input_tokens,
          }
        : usage;
      // Next model call gets its own entry.
      lastAssistant = null;
      continue;
    }

    if (o.type !== 'response_item') continue;

    if (p.type === 'message') {
      const text = textOf(p.content);
      if (p.role === 'user') {
        if (!text.trim() || INJECTED.test(text)) continue;
        out.push({ ...base(ts), type: 'user', message: { role: 'user', content: text } });
        lastAssistant = null;
      } else if (p.role === 'assistant' && text.trim()) {
        if (lastAssistant) (lastAssistant as { message: { content: unknown[] } }).message.content.push({ type: 'text', text });
        else assistant(ts, [{ type: 'text', text }]);
      }
      continue;
    }

    if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'web_search_call' || p.type === 'local_shell_call') {
      const name = p.type === 'web_search_call' ? 'web_search' : String(p.name || p.type);
      let input: Record<string, unknown> = {};
      if (name === 'apply_patch') {
        const patch = typeof p.input === 'string' ? p.input : '';
        input = { edits: parsePatch(patch) };
      } else if (shellTools.has(name) || p.type === 'local_shell_call') {
        input = { shell: true };
      }
      const tool = { type: 'tool_use', id: String(p.call_id || p.id || ''), name, input };
      if (lastAssistant) (lastAssistant as { message: { content: unknown[] } }).message.content.push(tool);
      else assistant(ts, [tool]);
    }
  }

  if (!sessionId || !out.length) return null;
  return {
    projectId: cwdToProjectId(cwd || 'codex'),
    sessionId,
    text: out.map(e => JSON.stringify(e)).join('\n'),
  };
}
