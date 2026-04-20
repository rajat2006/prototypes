# Game Lobby Server with Sticky Routing

## Context
Exploring sticky sessions through a real-time quiz/trivia game deployed across multiple servers behind an OpenResty (Nginx + Lua) reverse proxy. The proxy inspects WebSocket upgrade requests, extracts the `roomId`, and queries a Redis-backed routing table to pin all players in the same room to the same backend server. Progressive failover is added later — first client reconnect, then Redis state replication.

### Why OpenResty over a custom Node.js proxy?
- **Production-standard**: Nginx is the industry-standard reverse proxy; Lua scripting makes it application-aware
- **Battle-tested**: Connection handling, buffering, WebSocket upgrades handled natively
- **Separation of concerns**: Proxy handles routing, game servers handle business logic
- **Performance**: C-based event loop vs single-threaded Node.js proxy

## Architecture

```
                    Browsers (players + dashboard)
                              |
                         :4000 (HTTP + WS)
                              |
                    ┌─────────────────────┐
                    │  OpenResty (Nginx)  │  Lua scripting for routing
                    │   Redis routing tbl │  room → server mapping
                    └────────┬────────────┘
                        ┌────┴────┐
                        │         │
                   :5000 (int)  :5000 (int)
                ┌───────────┐ ┌───────────┐
                │ Game Srv 1│ │ Game Srv 2│
                │ rooms in  │ │ rooms in  │
                │ memory    │ │ memory    │
                └─────┬─────┘ └─────┬─────┘
                      └──────┬──────┘
                       ┌─────┴─────┐
                       │   Redis   │ :6379
                       │ routes +  │
                       │ state(P4) │
                       └───────────┘
```

**Routing flow:**
1. Player connects: `ws://localhost:4000/ws?roomId=ABCD&playerId=alice`
2. Router looks up `room:ABCD` in Redis hash `room_routes`
3. If found → proxy to that server (sticky!). If not → pick least-loaded server, save mapping, proxy.
4. All subsequent connections for same room go to the same server.

## Folder Structure

```
game-lobby-sticky-sessions/
├── docker-compose.yaml
├── .env
├── .gitignore
├── DOCS/PLAN.md
├── router/
│   ├── Dockerfile                # Based on openresty/openresty:alpine
│   ├── nginx.conf                # Main Nginx config: upstreams, server block
│   └── lua/
│       ├── routing.lua           # Core: extract roomId, query Redis, pick upstream
│       ├── health_check.lua      # Periodic health checks on game servers
│       └── stats.lua             # REST API endpoints for dashboard (/api/stats)
├── game-server/
│   ├── Dockerfile
│   ├── package.json
│   ├── index.js
│   └── src/
│       ├── room-manager.js       # Room lifecycle + player tracking
│       ├── quiz-engine.js        # Rounds, timers, scoring
│       ├── questions.js          # Hardcoded question bank
│       └── redis-sync.js         # Phase 4: state replication
├── dashboard/
│   ├── Dockerfile
│   ├── package.json
│   ├── index.js
│   └── public/
│       ├── index.html
│       ├── style.css
│       └── dashboard.js
└── client/
    ├── index.html                # Player UI (served by router)
    ├── style.css
    └── client.js
```

---

## Phase 1: Single Game Server with Quiz Logic [DONE]

**Goal:** Working quiz game on one server. No routing yet.

### Steps
1. **Project scaffolding** — Create folder structure, `package.json` files, Dockerfiles, minimal `docker-compose.yaml` (redis + 1 game server) [DONE]
2. **Question bank** (`game-server/src/questions.js`) — 20+ trivia questions with options, correct answer, time limit. `getRandomQuestions(count)` function [DONE]
3. **Room manager** (`game-server/src/room-manager.js`) — In-memory `Map<roomId, Room>`. Functions: `createRoom`, `joinRoom`, `leaveRoom`, `getRoomState`, `listRooms` [DONE]
4. **Quiz engine** (`game-server/src/quiz-engine.js`) — `startGame`, `startRound`, `submitAnswer`, `endRound`, `endGame`. Timer-based rounds with scoring (10pts + speed bonus) [DONE]
5. **WebSocket server** (`game-server/index.js`) — Express + `ws`. JSON message protocol. Health endpoint at `GET /health` [DONE]
6. **Player client** (`client/`) — HTML/CSS/JS UI: enter name → create/join room → waiting room → question display → round results → leaderboard [DONE]
7. **Verify** — `docker compose up`, two browser tabs, create room, join, play through quiz [DONE]

