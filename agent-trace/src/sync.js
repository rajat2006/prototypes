import { scanClaude } from "./adapters/claude.js";
import { scanCodex } from "./adapters/codex.js";
import { writeStore } from "./store.js";

export async function syncSessions() {
  const started = Date.now();
  const [claudeSessions, codexResult] = await Promise.all([scanClaude(), scanCodex()]);
  const sessions = [...claudeSessions, ...codexResult.sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const stats = {
    sessionCount: sessions.length,
    claudeCount: claudeSessions.length,
    codexCount: codexResult.sessions.length,
    eventCount: sessions.reduce((sum, session) => sum + session.eventCount, 0),
    subagentCount: sessions.filter((session) => session.isSubagent).length,
    syncDurationMs: Date.now() - started,
    codexSpawnEdges: codexResult.spawnEdges.length
  };

  const store = {
    version: 1,
    lastSyncedAt: new Date().toISOString(),
    sessions,
    codex: {
      indexRows: codexResult.indexRows,
      spawnEdges: codexResult.spawnEdges
    },
    stats
  };

  await writeStore(store);
  return store;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncSessions()
    .then((store) => {
      console.log(
        `Synced ${store.stats.sessionCount} sessions (${store.stats.claudeCount} Claude, ${store.stats.codexCount} Codex) with ${store.stats.eventCount} events.`
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
