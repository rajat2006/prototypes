const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const url = require("url");
const {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomState,
  listRooms,
} = require("./src/room-manager");
const { QuizEngine } = require("./src/quiz-engine");

const PORT = process.env.PORT || 5000;
const SERVER_ID = process.env.SERVER_ID || "server-local";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

// --- HTTP Endpoints ---

app.get("/health", (req, res) => {
  const rooms = listRooms();
  const playerCount = rooms.reduce((sum, r) => sum + r.playerCount, 0);
  res.json({
    status: "ok",
    serverId: SERVER_ID,
    roomCount: rooms.length,
    playerCount,
  });
});

app.get("/rooms", (req, res) => {
  res.json(listRooms());
});

// --- Broadcast utility ---

function broadcast(room, message) {
  const data = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  }
}

function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// --- WebSocket Handler ---

wss.on("connection", (ws, req) => {
  const params = url.parse(req.url, true).query;
  let currentRoomId = params.roomId || null;
  let currentPlayerId = null;

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      sendTo(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const EVENT_TYPES = {
      CREATE_ROOM: "create_room",
      JOIN_ROOM: "join_room",
      START_GAME: "start_game",
      ANSWER: "answer",
    };

    try {
      switch (data.type) {
        case EVENT_TYPES.CREATE_ROOM: {
          const { roomId, playerId } = createRoom(data.playerName, ws);
          currentRoomId = roomId;
          currentPlayerId = playerId;
          sendTo(ws, { type: "room_created", roomId, playerId });
          break;
        }
        case EVENT_TYPES.JOIN_ROOM: {
          const { playerId } = joinRoom(data.roomId, data.playerName, ws);
          currentRoomId = data.roomId;
          currentPlayerId = playerId;
          const state = getRoomState(currentRoomId);
          const room = getRoom(currentRoomId);
          broadcast(room, { type: "player_joined", players: state.players });
          break;
        }
        case EVENT_TYPES.START_GAME: {
          const room = getRoom(currentRoomId);
          if (!room) throw new Error("Room not found");
          if (room.host !== currentPlayerId) throw new Error("Only the host can start the game");
          const engine = new QuizEngine(room, (msg) => broadcast(room, msg));
          room.quizEngine = engine;
          engine.startGame();
          break;
        }
        case EVENT_TYPES.ANSWER: {
          const room = getRoom(currentRoomId);
          if (!room || !room.quizEngine) throw new Error("Game not in progress");
          room.quizEngine.submitAnswer(currentPlayerId, data.answerIndex);
          break;
        }
        default: {
          sendTo(ws, { type: "error", message: `Unknown message type: ${data.type}` });
        }
      }
    } catch (error) {
      sendTo(ws, { type: "error", message: error.message });
    }
  });

  ws.on("close", () => {
    if (currentRoomId && currentPlayerId) {
      try {
        const room = getRoom(currentRoomId);
        leaveRoom(currentRoomId, currentPlayerId);
        if (room && room.players.size > 0) {
          broadcast(room, {
            type: "player_joined",
            players: getRoomState(currentRoomId)?.players || [],
          });
        }
      } catch (err) {
        console.error(`Error on disconnect: ${err.message}`);
      }
    }
  });
});

// --- Start Server ---

server.listen(PORT, () => {
  console.log(`Game server [${SERVER_ID}] running on port ${PORT}`);
});
