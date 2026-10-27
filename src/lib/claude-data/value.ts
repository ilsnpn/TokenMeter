import { calculateCostAllModes } from '@/config/pricing';
import { fs, path, readline, CLAUDE_ROOT } from './vfs';
import type { SessionMessage } from './types';

export interface MonthValue {
  month: string; // YYYY-MM
  apiCost: number;
  sessions: number;
  messages: number;
  linesWritten: number;
}

export interface ValueStats {
  apiCost: number;
  linesWritten: number;
  linesRemoved: number;
  filesTouched: number;
  commandsRun: number;
  toolCalls: number;
  sessions: number;
  activeDays: number;
  activeMonths: number;
  activeHours: number; // time actually spent with Claude (gaps over 30 min ignored)
  firstDate: string;
  lastDate: string;
  months: MonthValue[];
}

const countLines = (s: unknown) => (typeof s === 'string' && s ? s.split('\n').length : 0);

interface ToolUse { type: 'tool_use'; name: string; input?: Record<string, unknown> }

export async function getValueStats(): Promise<ValueStats> {
  const projectsDir = path.join(CLAUDE_ROOT, 'projects');
  const months = new Map<string, MonthValue & { sessionIds: Set<string> }>();
  const files = new Set<string>();
  const days = new Set<string>();
  const sessions = new Set<string>();
  let apiCost = 0, linesWritten = 0, linesRemoved = 0, commandsRun = 0, toolCalls = 0;
  let firstDate = '', lastDate = '';
  let activeMs = 0;
  const lastSeen = new Map<string, number>();
  const IDLE_MS = 30 * 60_000;

  const monthOf = (ts: string) => {
    const key = ts.slice(0, 7);
    let m = months.get(key);
    if (!m) {
      m = { month: key, apiCost: 0, sessions: 0, messages: 0, linesWritten: 0, sessionIds: new Set() };
      months.set(key, m);
    }
    return m;
  };

  if (!fs.existsSync(projectsDir)) return emptyStats();

  for (const entry of fs.readdirSync(projectsDir)) {
    const projectPath = path.join(projectsDir, entry);
    if (!fs.statSync(projectPath).isDirectory()) continue;
    for (const file of fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'))) {
      const rl = readline.createInterface({ input: fs.createReadStream(path.join(projectPath, file)) });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let msg: SessionMessage;
        try { msg = JSON.parse(line); } catch { continue; }
        if (!msg.timestamp) continue;

        const m = monthOf(msg.timestamp);
        const day = msg.timestamp.slice(0, 10);
        days.add(day);
        if (!firstDate || day < firstDate) firstDate = day;
        if (day > lastDate) lastDate = day;
        if (msg.sessionId) {
          const t = Date.parse(msg.timestamp);
          const prev = lastSeen.get(msg.sessionId);
          if (prev !== undefined && t > prev && t - prev <= IDLE_MS) activeMs += t - prev;
          lastSeen.set(msg.sessionId, t);
          sessions.add(msg.sessionId);
          m.sessionIds.add(msg.sessionId);
        }

        if (msg.type === 'user' && msg.message?.role === 'user') m.messages++;
        if (msg.type !== 'assistant') continue;

        const usage = msg.message?.usage;
        if (usage) {
          const cost = calculateCostAllModes(
            msg.message?.model || '',
            usage.input_tokens || 0,
            usage.output_tokens || 0,
            usage.cache_creation_input_tokens || 0,
            usage.cache_read_input_tokens || 0,
          ).api;
          apiCost += cost;
          m.apiCost += cost;
        }

        const content = msg.message?.content;
        if (!Array.isArray(content)) continue;
        for (const c of content as ToolUse[]) {
          if (c?.type !== 'tool_use') continue;
          toolCalls++;
          const input = c.input || {};
          if (typeof input.file_path === 'string') files.add(input.file_path);
          let added = 0;
          if (c.name === 'Write' || c.name === 'write_file') added = countLines(input.content);
          if (c.name === 'Edit' || c.name === 'replace') {
            added = countLines(input.new_string);
            linesRemoved += countLines(input.old_string);
          }
          if ((c.name === 'MultiEdit' || c.name === 'apply_patch') && Array.isArray(input.edits)) {
            for (const e of input.edits as Record<string, unknown>[]) {
              if (typeof e.file_path === 'string') files.add(e.file_path);
              added += countLines(e.new_string);
              linesRemoved += countLines(e.old_string);
            }
          }
          if (c.name === 'Bash' || input.shell) commandsRun++;
          linesWritten += added;
          m.linesWritten += added;
        }
      }
    }
  }

  const monthList = [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ sessionIds, ...rest }) => ({ ...rest, sessions: sessionIds.size }));

  return {
    apiCost, linesWritten, linesRemoved, commandsRun, toolCalls,
    filesTouched: files.size,
    sessions: sessions.size,
    activeDays: days.size,
    activeMonths: monthList.length,
    activeHours: activeMs / 3_600_000,
    firstDate, lastDate,
    months: monthList,
  };
}

function emptyStats(): ValueStats {
  return {
    apiCost: 0, linesWritten: 0, linesRemoved: 0, filesTouched: 0, commandsRun: 0, toolCalls: 0,
    sessions: 0, activeDays: 0, activeMonths: 0, activeHours: 0, firstDate: '', lastDate: '', months: [],
  };
}
