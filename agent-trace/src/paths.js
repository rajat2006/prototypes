import os from "node:os";
import path from "node:path";

export const HOME = os.homedir();
export const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const DB_PATH = path.join(DATA_DIR, "agent-trace.json");

export const CLAUDE_PROJECTS_DIR = path.join(HOME, ".claude", "projects");
export const CODEX_DIR = path.join(HOME, ".codex");
export const CODEX_SESSIONS_DIR = path.join(CODEX_DIR, "sessions");
export const CODEX_SESSION_INDEX_PATH = path.join(CODEX_DIR, "session_index.jsonl");
export const CODEX_STATE_DB_PATH = path.join(CODEX_DIR, "state_5.sqlite");
