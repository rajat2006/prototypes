import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CODEX_SESSION_INDEX_PATH,
  CODEX_SESSIONS_DIR,
  CODEX_STATE_DB_PATH
} from "../paths.js";
import {
  fileMtimeMs,
  pathExists,
  readJsonl,
  redactText,
  safeSnippet,
  stableId,
  walkFiles
} from "../utils.js";

const execFileAsync = promisify(execFile);

async function readCodexThreads() {
  if (!(await pathExists(CODEX_STATE_DB_PATH))) return new Map();
  try {
    const { stdout } = await execFileAsync("sqlite3", [
      "-json",
      CODEX_STATE_DB_PATH,
      "select id, rollout_path, cwd, title, source, model_provider, model, reasoning_effort, created_at_ms, updated_at_ms from threads"
    ]);
    const rows = stdout.trim() ? JSON.parse(stdout) : [];
    return new Map(rows.map((row) => [row.rollout_path, row]));
  } catch {
    return new Map();
  }
}

async function readCodexSpawnEdges() {
  if (!(await pathExists(CODEX_STATE_DB_PATH))) return [];
  try {
    const { stdout } = await execFileAsync("sqlite3", [
      "-json",
      CODEX_STATE_DB_PATH,
      "select parent_thread_id, child_thread_id, status from thread_spawn_edges"
    ]);
    return stdout.trim() ? JSON.parse(stdout) : [];
  } catch {
    return [];
  }
}

async function readSessionIndex() {
  if (!(await pathExists(CODEX_SESSION_INDEX_PATH))) return [];
  return readJsonl(CODEX_SESSION_INDEX_PATH);
}

function codexPayloadType(row) {
  return row.payload?.type || row.type || "event";
}

function eventKind(row) {
  const type = codexPayloadType(row);
  if (type === "user_message") return "user-message";
  if (type === "agent_message") return "assistant-message";
  if (type === "message") return `${row.payload?.role || "message"}-message`;
  if (type === "function_call") return "tool-call";
  if (type === "function_call_output") return "tool-result";
  if (type === "exec_command_end") return row.payload?.exit_code === 0 ? "command" : "error";
  if (type === "web_search_call" || type === "web_search_end") return "web-search";
  if (type === "reasoning") return "reasoning";
  if (type === "task_started") return "turn-start";
  if (type === "task_complete") return "turn-complete";
  if (type === "turn_context") return "turn-context";
  if (type === "session_meta") return "session";
  if (type === "token_count") return "usage";
  return "event";
}

function eventLabel(row) {
  const type = codexPayloadType(row);
  const payload = row.payload || {};
  if (type === "function_call") return `${payload.name || "Tool"} call`;
  if (type === "function_call_output") return "Tool result";
  if (type === "exec_command_end") return `Command ${payload.status || payload.exit_code}`;
  if (type === "web_search_call") return "Web search";
  if (type === "web_search_end") return "Web search result";
  if (type === "task_started") return "Turn started";
  if (type === "task_complete") return "Turn completed";
  if (type === "agent_message") return "Assistant update";
  if (type === "user_message") return "User prompt";
  if (type === "reasoning") return "Reasoning summary";
  if (type === "token_count") return "Token count";
  return type;
}

function eventSummary(row) {
  const payload = row.payload || {};
  const type = codexPayloadType(row);
  if (payload.message) return redactText(payload.message);
  if (type === "message") return redactText(payload.content);
  if (type === "function_call") return redactText(payload.arguments);
  if (type === "function_call_output") return "Tool output captured";
  if (type === "exec_command_end") {
    const command = Array.isArray(payload.command) ? payload.command.join(" ") : payload.command;
    return redactText(command || payload.formatted_output || payload.aggregated_output);
  }
  if (type === "web_search_end") return redactText(payload.query || payload.action);
  if (type === "task_complete") return `Completed in ${payload.duration_ms || "?"}ms`;
  if (type === "token_count") return safeSnippet(payload.info || payload.rate_limits, 140);
  return safeSnippet(payload, 160);
}