### Message Protocol
| Direction | Type | Payload |
|-----------|------|---------|
| C→S | `create_room` | `{ playerName }` |
| C→S | `join_room` | `{ roomId, playerName }` |
| C→S | `start_game` | `{}` |
| C→S | `answer` | `{ answerIndex }` |
| S→C | `room_created` | `{ roomId, playerId }` |
| S→C | `player_joined` | `{ players }` |
| S→C | `round_start` | `{ round, question, options, timeLimit }` |
| S→C | `round_result` | `{ correctIndex, scores }` |
| S→C | `game_over` | `{ leaderboard }` |
| S→C | `error` | `{ message }` |

---

## Phase 2: OpenResty Router with Sticky Routing [IN PROGRESS]

**Goal:** Add OpenResty reverse proxy + 2nd game server. Lua scripting pins rooms to servers via Redis.

### Steps
1. **Add 2nd game server** to docker-compose (same image, different `SERVER_ID`) [DONE]
2. **OpenResty Dockerfile** (`router/Dockerfile`) — Based on `openresty/openresty:alpine`, copy `nginx.conf` and `lua/` scripts [DONE]
3. **Nginx config** (`router/nginx.conf`) — Define upstream blocks for game servers, WebSocket upgrade handling, `location /ws` using `access_by_lua_file` for routing, `location /` to serve client static files, `location /api` for dashboard stats [IN PROGRESS]
4. **Add `router` service to docker-compose** — Use root context (`context: .`, `dockerfile: router/Dockerfile`), expose port 4000, depend on both game servers, join `lobby-net`
5. **Routing logic** (`router/lua/routing.lua`) — Lua script using `resty.redis`:
   - Extract `roomId` from `ngx.var.arg_roomId`
   - `HGET room_routes <roomId>` → if found and healthy, set `ngx.var.target` to that upstream
   - If not found → query each server's `/health` endpoint, pick least-loaded, `HSET room_routes`, set target
   - Use `ngx.var` or `balancer_by_lua` to dynamically select the upstream
6. **Health checks** (`router/lua/health_check.lua`) — Periodic checks via `ngx.timer.at`, stores server health in `ngx.shared.DICT` (shared memory zone)
7. **Room lifecycle sync** — Game servers write room events to Redis. Lua reads routing table from Redis on each request (Redis is fast enough for this)
8. **Update client** — Point WebSocket URL at router (`ws://localhost:4000/ws`)
9. **Verify** — Two rooms on different servers, confirm sticky routing via `redis-cli HGETALL room_routes` and Nginx access logs

### Sticky Routing Algorithm (in Lua)
```
WS upgrade: /ws?roomId=X&playerId=Y

1. local roomId = ngx.var.arg_roomId
2. redis:HGET("room_routes", roomId)
   → found + server healthy?  → proxy_pass to that server (sticky!)
   → found + server unhealthy? → return 503 (Phase 4 handles re-routing)
   → not found? → pick least-loaded server via shared dict
                 → HSET("room_routes", roomId, serverId)
                 → proxy_pass to chosen server
3. No roomId? → pick least-loaded, proxy (game server creates room)
```

### Key Nginx Config Concepts
- `lua_shared_dict` — shared memory between Nginx workers for server health state
- `balancer_by_lua_block` — dynamically choose upstream at connection time
- `proxy_set_header Upgrade` / `Connection "Upgrade"` — required for WebSocket passthrough
- `resty.redis` — non-blocking Redis client built into OpenResty

---

## Phase 3: Real-time Dashboard

**Goal:** Web UI showing cluster state, routing table, live events.

