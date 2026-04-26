// Phase 1: connect directly to game server. Phase 2: switch to window.location.host
const WS_URL = "ws://localhost:4000/ws";

let ws = null;
let myPlayerId = null;
let myRoomId = null;
let isHost = false;
let selectedAnswer = null;
let timerInterval = null;

// --- DOM Elements ---

const screens = {
  lobby: document.getElementById("screen-lobby"),
  waiting: document.getElementById("screen-waiting"),
  question: document.getElementById("screen-question"),
  result: document.getElementById("screen-result"),
  gameover: document.getElementById("screen-gameover"),
};

const els = {
  playerName: document.getElementById("player-name"),
  btnCreate: document.getElementById("btn-create"),
  btnJoinToggle: document.getElementById("btn-join-toggle"),
  joinSection: document.getElementById("join-section"),
  roomCode: document.getElementById("room-code"),
  btnJoin: document.getElementById("btn-join"),
  roomId: document.getElementById("room-id"),
  serverInfo: document.getElementById("server-info"),
  playerList: document.getElementById("player-list"),
  btnStart: document.getElementById("btn-start"),
  waitingMsg: document.getElementById("waiting-msg"),
  roundNum: document.getElementById("round-num"),
  timer: document.getElementById("timer"),
  questionText: document.getElementById("question-text"),
  options: document.getElementById("options"),
  resultFeedback: document.getElementById("result-feedback"),
  roundScores: document.getElementById("round-scores"),
  leaderboard: document.getElementById("leaderboard"),
  btnBackLobby: document.getElementById("btn-back-lobby"),
  errorBar: document.getElementById("error-bar"),
};

// --- Screen Management ---

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// --- WebSocket ---

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("Connected to server");
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    console.log("Disconnected from server");
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// --- Message Handlers ---

function handleServerMessage(msg) {
  switch (msg.type) {
    case "room_created":
      myPlayerId = msg.playerId;
      myRoomId = msg.roomId;
      isHost = true;
      els.roomId.textContent = msg.roomId;
      els.btnStart.classList.remove("hidden");
      els.waitingMsg.classList.add("hidden");
      showScreen("waiting");
      break;

    case "player_joined":
      renderPlayerList(msg.players);
      if (!myRoomId && msg.roomId) myRoomId = msg.roomId;
      break;

    case "round_start":
      selectedAnswer = null;
      renderQuestion(msg);
      showScreen("question");
      startTimer(msg.timeLimit);
      break;

    case "round_result":
      clearInterval(timerInterval);
      renderRoundResult(msg);
      showScreen("result");
      break;

    case "game_over":
      renderLeaderboard(msg.leaderboard);
      showScreen("gameover");
      break;

    case "error":
      showError(msg.message);
      break;
  }
}

// --- Renderers ---

function renderPlayerList(players) {
  els.playerList.innerHTML = players
    .map((p) => {
      const hostClass = p.playerId === myPlayerId && isHost ? "host" : "";
      return `<li class="${hostClass}">${p.name}</li>`;
    })
    .join("");
}

function renderQuestion(msg) {
  els.roundNum.textContent = `Round ${msg.round} / ${msg.totalRounds}`;
  els.questionText.textContent = msg.question;
  els.options.innerHTML = msg.options
    .map(
      (opt, i) =>
        `<button class="option-btn" data-index="${i}">${opt}</button>`,
    )
    .join("");

  els.options.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (selectedAnswer !== null) return;
      selectedAnswer = parseInt(btn.dataset.index);

      els.options.querySelectorAll(".option-btn").forEach((b) => {
        b.classList.remove("selected");
        b.disabled = true;
      });
      btn.classList.add("selected");

      send({ type: "answer", answerIndex: selectedAnswer });
    });
  });
}

function startTimer(timeLimit) {
  let remaining = timeLimit;
  els.timer.textContent = remaining + "s";

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remaining--;
    els.timer.textContent = remaining + "s";
    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
}

function renderRoundResult(msg) {
  if (selectedAnswer === msg.correctIndex) {
    els.resultFeedback.textContent = "Correct!";
    els.resultFeedback.className = "correct";
  } else {
    els.resultFeedback.textContent = "Wrong!";
    els.resultFeedback.className = "wrong";
  }

  els.roundScores.innerHTML = msg.scores
    .map((s) => `<li><span>${s.name}</span><span>${s.score} pts</span></li>`)
    .join("");
}

function renderLeaderboard(leaderboard) {
  els.leaderboard.innerHTML = leaderboard
    .map((s) => `<li><span>${s.name}</span><span>${s.score} pts</span></li>`)
    .join("");
}

function showError(message) {
  els.errorBar.textContent = message;
  els.errorBar.classList.remove("hidden");
  setTimeout(() => els.errorBar.classList.add("hidden"), 3000);
}

// --- Event Listeners ---

els.btnCreate.addEventListener("click", () => {
  const name = els.playerName.value.trim();
  if (!name) return showError("Enter your name");
  connect();
  ws.onopen = () => send({ type: "create_room", playerName: name });
});

els.btnJoinToggle.addEventListener("click", () => {
  els.joinSection.classList.toggle("hidden");
});

els.btnJoin.addEventListener("click", () => {
  const name = els.playerName.value.trim();
  const roomId = els.roomCode.value.trim().toUpperCase();
  if (!name) return showError("Enter your name");
  if (!roomId) return showError("Enter a room code");

  connect();
  ws.onopen = () => {
    send({ type: "join_room", roomId, playerName: name });
    myRoomId = roomId;
    els.roomId.textContent = roomId;
    showScreen("waiting");
  };
});

els.btnStart.addEventListener("click", () => {
  send({ type: "start_game" });
});

els.btnBackLobby.addEventListener("click", () => {
  ws.close();
  myPlayerId = null;
  myRoomId = null;
  isHost = false;
  showScreen("lobby");
});