function extractSessionMeta(events, filePath, thread) {
  const meta = events.find((event) => event.type === "session_meta")?.payload || {};
  const context = events.find((event) => event.type === "turn_context")?.payload || {};
  const firstUser = events.find((event) => event.payload?.type === "user_message")?.payload?.message;
  const statTitle = thread?.title || redactText(firstUser, 70) || path.basename(filePath, ".jsonl");

  return {
    sessionId: meta.id || thread?.id || path.basename(filePath, ".jsonl"),
    title: statTitle,
    cwd: meta.cwd || thread?.cwd || context.cwd || "",
    model: context.model || thread?.model || "",
    reasoningEffort: context.effort || thread?.reasoning_effort || "",
    source: meta.source || thread?.source || "codex"
  };
}

export async function scanCodex() {
  const files = await walkFiles(CODEX_SESSIONS_DIR, (file) => file.endsWith(".jsonl"));
  const threadByRollout = await readCodexThreads();
  const indexRows = await readSessionIndex();
  const spawnEdges = await readCodexSpawnEdges();
  const sessions = [];

  for (const filePath of files) {
    const stat = await fs.stat(filePath);
    const events = await readJsonl(filePath);
    const thread = threadByRollout.get(filePath) || threadByRollout.get(path.relative(path.dirname(CODEX_SESSIONS_DIR), filePath));
    const meta = extractSessionMeta(events, filePath, thread);
    const firstTimestamp = events.find((event) => event.timestamp)?.timestamp;
    const lastTimestamp = [...events].reverse().find((event) => event.timestamp)?.timestamp;

    const timeline = events.map((row, index) => {
      const payload = row.payload || {};
      return {
        id: stableId("codex", meta.sessionId, payload.call_id || payload.turn_id || index),
        index,
        parentId: payload.turn_id || null,
        timestamp: row.timestamp || payload.started_at || payload.completed_at || null,
        kind: eventKind(row),
        label: eventLabel(row),
        summary: eventSummary(row),
        role: payload.role || null,
        turnId: payload.turn_id || null,
        callId: payload.call_id || null,
        toolName: payload.name || payload.type || null,
        raw: row
      };
    });

    sessions.push({
      id: stableId("codex", meta.sessionId, filePath),
      harness: "codex",
      sessionId: meta.sessionId,
      title: meta.title,
      project: meta.cwd || "unknown",
      cwd: meta.cwd,
      sourcePath: filePath,
      isSubagent: false,
      startedAt:
        firstTimestamp ||
        (thread?.created_at_ms ? new Date(thread.created_at_ms).toISOString() : new Date(stat.birthtimeMs).toISOString()),
      updatedAt:
        lastTimestamp ||
        (thread?.updated_at_ms ? new Date(thread.updated_at_ms).toISOString() : new Date(fileMtimeMs(stat)).toISOString()),
      model: meta.model,
      reasoningEffort: meta.reasoningEffort,
      eventCount: timeline.length,
      timeline,
      edges: buildCodexEdges(timeline),
      stats: summarizeTimeline(timeline)
    });
  }

  return {
    sessions,
    indexRows,
    spawnEdges
  };
}

function buildCodexEdges(timeline) {
  const edges = [];
  const byCall = new Map();
  for (const event of timeline) {
    if (event.callId && !byCall.has(event.callId)) byCall.set(event.callId, event.id);
    if (event.callId && byCall.get(event.callId) !== event.id) {
      edges.push({ from: byCall.get(event.callId), to: event.id, type: "tool-result" });
    }
  }
  for (let index = 1; index < timeline.length; index += 1) {
    edges.push({ from: timeline[index - 1].id, to: timeline[index].id, type: "next" });
  }
  return edges;
}

function summarizeTimeline(timeline) {
  const stats = {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolResults: 0,
    errors: 0,
    webSearches: 0,
    commands: 0,
    turns: 0
  };

  for (const event of timeline) {
    if (event.kind === "user-message") stats.userMessages += 1;
    if (event.kind === "assistant-message") stats.assistantMessages += 1;
    if (event.kind === "tool-call") stats.toolCalls += 1;
    if (event.kind === "tool-result") stats.toolResults += 1;
    if (event.kind === "error") stats.errors += 1;
    if (event.kind === "web-search") stats.webSearches += 1;
    if (event.kind === "command") stats.commands += 1;
    if (event.kind === "turn-start") stats.turns += 1;
  }

  return stats;
}