### Steps
1. **Stats API** (`router/lua/stats.lua`) — Lua handler for `GET /api/stats` returns servers (from shared dict), routes (from Redis `HGETALL`), totals, recent events
2. **SSE endpoint** — Dashboard polls `/api/stats` every 2s (SSE is complex in Lua; polling is simpler and sufficient)
3. **Dashboard service** (`dashboard/`) — Static HTML/JS app showing:
   - Server health cards (green/red)
   - Routing table (roomId → serverId)
   - Scrolling event log
4. **Room detail endpoint** — `GET /rooms` on game servers, aggregated by Lua handler at `GET /api/rooms` (Lua calls each upstream's `/rooms` via `ngx.location.capture`)
5. **Verify** — Dashboard at `http://localhost:4002`, create rooms, watch routing appear live, kill a server, see it go red

---

## Phase 4: Progressive Failover

**Goal:** Client reconnect + Redis state replication for mid-game server failure recovery.

### Steps
1. **Client reconnection** (`client/client.js`) — On disconnect: "Reconnecting..." overlay, exponential backoff (1s→16s, 5 retries), send `{ type: "rejoin" }` on reconnect
2. **State serialization** (`game-server/src/redis-sync.js`) — After every state change, write `room_state:<roomId>` to Redis (JSON, 1hr TTL). Debounce within 100ms
3. **State restoration** — On `rejoin` for unknown room: check Redis `room_state:<roomId>`, deserialize, reconstruct room, resume game, broadcast `game_restored`
4. **Router re-routing** — Lua detects unhealthy server on reconnect: picks new healthy server, updates `room_routes` in Redis, proxies to new server
5. **Heartbeat** — Server sends `ping` every 10s, client responds `pong`. Detect stale connections
6. **Verify** — Mid-game, `docker compose stop game-server-1`. Players reconnect to server-2, scores preserved, quiz resumes. Dashboard shows failover event

---

## Redis Data Model

```
# Routing table (Hash)
room_routes { ABCD: "server-1", EFGH: "server-2" }

# Game state (String with TTL) — Phase 4
room_state:ABCD → { JSON blob }

# Pub/Sub channel
room_events → { event, roomId, serverId, timestamp }
```

## Dependencies

| Service | Stack |
|---------|-------|
| router | OpenResty (Nginx + Lua), `resty.redis` (built-in), no npm |
| game-server | Node.js: `ws`, `express`, `redis`, `uuid` |
| dashboard | Node.js: `express` (serves static files) |
| client | Static HTML/CSS/JS (no deps, served by router) |

## Docker Compose Services
- `redis` — redis:7-alpine, port 6379
- `router` — openresty/openresty:alpine, port 4000, serves client + proxies WS via Lua
- `game-server-1` — node:20-alpine, internal port 5000, SERVER_ID=server-1
- `game-server-2` — node:20-alpine, internal port 5000, SERVER_ID=server-2
- `dashboard` — node:20-alpine, port 4002
- Network: `lobby-net` (bridge)

## Verification Summary

| Phase | Test |
|-------|------|
| 1 | Two tabs, create + join room, play quiz, see leaderboard [DONE] |
| 2 | Two rooms on different servers, verify sticky routing via Redis + logs |
| 3 | Dashboard shows live routing, server health, event log |
| 4 | Kill server mid-game, players reconnect, scores preserved |

---

## Patterns & Concepts Applied

| Pattern | Where | Status |
|---------|-------|--------|
| **Registry** | `roomMap` in room-manager, `room_routes` in Redis | Phase 1 done |
| **Status tracking with validation** | Room status: `waiting → playing → finished` | Phase 1 done |
| **Observer / Pub-Sub** | WebSocket broadcast, Redis pub/sub | Phase 1 partial |
| **Strategy** | Lua routing — least-loaded vs sticky lookup | Phase 2 |
| **Mediator / Proxy** | OpenResty router between clients and backends | Phase 2 |
| **Affinity-based Routing** | Redis `room_routes` + Lua lookup | Phase 2 |
