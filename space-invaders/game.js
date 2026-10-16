const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const highScoreElement = document.querySelector("#highScore");
const livesElement = document.querySelector("#lives");
const statusElement = document.querySelector("#statusText");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayMessage = document.querySelector("#overlayMessage");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const keys = new Set();
const colors = ["#c7f44a", "#4ee7ff", "#ff5bad"];
const highScoreKey = "space-invaders-high-score";
const audioManager = createAudioManager();

let animationFrame;
let lastTime = 0;
let game;

function createAudioManager() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return {
      unlock: () => {},
      shoot: () => {},
      hit: () => {},
      win: () => {},
      lose: () => {},
    };
  }

  let context;
  let unlocked = false;

  function ensureContext() {
    if (context) return context;
    try {
      context = new AudioContextClass();
    } catch {
      context = null;
    }
    return context;
  }

  function unlock() {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    unlocked = true;
  }

  function playTone({ frequency, duration, type = "square", volume = 0.08, delay = 0 }) {
    const ctx = ensureContext();
    if (!ctx || !unlocked) return;
    const startTime = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  return {
    unlock,
    shoot() {
      playTone({ frequency: 780, duration: 0.08, type: "square", volume: 0.07 });
    },
    hit() {
      playTone({ frequency: 220, duration: 0.12, type: "sawtooth", volume: 0.09 });
    },
    win() {
      playTone({ frequency: 523, duration: 0.12, type: "triangle", volume: 0.07 });
      playTone({ frequency: 659, duration: 0.12, type: "triangle", volume: 0.07, delay: 0.13 });
      playTone({ frequency: 784, duration: 0.2, type: "triangle", volume: 0.08, delay: 0.26 });
    },
    lose() {
      playTone({ frequency: 392, duration: 0.12, type: "sawtooth", volume: 0.08 });
      playTone({ frequency: 294, duration: 0.14, type: "sawtooth", volume: 0.08, delay: 0.14 });
      playTone({ frequency: 196, duration: 0.2, type: "sawtooth", volume: 0.09, delay: 0.3 });
    },
  };
}

function createInvaders() {
  const invaders = [];
  const rows = 4;
  const columns = 9;
  const startX = 96;
  const startY = 86;
  const gapX = 62;
  const gapY = 48;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      invaders.push({
        x: startX + column * gapX,
        y: startY + row * gapY,
        width: 28,
        height: 22,
        color: colors[row % colors.length],
        row,
        alive: true,
      });
    }
  }

  return invaders;
}

function createGame() {
  return {
    running: false,
    over: false,
    won: false,
    score: 0,
    lives: 3,
    player: {
      x: WIDTH / 2 - 22,
      y: HEIGHT - 54,
      width: 44,
      height: 20,
      speed: 340,
      cooldown: 0,
    },
    invaders: createInvaders(),
    bullets: [],
    enemyBullets: [],
    invaderDirection: 1,
    invaderTimer: 0,
    invaderStep: 0.65,
    enemyTimer: 1.1,
    flash: 0,
  };
}

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function setOverlay(title, message, buttonLabel = "INICIAR PARTIDA") {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  startButton.textContent = buttonLabel;
  overlay.classList.remove("is-hidden");
}

function updateHud() {
  scoreElement.textContent = formatScore(game.score);
  const highScore = Number(localStorage.getItem(highScoreKey) || 0);
  highScoreElement.textContent = formatScore(Math.max(highScore, game.score));
  livesElement.textContent = `${"♥ ".repeat(game.lives).trim()}${game.lives ? "" : "—"}`;
  livesElement.setAttribute("aria-label", `${game.lives} vidas`);
}

function startGame() {
  audioManager.unlock();
  cancelAnimationFrame(animationFrame);
  game = createGame();
  game.running = true;
  lastTime = performance.now();
  overlay.classList.add("is-hidden");
  statusElement.textContent = "PARTIDA EN CURSO";
  updateHud();
  animationFrame = requestAnimationFrame(loop);
}

function endGame(won) {
  game.running = false;
  game.over = true;
  game.won = won;
  const previousHighScore = Number(localStorage.getItem(highScoreKey) || 0);
  if (game.score > previousHighScore) {
    localStorage.setItem(highScoreKey, String(game.score));
  }
  statusElement.textContent = won ? "OLEADA SUPERADA" : "NAVE DESTRUIDA";
  setOverlay(
    won ? "¡VICTORIA!" : "GAME OVER",
    won ? `Has limpiado el sector con ${formatScore(game.score)} puntos.` : `Puntuación final: ${formatScore(game.score)}. La Tierra necesita otra oportunidad.`,
    "JUGAR DE NUEVO",
  );
  if (won) {
    audioManager.win();
  } else {
    audioManager.lose();
  }
  updateHud();
}

function shoot() {
  if (!game.running || game.player.cooldown > 0) return;
  game.bullets.push({
    x: game.player.x + game.player.width / 2 - 2,
    y: game.player.y - 10,
    width: 4,
    height: 14,
    speed: 520,
  });
  game.player.cooldown = 0.25;
  audioManager.shoot();
}

