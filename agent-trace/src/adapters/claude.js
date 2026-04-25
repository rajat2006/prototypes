import fs from "node:fs/promises";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR } from "../paths.js";
import {
  contentText,
  fileMtimeMs,
  inferProjectFromClaudePath,
  readJsonl,
  redactText,
  safeSnippet,
  stableId,
  walkFiles
} from "../utils.js";

function claudeTitle(events, filePath) {
  const firstUser = events.find((event) => event.type === "user" && event.message);
  const text = contentText(firstUser?.message?.content);
  if (text) return redactText(text, 70);
  return path.basename(filePath, ".jsonl");
}

function eventKind(event) {
  if (event.type === "assistant") {
    const content = event.message?.content;
    const types = Array.isArray(content) ? content.map((block) => block?.type).filter(Boolean) : [];
    if (types.includes("tool_use")) return "tool-call";
    if (types.includes("thinking")) return "thinking";
    return "assistant-message";
  }

  if (event.type === "user") {
    const content = event.message?.content;
    const types = Array.isArray(content) ? content.map((block) => block?.type).filter(Boolean) : [];
    if (types.includes("tool_result") || event.toolUseResult) return "tool-result";
    return event.isMeta ? "system" : "user-message";
  }

  if (event.type === "system") return "system";
  if (event.type === "attachment") return "attachment";
  if (event.type === "file-history-snapshot") return "file-change";
  if (event.type === "queue-operation") return "queue";
  if (event.type === "permission-mode") return "permission";
  if (event.type === "parse-error") return "error";
  return "event";
}

function eventLabel(event) {
  const kind = eventKind(event);
  if (kind === "tool-call") {
    const tool = event.message.content.find((block) => block?.type === "tool_use");
    return `${tool?.name || "Tool"} call`;
  }
  if (kind === "tool-result") return "Tool result";
  if (kind === "user-message") return "User prompt";
  if (kind === "assistant-message") return "Assistant response";
  if (kind === "thinking") return "Thinking block";
  if (kind === "file-change") return "File snapshot";
  if (kind === "permission") return `Permission: ${event.permissionMode || "changed"}`;
  if (kind === "queue") return `Queue ${event.operation || "operation"}`;
  if (kind === "system") return event.subtype || "System event";
  return event.type || "Event";
}

function eventSummary(event) {
  if (event.message?.content) return redactText(contentText(event.message.content));
  if (event.toolUseResult) return redactText(event.toolUseResult);
  if (event.attachment) return redactText(event.attachment);
  if (event.snapshot) return "File history snapshot captured";
  if (event.error) return event.error;
  return safeSnippet(event, 160);
}

function extractToolName(event) {
  if (!event.message?.content || !Array.isArray(event.message.content)) return null;
  const tool = event.message.content.find((block) => block?.type === "tool_use");
  return tool?.name || null;
}

export async function scanClaude() {
  const files = await walkFiles(CLAUDE_PROJECTS_DIR, (file) => file.endsWith(".jsonl"));
  const sessions = [];

  for (const filePath of files) {
    const stat = await fs.stat(filePath);
    const events = await readJsonl(filePath);
    const sessionId =
      events.find((event) => event.sessionId)?.sessionId || path.basename(filePath, ".jsonl");
    const isSubagent = filePath.includes(`${path.sep}subagents${path.sep}`);
    const project = inferProjectFromClaudePath(filePath);
    const firstTimestamp = events.find((event) => event.timestamp)?.timestamp;
    const lastTimestamp = [...events].reverse().find((event) => event.timestamp)?.timestamp;
    const cwd = events.find((event) => event.cwd)?.cwd || project;

    const timeline = events.map((event, index) => ({
      id: event.uuid || stableId("claude", sessionId, index),
      index,
      parentId: event.parentUuid || null,
      timestamp: event.timestamp || null,
      kind: eventKind(event),
      label: eventLabel(event),
      summary: eventSummary(event),
      role: event.message?.role || event.type || null,
      toolName: extractToolName(event),
      raw: event
    }));

    sessions.push({
      id: stableId("claude", sessionId, filePath),
      harness: "claude",
      sessionId,
      title: claudeTitle(events, filePath),
      project,
      cwd,
      sourcePath: filePath,
      isSubagent,
      startedAt: firstTimestamp || new Date(stat.birthtimeMs).toISOString(),
      updatedAt: lastTimestamp || new Date(fileMtimeMs(stat)).toISOString(),
      eventCount: timeline.length,
      timeline,
      edges: timeline
        .filter((event) => event.parentId)
        .map((event) => ({ from: event.parentId, to: event.id, type: "parent" })),
      stats: summarizeTimeline(timeline)
    });
  }

  return sessions;
}

function summarizeTimeline(timeline) {
  const stats = {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolResults: 0,
    errors: 0,
    fileChanges: 0
  };

  for (const event of timeline) {
    if (event.kind === "user-message") stats.userMessages += 1;
    if (event.kind === "assistant-message") stats.assistantMessages += 1;
    if (event.kind === "tool-call") stats.toolCalls += 1;
    if (event.kind === "tool-result") stats.toolResults += 1;
    if (event.kind === "error") stats.errors += 1;
    if (event.kind === "file-change") stats.fileChanges += 1;
  }

  return stats;
}
