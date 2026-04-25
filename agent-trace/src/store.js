import fs from "node:fs/promises";
import { DATA_DIR, DB_PATH } from "./paths.js";
import { ensureDir, pathExists } from "./utils.js";

export async function readStore() {
  if (!(await pathExists(DB_PATH))) {
    return {
      version: 1,
      lastSyncedAt: null,
      sessions: [],
      stats: {}
    };
  }

  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

export async function writeStore(store) {
  await ensureDir(DATA_DIR);
  await fs.writeFile(DB_PATH, JSON.stringify(store, null, 2));
}
