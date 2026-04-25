const state = {
  sessions: [],
  selectedSession: null,
  selectedEvent: null,
  harness: "all",
  kind: "all",
  search: "",
  rawVisible: false,
  graph: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const GRAPH_WIDTH = 4400;
const GRAPH_HEIGHT = 3600;
const MAX_GRAPH_EVENTS = 260;
const GRAPH_COLUMNS = 18;

const formatDate = (value) => {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
};

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || response.statusText);
  }
  return response.json();
}

async function loadSessions() {
  const data = await fetchJson("/api/sessions");
  state.sessions = data.sessions || [];
  renderShell(data);
  if (!state.selectedSession && state.sessions.length) {
    await selectSession(state.sessions[0].id);
  } else {
    renderSessionList();
  }
}

async function sync() {
  const button = $("#syncButton");
  button.disabled = true;
  button.textContent = "Syncing";
  $("#syncStatus").textContent = "Scanning local logs...";
  try {
    const data = await fetchJson("/api/sync", { method: "POST" });
    state.sessions = data.sessions || [];
    renderShell(data);
    if (state.sessions.length) await selectSession(state.sessions[0].id);
  } catch (error) {
    $("#syncStatus").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Sync";
  }
}

function renderShell(data) {
  const stats = data.stats || {};
  $("#syncStatus").textContent = data.lastSyncedAt
    ? `Synced ${formatDate(data.lastSyncedAt)}`
    : "Not synced yet";
  $("#metricSessions").textContent = stats.sessionCount || state.sessions.length || 0;
  $("#metricEvents").textContent = stats.eventCount || 0;
  $("#metricSubagents").textContent = stats.subagentCount || 0;
  renderSessionList();
}

function filteredSessions() {
  const query = state.search.toLowerCase();
  return state.sessions.filter((session) => {
    const harnessMatch = state.harness === "all" || session.harness === state.harness;
    const text = `${session.title} ${session.cwd} ${session.project} ${session.sourcePath}`.toLowerCase();
    return harnessMatch && (!query || text.includes(query));
  });
}

function renderSessionList() {
  const container = $("#sessionList");
  const sessions = filteredSessions();

  if (!sessions.length) {
    container.innerHTML = `<div class="empty-state"><p>No sessions match.</p></div>`;
    return;
  }

  container.innerHTML = sessions
    .map(
      (session) => `
        <button class="session-card ${state.selectedSession?.id === session.id ? "active" : ""}" data-id="${escapeHtml(session.id)}">
          <span class="badge ${session.harness}">${session.harness}</span>
          <strong>${escapeHtml(session.title || "Untitled session")}</strong>
          <p>${escapeHtml(session.cwd || session.project || "Unknown project")}</p>
          <footer>
            <span>${formatDate(session.updatedAt)}</span>
            <span>${session.eventCount || 0} events</span>
          </footer>
        </button>
      `
    )
    .join("");

  container.querySelectorAll(".session-card").forEach((button) => {
    button.addEventListener("click", () => selectSession(button.dataset.id));
  });
}

async function selectSession(id) {
  stopGraph();
  state.selectedSession = await fetchJson(`/api/sessions/${encodeURIComponent(id)}`);
  state.selectedEvent = null;
  state.rawVisible = false;
  renderSessionList();
  renderSelectedSession();
  renderGraph();
  renderDetail(null);
}

function renderSelectedSession() {
  const session = state.selectedSession;
  if (!session) return;

  $("#selectedHarness").textContent = `${session.harness}${session.isSubagent ? " subagent" : ""}`;
  $("#selectedTitle").textContent = session.title || "Untitled session";
  $("#selectedMeta").textContent = `${session.cwd || session.project || "Unknown project"} | ${formatDate(
    session.startedAt
  )} - ${formatDate(session.updatedAt)}`;

  const stats = session.stats || {};
  $("#selectedStats").innerHTML = [
    ["Turns", stats.turns],
    ["Tools", stats.toolCalls],
    ["Errors", stats.errors],
    ["Searches", stats.webSearches],
    ["Files", stats.fileChanges]
  ]
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value]) => `<span class="pill">${label}: ${value || 0}</span>`)
    .join("");
}

function filteredEvents() {
  const timeline = state.selectedSession?.timeline || [];
  if (state.kind === "all") return timeline;
  if (state.kind === "tool") {
    return timeline.filter((event) =>
      ["tool-call", "tool-result", "command", "web-search"].includes(event.kind)
    );
  }
  if (state.kind === "message") {
    return timeline.filter((event) => event.kind.includes("message"));
  }
  return timeline.filter((event) => event.kind === state.kind);
}

