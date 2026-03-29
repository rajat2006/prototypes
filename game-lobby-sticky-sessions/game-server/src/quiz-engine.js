const { getRandomQuestions } = require("./questions");
const { ROOM_STATUS } = require("./room-manager");

const QUESTIONS_PER_GAME = 7;
const BASE_POINTS = 10;
const MAX_SPEED_BONUS = 5;

function calculateScore(answerIndex, correctIndex, timeElapsed, timeLimit) {
  if (answerIndex !== correctIndex) return 0;
  const timeLimitMs = timeLimit * 1000;
  const speedRatio = Math.max(0, 1 - timeElapsed / timeLimitMs);
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * speedRatio);
}

class QuizEngine {
  constructor(room, broadcast) {
    this.room = room;
    this.questions = getRandomQuestions(QUESTIONS_PER_GAME);
    this.broadcast = broadcast;
    this.currentRound = 0;
    this.answers = new Map();
    this.roundTimer = null;
    this.roundStartTime = null;
  }

  startGame() {
    this.room.status = ROOM_STATUS.playing;
    this.startRound();
  }

  startRound() {
    const question = this.questions[this.currentRound];
    this.answers = new Map();
    this.roundStartTime = Date.now();

    this.broadcast({
      type: "round_start",
      round: this.currentRound + 1,
      totalRounds: this.questions.length,
      question: question.question,
      options: question.options,
      timeLimit: question.timeLimit,
    });

    this.roundTimer = setTimeout(() => {
      this.endRound();
    }, question.timeLimit * 1000);
  }

  submitAnswer(playerId, answerIndex) {
    if (this.answers.has(playerId)) return;

    this.answers.set(playerId, {
      answerIndex,
      timestamp: Date.now(),
    });

    if (this.answers.size === this.room.players.size) {
      this.endRound();
    }
  }

  endRound() {
    clearTimeout(this.roundTimer);
    const question = this.questions[this.currentRound];

    for (const [playerId, answer] of this.answers.entries()) {
      const timeElapsed = answer.timestamp - this.roundStartTime;
      const points = calculateScore(
        answer.answerIndex,
        question.correctIndex,
        timeElapsed,
        question.timeLimit
      );

      const player = this.room.players.get(playerId);
      if (player) player.score += points;
    }

    const scores = Array.from(this.room.players.entries()).map(
      ([playerId, p]) => ({
        playerId,
        name: p.name,
        score: p.score,
      })
    );

    this.broadcast({
      type: "round_result",
      round: this.currentRound + 1,
      correctIndex: question.correctIndex,
      scores: scores.sort((a, b) => b.score - a.score),
    });

    this.currentRound++;

    if (this.currentRound >= this.questions.length) {
      this.endGame();
    } else {
      setTimeout(() => this.startRound(), 3000);
    }
  }

  endGame() {
    this.room.status = ROOM_STATUS.finished;

    const leaderboard = Array.from(this.room.players.entries())
      .map(([playerId, p]) => ({
        playerId,
        name: p.name,
        score: p.score,
      }))
      .sort((a, b) => b.score - a.score);

    this.broadcast({ type: "game_over", leaderboard });
  }
}

module.exports = { QuizEngine, calculateScore };
