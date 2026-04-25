import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { PROJECT_ROOT } from "./paths.js";
import { readStore } from "./store.js";
import { syncSessions } from "./sync.js";

const PORT = Number(process.env.PORT || 4321);
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function summarizeEvent(event) {
  if (!event) return event;
  const { raw, ...summary } = event;
  return summary;
}

function summarizeSession(session) {
  const { timeline, edges, ...summary } = session;
  return {
    ...summary,
    timelinePreview: timeline?.slice(0, 6).map(summarizeEvent) || []
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function sendStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream"
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/sessions") {
      const store = await readStore();
      sendJson(res, 200, {
        lastSyncedAt: store.lastSyncedAt,
        stats: store.stats,
        sessions: store.sessions.map(summarizeSession)
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/sessions/", ""));
      const store = await readStore();
      const session = store.sessions.find((candidate) => candidate.id === id);
      if (!session) {
        sendJson(res, 404, { error: "Session not found" });
        return;
      }
      sendJson(res, 200, session);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/sync") {
      const store = await syncSessions();
      sendJson(res, 200, {
        lastSyncedAt: store.lastSyncedAt,
        stats: store.stats,
        sessions: store.sessions.map(summarizeSession)
      });
      return;
    }

    await sendStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message, stack: error.stack });
  }
});

server.listen(PORT, () => {
  console.log(`Agent Trace running at http://localhost:${PORT}`);
});