function renderGraph() {
  const viewport = $("#timeline");
  stopGraph();

  if (!state.selectedSession) {
    viewport.className = "graph-viewport empty-state";
    viewport.innerHTML = `<p>Sync local logs to visualize the graph.</p>`;
    $("#eventCountLabel").textContent = "";
    return;
  }

  const allEvents = filteredEvents();
  const events = allEvents.slice(0, MAX_GRAPH_EVENTS);
  $("#eventCountLabel").textContent =
    allEvents.length > events.length
      ? `${events.length} of ${allEvents.length} nodes`
      : `${events.length} nodes`;

  if (!events.length) {
    viewport.className = "graph-viewport empty-state";
    viewport.innerHTML = `<p>No nodes for this filter.</p>`;
    return;
  }

  viewport.className = "graph-viewport";
  viewport.innerHTML = `
    <div id="graphStage" class="graph-stage">
      <svg id="graphLinks" class="graph-links" viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}" aria-hidden="true"></svg>
      <div id="graphNodes"></div>
    </div>
    <div class="graph-hint">Start is highlighted. Use Prev/Next to follow the run. Drag nodes, scroll to zoom, drag empty space to pan.</div>
  `;

  const nodes = createGraphNodes(events);
  const links = createGraphLinks(events, nodes);
  if (!state.selectedEvent || !nodes.some((node) => node.id === state.selectedEvent.id)) {
    state.selectedEvent = nodes[0];
  }
  state.graph = {
    viewport,
    stage: $("#graphStage"),
    svg: $("#graphLinks"),
    nodeLayer: $("#graphNodes"),
    nodes,
    links,
    zoom: 0.72,
    panX: 34,
    panY: 28,
    running: true,
    draggingNode: null,
    panning: false,
    lastPointer: null,
    frame: null
  };

  renderGraphDom();
  bindGraphGestures();
  renderDetail(state.selectedEvent);
  focusNode(state.selectedEvent.id, false);
}

function createGraphNodes(events) {
  const lanes = new Map([
    ["user-message", 0],
    ["assistant-message", 1],
    ["tool-call", 2],
    ["command", 2],
    ["web-search", 2],
    ["tool-result", 3],
    ["error", 4],
    ["reasoning", 1],
    ["thinking", 1]
  ]);
  return events.map((event, index) => {
    const lane = lanes.get(event.kind) ?? (index % 5);
    const rawColumn = index % GRAPH_COLUMNS;
    const row = Math.floor(index / GRAPH_COLUMNS);
    const column = row % 2 === 0 ? rawColumn : GRAPH_COLUMNS - 1 - rawColumn;
    return {
      ...event,
      pathIndex: index,
      x: 150 + column * 220 + jitter(index, 18),
      y: 130 + row * 300 + lane * 42 + jitter(index + 91, 16),
      vx: 0,
      vy: 0,
      fixed: true,
      width: 150,
      height: 64
    };
  });
}

