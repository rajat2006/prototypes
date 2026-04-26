-- routing.lua: sticky session routing for the game cluster
--
-- Runs in the access_by_lua phase on every /ws request.
-- Reads the ?roomId=... query param, looks up Redis to find which game
-- server is hosting that room, and stashes the chosen backend in
-- ngx.ctx.target_host so balancer_by_lua_block can use it later.

local redis = require "resty.redis"

-- Static map of server-id -> "host:port" inside the Docker network.
local SERVERS = {
  ["server-1"] = "game-server-1:5000",
  ["server-2"] = "game-server-2:5000",
}

-- Connect to Redis. Returns the client or nil + error.
local function connect_redis()
  local red = redis:new()
  red:set_timeouts(1000, 1000, 1000)  -- 1s connect, 1s send, 1s read
  local ok, err = red:connect("redis", 6379)
  if not ok then
    return nil, "redis connect failed: " .. (err or "unknown")
  end
  return red
end

-- Pick a backend with simple round-robin via a Redis counter.
-- Health-aware selection comes in Step 6.
local function pick_default_server(red)
  local count, err = red:incr("router:rr_counter")
  if not count then
    ngx.log(ngx.ERR, "rr counter failed, falling back to server-1: ", err)
    return SERVERS["server-1"], "server-1"
  end
  if count % 2 == 1 then
    return SERVERS["server-1"], "server-1"
  else
    return SERVERS["server-2"], "server-2"
  end
end

-- Main routing logic.
local function route()
  local room_id = ngx.var.arg_roomId
  ngx.log(ngx.INFO, "routing.lua: roomId=", room_id or "(none)")

  local red, err = connect_redis()
  if not red then
    ngx.log(ngx.ERR, "routing.lua: ", err)
    return ngx.exit(500)
  end

  local target_host, target_id

  if room_id and room_id ~= "" then
    -- Try sticky lookup first.
    local mapped = red:hget("room_routes", room_id)
    if mapped and mapped ~= ngx.null then
      target_id = mapped
      target_host = SERVERS[mapped]
      ngx.log(ngx.INFO, "routing.lua: sticky hit ", room_id, " -> ", mapped)
    else
      -- Joining a room before host wrote the mapping. Pick default and write.
      target_host, target_id = pick_default_server(red)
      red:hset("room_routes", room_id, target_id)
      ngx.log(ngx.INFO, "routing.lua: new mapping ", room_id, " -> ", target_id)
    end
  else
    -- No roomId in URL (creating a new room). Pick any server.
    target_host, target_id = pick_default_server(red)
    ngx.log(ngx.INFO, "routing.lua: no roomId, picking ", target_id)
  end

  -- Return the connection to the keepalive pool for reuse.
  red:set_keepalive(10000, 100)

  -- Set the Nginx variable that proxy_pass uses to pick the backend.
  ngx.var.target = target_host
end

route()