function hitTest(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function updatePlayer(delta) {
  const direction = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
  game.player.x += direction * game.player.speed * delta;
  game.player.x = Math.max(16, Math.min(WIDTH - game.player.width - 16, game.player.x));
  game.player.cooldown = Math.max(0, game.player.cooldown - delta);
  if (keys.has("Space")) shoot();
}

function updateBullets(delta) {
  game.bullets.forEach((bullet) => {
    bullet.y -= bullet.speed * delta;
  });
  game.enemyBullets.forEach((bullet) => {
    bullet.y += bullet.speed * delta;
  });
  game.bullets = game.bullets.filter((bullet) => bullet.y + bullet.height > 0);
  game.enemyBullets = game.enemyBullets.filter((bullet) => bullet.y < HEIGHT);
}

function updateInvaders(delta) {
  game.invaderTimer += delta;
  if (game.invaderTimer < game.invaderStep) return;

  game.invaderTimer = 0;
  const living = game.invaders.filter((invader) => invader.alive);
  const leftEdge = Math.min(...living.map((invader) => invader.x));
  const rightEdge = Math.max(...living.map((invader) => invader.x + invader.width));
  const wouldHitEdge = rightEdge >= WIDTH - 25 || leftEdge <= 25;

  if (wouldHitEdge) {
    game.invaderDirection *= -1;
    living.forEach((invader) => {
      invader.y += 22;
    });
  } else {
    living.forEach((invader) => {
      invader.x += game.invaderDirection * 15;
    });
  }

  game.invaderStep = Math.max(0.12, 0.65 - (36 - living.length) * 0.012);
  if (living.some((invader) => invader.y + invader.height >= game.player.y - 10)) {
    endGame(false);
  }
}

function updateEnemyFire(delta) {
  game.enemyTimer -= delta;
  if (game.enemyTimer > 0) return;

  const living = game.invaders.filter((invader) => invader.alive);
  if (living.length) {
    const shooter = living[Math.floor(Math.random() * living.length)];
    game.enemyBullets.push({
      x: shooter.x + shooter.width / 2 - 2,
      y: shooter.y + shooter.height,
      width: 4,
      height: 13,
      speed: 205,
    });
  }
  game.enemyTimer = Math.max(0.32, 1.1 - (36 - living.length) * 0.015);
}

function resolveCollisions() {
  game.bullets.forEach((bullet) => {
    game.invaders.forEach((invader) => {
      if (!invader.alive || !hitTest(bullet, invader)) return;
      invader.alive = false;
      bullet.y = -100;
      game.score += (4 - invader.row) * 10;
      game.flash = 0.08;
      audioManager.hit();
    });
  });

  game.enemyBullets.forEach((bullet) => {
    if (!hitTest(bullet, game.player)) return;
    bullet.y = HEIGHT + 100;
    game.lives -= 1;
    game.flash = 0.16;
    audioManager.hit();
    if (game.lives <= 0) endGame(false);
  });

  game.bullets = game.bullets.filter((bullet) => bullet.y > -50);
  game.enemyBullets = game.enemyBullets.filter((bullet) => bullet.y < HEIGHT + 50);
  if (game.invaders.every((invader) => !invader.alive)) endGame(true);
  updateHud();
}

function drawPixelShip(x, y, width, height) {
  ctx.fillStyle = "#4ee7ff";
  ctx.fillRect(x + 8, y + 6, width - 16, height - 6);
  ctx.fillRect(x + 15, y, width - 30, 7);
  ctx.fillStyle = "#c7f44a";
  ctx.fillRect(x + 3, y + height - 5, width - 6, 5);
}

function drawInvader(invader) {
  const { x, y, width, height, color } = invader;
  ctx.fillStyle = color;
  ctx.fillRect(x + 5, y, width - 10, 4);
  ctx.fillRect(x, y + 5, width, 10);
  ctx.fillRect(x + 4, y + 15, 6, 7);
  ctx.fillRect(x + width - 10, y + 15, 6, 7);
  ctx.fillStyle = "#050916";
  ctx.fillRect(x + 7, y + 8, 4, 4);
  ctx.fillRect(x + width - 11, y + 8, 4, 4);
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#050916";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(78, 231, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  game.invaders.filter((invader) => invader.alive).forEach(drawInvader);
  drawPixelShip(game.player.x, game.player.y, game.player.width, game.player.height);

  ctx.fillStyle = "#ffffff";
  game.bullets.forEach((bullet) => ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height));
  ctx.fillStyle = "#ff5bad";
  game.enemyBullets.forEach((bullet) => ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height));

  ctx.fillStyle = "rgba(78, 231, 255, 0.5)";
  ctx.fillRect(0, HEIGHT - 15, WIDTH, 1);
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.22, game.flash)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function loop(timestamp) {
  const delta = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  if (!game.running) return;

  updatePlayer(delta);
  updateBullets(delta);
  updateInvaders(delta);
  updateEnemyFire(delta);
  resolveCollisions();
  game.flash = Math.max(0, game.flash - delta);
  draw();
  animationFrame = requestAnimationFrame(loop);
}

function handleKeyDown(event) {
  const key = event.code === "Space" ? "Space" : event.key;
  if (["ArrowLeft", "ArrowRight", "Space"].includes(key)) event.preventDefault();
  keys.add(key);
  if (key.toLowerCase() === "r") startGame();
}

function handleKeyUp(event) {
  const key = event.code === "Space" ? "Space" : event.key;
  keys.delete(key);
}

game = createGame();
updateHud();
draw();
startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