function createGraphLinks(events, nodes) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const eventIds = new Set(events.map((event) => event.id));
  const links = [];
  const seen = new Set();

  function add(from, to, type = "next") {
    if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) return;
    const key = `${from}->${to}:${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: from, target: to, type });
  }

  const graphEdges = state.selectedSession?.edges || [];
  for (const edge of graphEdges) add(edge.from, edge.to, edge.type || "edge");

  for (let index = 1; index < events.length; index += 1) {
    add(events[index - 1].id, events[index].id, "next");
  }

  for (const event of events) {
    if (event.parentId && eventIds.has(event.parentId)) add(event.parentId, event.id, "parent");
  }

  return links;
}

function renderGraphDom() {
  const graph = state.graph;
  if (!graph) return;

  graph.svg.innerHTML = graph.links
    .map(
      (link, index) =>
        `<line class="graph-link ${escapeHtml(link.type)}" data-link="${index}" x1="0" y1="0" x2="0" y2="0" marker-end="url(#arrow)"></line>`
    )
    .join("");
  graph.svg.insertAdjacentHTML(
    "afterbegin",
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>`
  );

  graph.nodeLayer.innerHTML = graph.nodes
    .map(
      (node) => `
        <button class="graph-node ${escapeHtml(node.kind)} ${node.pathIndex === 0 ? "start-node" : ""} ${state.selectedEvent?.id === node.id ? "active" : ""}" data-id="${escapeHtml(
          node.id
        )}" style="left:${node.x}px;top:${node.y}px">
          <em class="node-index">${node.pathIndex === 0 ? "Start" : `#${node.pathIndex + 1}`}</em>
          <strong>${escapeHtml(node.label || node.kind)}</strong>
          <span>${escapeHtml(node.summary || "Captured event")}</span>
        </button>
      `
    )
    .join("");

  graph.nodeLayer.querySelectorAll(".graph-node").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectGraphNode(button.dataset.id, false);
    });

    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const node = graph.nodes.find((candidate) => candidate.id === button.dataset.id);
      graph.draggingNode = node;
      node.fixed = true;
      button.setPointerCapture(event.pointerId);
      graph.lastPointer = graphPoint(event);
    });
  });

  applyGraphTransform();
  updateGraphPositions();
}

function bindGraphGestures() {
  const graph = state.graph;
  if (!graph) return;

  graph.viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".graph-node")) return;
    graph.panning = true;
    graph.lastPointer = { x: event.clientX, y: event.clientY };
    graph.viewport.setPointerCapture(event.pointerId);
  });

  graph.viewport.addEventListener("pointermove", (event) => {
    if (graph.draggingNode) {
      const point = graphPoint(event);
      graph.draggingNode.x += point.x - graph.lastPointer.x;
      graph.draggingNode.y += point.y - graph.lastPointer.y;
      graph.draggingNode.vx = 0;
      graph.draggingNode.vy = 0;
      graph.lastPointer = point;
      updateGraphPositions();
      return;
    }

    if (graph.panning) {
      graph.panX += event.clientX - graph.lastPointer.x;
      graph.panY += event.clientY - graph.lastPointer.y;
      graph.lastPointer = { x: event.clientX, y: event.clientY };
      applyGraphTransform();
    }
  });

  graph.viewport.addEventListener("pointerup", () => {
    graph.draggingNode = null;
    graph.panning = false;
    graph.lastPointer = null;
  });

  graph.viewport.addEventListener("pointercancel", () => {
    graph.draggingNode = null;
    graph.panning = false;
    graph.lastPointer = null;
  });

  graph.viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const oldZoom = graph.zoom;
      const nextZoom = clamp(graph.zoom * (event.deltaY > 0 ? 0.9 : 1.1), 0.28, 1.65);
      const rect = graph.viewport.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      graph.panX = mouseX - ((mouseX - graph.panX) / oldZoom) * nextZoom;
      graph.panY = mouseY - ((mouseY - graph.panY) / oldZoom) * nextZoom;
      graph.zoom = nextZoom;
      applyGraphTransform();
    },
    { passive: false }
  );
}

function selectGraphNode(id, shouldFocus = true) {
  const graph = state.graph;
  if (!graph) return;
  const selected = graph.nodes.find((node) => node.id === id);
  if (!selected) return;
  state.selectedEvent = selected;
  state.rawVisible = false;
  renderDetail(selected);
  graph.nodeLayer
    .querySelectorAll(".graph-node")
    .forEach((candidate) => candidate.classList.toggle("active", candidate.dataset.id === selected.id));
  if (shouldFocus) focusNode(selected.id, true);
}

function jumpRelative(offset) {
  const graph = state.graph;
  if (!graph?.nodes.length) return;
  const current = state.selectedEvent
    ? graph.nodes.findIndex((node) => node.id === state.selectedEvent.id)
    : 0;
  const nextIndex = clamp((current < 0 ? 0 : current) + offset, 0, graph.nodes.length - 1);
  selectGraphNode(graph.nodes[nextIndex].id, true);
}

function jumpStart() {
  const graph = state.graph;
  if (!graph?.nodes.length) return;
  selectGraphNode(graph.nodes[0].id, true);
}

function tickGraph(iterations = 1) {
  const graph = state.graph;
  if (!graph || !graph.running) return;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  for (let step = 0; step < iterations; step += 1) {
    for (const link of graph.links) {
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const desired = link.type === "next" ? 150 : 118;
      const force = (distance - desired) * 0.004;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (!source.fixed) {
        source.vx += fx;
        source.vy += fy;
      }
      if (!target.fixed) {
        target.vx -= fx;
        target.vy -= fy;
      }
    }

    for (let a = 0; a < graph.nodes.length; a += 1) {
      for (let b = a + 1; b < graph.nodes.length; b += 1) {
        const first = graph.nodes[a];
        const second = graph.nodes[b];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance > 230) continue;
        const force = 36 / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        if (!first.fixed) {
          first.vx -= fx;
          first.vy -= fy;
        }
        if (!second.fixed) {
          second.vx += fx;
          second.vy += fy;
        }
      }
    }

    for (const node of graph.nodes) {
      const centerPullX = (GRAPH_WIDTH / 2 - node.x) * 0.0007;
      const centerPullY = (GRAPH_HEIGHT / 2 - node.y) * 0.0007;
      if (!node.fixed) {
        node.vx = (node.vx + centerPullX) * 0.84;
        node.vy = (node.vy + centerPullY) * 0.84;
        node.x = clamp(node.x + node.vx, 80, GRAPH_WIDTH - 80);
        node.y = clamp(node.y + node.vy, 60, GRAPH_HEIGHT - 60);
      }
    }
  }

  updateGraphPositions();
  graph.frame = requestAnimationFrame(() => tickGraph(1));
}

function updateGraphPositions() {
  const graph = state.graph;
  if (!graph) return;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  graph.nodeLayer.querySelectorAll(".graph-node").forEach((element) => {
    const node = byId.get(element.dataset.id);
    if (!node) return;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
  });

  graph.svg.querySelectorAll(".graph-link").forEach((line, index) => {
    const link = graph.links[index];
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    if (!source || !target) return;
    line.setAttribute("x1", source.x);
    line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x);
    line.setAttribute("y2", target.y);
  });
}

function graphPoint(event) {
  const graph = state.graph;
  const rect = graph.viewport.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - graph.panX) / graph.zoom,
    y: (event.clientY - rect.top - graph.panY) / graph.zoom
  };
}

function applyGraphTransform() {
  const graph = state.graph;
  if (!graph) return;
  graph.stage.style.transform = `translate(${graph.panX}px, ${graph.panY}px) scale(${graph.zoom})`;
}

function stopGraph() {
  if (!state.graph) return;
  state.graph.running = false;
  if (state.graph.frame) cancelAnimationFrame(state.graph.frame);
  state.graph = null;
}

function zoomGraph(factor) {
  const graph = state.graph;
  if (!graph) return;
  graph.zoom = clamp(graph.zoom * factor, 0.28, 1.65);
  applyGraphTransform();
}

function resetGraphView() {
  const graph = state.graph;
  if (!graph) return;
  graph.zoom = 0.72;
  graph.panX = 34;
  graph.panY = 28;
  applyGraphTransform();
}

function focusNode(id, animated = true) {
  const graph = state.graph;
  if (!graph) return;
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) return;
  const rect = graph.viewport.getBoundingClientRect();
  const nextPanX = rect.width / 2 - node.x * graph.zoom;
  const nextPanY = rect.height / 2 - node.y * graph.zoom;
  if (!animated) {
    graph.panX = nextPanX;
    graph.panY = nextPanY;
    applyGraphTransform();
    return;
  }
  graph.panX = graph.panX * 0.35 + nextPanX * 0.65;
  graph.panY = graph.panY * 0.35 + nextPanY * 0.65;
  applyGraphTransform();
}

function renderDetail(event) {
  $("#rawToggle").disabled = !event;
  $("#rawToggle").textContent = state.rawVisible ? "Hide" : "Raw";
  $("#detailRaw").classList.toggle("hidden", !state.rawVisible);

  if (!event) {
    $("#detailKind").textContent = "Event";
    $("#detailTitle").textContent = "Select a node";
    $("#detailFacts").innerHTML = "";
    $("#detailRaw").textContent = "";
    return;
  }

  $("#detailKind").textContent = event.kind;
  $("#detailTitle").textContent = event.label || event.kind;
  const facts = [
    ["Summary", event.summary],
    ["Timestamp", event.timestamp ? new Date(event.timestamp).toLocaleString() : ""],
    ["Role", event.role],
    ["Tool", event.toolName],
    ["Turn", event.turnId],
    ["Call", event.callId],
    ["Parent", event.parentId],
    ["Index", event.index]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  $("#detailFacts").innerHTML = facts
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
    .join("");
  $("#detailRaw").textContent = JSON.stringify(event.raw, null, 2);
}

function jitter(seed, amount) {
  const value = Math.sin(seed * 999) * 10000;
  return (value - Math.floor(value) - 0.5) * amount;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("#syncButton").addEventListener("click", sync);
$("#jumpStart").addEventListener("click", jumpStart);
$("#jumpPrev").addEventListener("click", () => jumpRelative(-1));
$("#jumpNext").addEventListener("click", () => jumpRelative(1));
$("#zoomOut").addEventListener("click", () => zoomGraph(0.86));
$("#zoomReset").addEventListener("click", resetGraphView);
$("#zoomIn").addEventListener("click", () => zoomGraph(1.16));

$("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderSessionList();
});

$$(".segmented button").forEach((button) => {
  button.addEventListener("click", () => {
    state.harness = button.dataset.harness;
    $$(".segmented button").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    renderSessionList();
  });
});

$$(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    state.kind = button.dataset.kind;
    $$(".tabs button").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
    state.selectedEvent = null;
    state.rawVisible = false;
    renderGraph();
    renderDetail(null);
  });
});

$("#rawToggle").addEventListener("click", () => {
  state.rawVisible = !state.rawVisible;
  renderDetail(state.selectedEvent);
});

loadSessions().catch((error) => {
  $("#syncStatus").textContent =
    window.location.protocol === "file:" ? "Open http://localhost:4321 to use the local sync server." : error.message;
});
