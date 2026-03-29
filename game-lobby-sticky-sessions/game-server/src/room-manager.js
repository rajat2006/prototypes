const { v4: uuidv4 } = require("uuid");

const ROOM_STATUS = {
  waiting: "waiting",
  playing: "playing",
  finished: "finished",
};

const ROOM_CAP = 10;

const roomMap = new Map();

const generateNewRoomId = () => uuidv4().substring(0, 4).toUpperCase();

const createRoom = (playerName, ws) => {
  let newRoomId = generateNewRoomId();

  while (roomMap.has(newRoomId)) {
    newRoomId = generateNewRoomId();
  }

  // Create room in the map
  // room object : {roomId, players : Map<playerId, {name, ws, score}>, host: status: quizEngine}

  roomMap.set(newRoomId, {
    roomId: newRoomId,
    host: null,
    players: new Map(),
    status: ROOM_STATUS.waiting,
    quizEngine: null,
  });

  // Make the host join the room
  const { playerId } = joinRoom(newRoomId, playerName, ws, true);

  return { roomId: newRoomId, playerId };
};

const joinRoom = (roomId, playerName, ws, isCreating = false) => {
  const playerId = uuidv4();

  if (!roomMap.has(roomId)) {
    throw new Error("Room does not exist");
  }

  const roomObj = roomMap.get(roomId);

  if (roomObj.status !== ROOM_STATUS.waiting) {
    throw new Error("Game already started");
  }

  if (roomObj.players.size === ROOM_CAP) {
    throw new Error("Room is full");
  }

  if (isCreating) {
    roomObj.host = playerId;
  }

  roomObj.players.set(playerId, { name: playerName, ws, score: 0 });

  return { playerId };
};

const leaveRoom = (roomId, playerId) => {
  const players = roomMap.get(roomId).players;

  if (players.has(playerId)) {
    players.delete(playerId);
  }

  if (players.size === 0) {
    roomMap.delete(roomId);
  }
};

const getRoomState = (roomId) => {
  const room = roomMap.get(roomId);
  if (!room) return null;

  const players = Array.from(room.players.entries()).map(([playerId, p]) => ({
    playerId,
    name: p.name,
    score: p.score,
  }));

  return { roomId: room.roomId, status: room.status, host: room.host, players };
};

const listRooms = () => {
  return Array.from(roomMap.values()).map((room) => ({
    roomId: room.roomId,
    playerCount: room.players.size,
    status: room.status,
  }));
};

const getRoom = (roomId) => roomMap.get(roomId);

module.exports = {
  ROOM_STATUS,
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomState,
  listRooms,
  getRoom,
};
