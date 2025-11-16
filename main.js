const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const GRID_SIZE = 21;
const CELL_SIZE = 30;
const GRID_OFFSET_Y = CELL_SIZE;
const VIEW_WIDTH = GRID_SIZE * CELL_SIZE;
const VIEW_BORDER = CELL_SIZE;
const VIEW_HEIGHT = (GRID_SIZE + 2) * CELL_SIZE;
const VIEW_RENDER_WIDTH = VIEW_WIDTH + VIEW_BORDER * 2;
const VIEW_GAP = 0;
const CANVAS_WIDTH = VIEW_RENDER_WIDTH * 2 + VIEW_GAP;
const CANVAS_HEIGHT = VIEW_HEIGHT;
const BUILD_DURATION = 60 * 1000; // ms
const NPC_SPEED = 2.5;
const NPC_RADIUS = 0.35;
const PAD_PULSE_PERIOD = 3.5;
const ENTRANCE_X = Math.floor(GRID_SIZE / 2);
const FIXED_TIMESTEP = 1 / 120;
const MAX_FRAME_DELTA = 0.1;

const CELL_EMPTY = 0;
const CELL_STATIC = 1;
const CELL_PLAYER = 2;
const CELL_SPEED = 3;
const CELL_SLOW = 4;
const CELL_SPEED_USED = 5;
const CELL_SLOW_USED = 6;
const CELL_SPECIAL = 7;

const SPECIAL_TYPES = ["radius", "row", "column"];
const SPECIAL_RADIUS = 2.6;
const SPECIAL_LINGER = 3;
const SPECIAL_SLOW_MULT = 0.7;
const PANEL_SLOW_MULT = 0.55;
const PANEL_FAST_MULT = 1.5;

const MOVES = [
  { dx: 1, dy: 0, cost: 1, diagonal: false },
  { dx: -1, dy: 0, cost: 1, diagonal: false },
  { dx: 0, dy: 1, cost: 1, diagonal: false },
  { dx: 0, dy: -1, cost: 1, diagonal: false },
  { dx: 1, dy: 1, cost: Math.SQRT2, diagonal: true },
  { dx: -1, dy: 1, cost: Math.SQRT2, diagonal: true },
  { dx: 1, dy: -1, cost: Math.SQRT2, diagonal: true },
  { dx: -1, dy: -1, cost: Math.SQRT2, diagonal: true }
];

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const seedInput = document.getElementById("seedInput");
const newGameBtn = document.getElementById("newGame");
const randomSeedBtn = document.getElementById("randomSeed");
const setSeedBtn = document.getElementById("setSeed");
const specialButton = document.getElementById("specialButton");
const timerEl = document.getElementById("timer");
const coinsEl = document.getElementById("coins");
const scoreEl = document.getElementById("score");
const phaseEl = document.getElementById("phase");
const specialInfoEl = document.getElementById("specialInfo");
const menuOverlay = document.getElementById("menuOverlay");
const pauseOverlay = document.getElementById("pauseOverlay");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const hud = document.getElementById("gameHud");
const menuSingleBtn = document.getElementById("menuSingle");
const menuQuitBtn = document.getElementById("menuQuit");
const resumeBtn = document.getElementById("resumeBtn");
const pauseMenuBtn = document.getElementById("pauseMenuBtn");
const menuButton = document.getElementById("menuButton");
const resultPopup = document.getElementById("resultPopup");
const popupMessageEl = document.getElementById("popupMessage");
const popupEmojiEl = document.getElementById("popupEmoji");
const popupCloseBtn = document.getElementById("closePopup");

const state = {
  rng: mulberry32(1),
  seed: "",
  building: true,
  buildTimeLeft: 0,
  coins: 0,
  coinBudget: 0,
  playerBlocks: [],
  playerGrid: createEmptyGrid(),
  baseGrid: null,
  aiGrid: null,
  hoverCell: null,
  floatingTexts: [],
  buildMode: "normal",
  specialTemplate: null,
  playerSpecial: null,
  aiSpecial: null,
  race: null,
  results: { player: null, ai: null, winner: null },
  mode: "menu",
  paused: false,
  waitingForSpecial: false
};
let padPulseTimer = 0;

seedInput.value = Math.floor(Math.random() * 1e9).toString();
setupListeners();
showMainMenu();
let lastFrame = performance.now();
let accumulator = 0;
requestAnimationFrame(loop);

function setupListeners() {
  newGameBtn.addEventListener("click", () => startGame(seedInput.value.trim()));
  randomSeedBtn.addEventListener("click", () => {
    seedInput.value = Math.floor(Math.random() * 1e9).toString();
    startGame(seedInput.value);
  });
  setSeedBtn.addEventListener("click", () => {
    let value = seedInput.value.trim();
    if (!value) {
      value = Math.floor(Math.random() * 1e9).toString();
      seedInput.value = value;
    }
    startGame(value);
  });
  specialButton.addEventListener("click", () => {
    if (!state.building || state.playerSpecial.placed) return;
    toggleBuildMode();
  });
  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("contextmenu", handleRightClick);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseleave", () => (state.hoverCell = null));
  popupCloseBtn.addEventListener("click", hideResultPopup);
  menuSingleBtn.addEventListener("click", () => startFromMenu());
  menuQuitBtn.addEventListener("click", () => {
    window.close();
  });
  menuButton.addEventListener("click", () => {
    showMainMenu();
  });
  resumeBtn.addEventListener("click", resumeGame);
  pauseMenuBtn.addEventListener("click", () => {
    showMainMenu();
    hidePause();
  });
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && state.mode === "game") {
      if (state.paused) resumeGame();
      else showPause();
    }
  });
}

function startGame(seedText) {
  const safeSeed = seedText || Date.now().toString();
  state.seed = safeSeed;
  seedInput.value = safeSeed;
  state.rng = mulberry32(hashSeed(safeSeed));

  state.baseGrid = generateBaseGrid(state.rng);
  state.playerGrid = cloneGrid(state.baseGrid);
  state.aiGrid = null;
  state.coins = randomInt(state.rng, 10, 21);
  state.coinBudget = state.coins;
  state.playerBlocks = [];
  const specialType = pickSpecialType(state.rng);
  state.specialTemplate = createSpecialTemplate(specialType);
  state.playerSpecial = createSpecialTemplate(specialType);
  state.aiSpecial = null;
  state.building = true;
  state.buildMode = "normal";
  state.buildTimeLeft = BUILD_DURATION / 1000;
  state.hoverCell = null;
  state.floatingTexts = [];
  state.race = null;
  state.results = { player: null, ai: null, winner: null };
  state.waitingForSpecial = false;
  updateSpecialInfo();
  updatePhaseLabel("Phase: Build");
  hideResultPopup();
  state.mode = "game";
  state.paused = false;
  hud.classList.remove("hidden");
}

function startFromMenu() {
  showLoadingOverlay("Preparing...");
  requestAnimationFrame(() => {
    startGame(seedInput.value);
    hideLoadingOverlay();
    hideMainMenu();
  });
}


function handleCanvasClick(evt) {
  if (!state.building) return;
  const cell = pointerToGrid(evt);
  if (!cell) return;

  if (state.buildMode === "special") {
    if (state.playerSpecial.placed) {
      addFloatingText("Special already placed", evt);
      return;
    }
    if (tryPlaceSpecial(state.playerGrid, cell.x, cell.y, state.playerSpecial)) {
      toggleBuildMode(false);
      updateSpecialInfo();
      if (state.coins <= 0) {
        startRace();
      }
    } else {
      addFloatingText("Can't place special there", evt);
    }
    return;
  }

  if (state.coins <= 0) {
    addFloatingText("Out of coins! Place your special to begin.", evt, "#ff6b6b");
    return;
  }

  if (!tryPlaceBlock(state.playerGrid, cell.x, cell.y)) {
    addFloatingText("Invalid placement", evt);
    return;
  }
  state.playerBlocks.push({ x: cell.x, y: cell.y });
  state.coins -= 1;
  if (state.coins <= 0) {
    addFloatingText("Coins spent! Place your special to begin.", evt, "#99ff99");
    startRace();
  }
}

function handleRightClick(evt) {
  evt.preventDefault();
  if (!state.building) return;
  const cell = pointerToGrid(evt);
  if (!cell) return;

  if (state.playerSpecial.placed && cell.x === state.playerSpecial.cell.x && cell.y === state.playerSpecial.cell.y) {
    state.playerGrid[cell.y][cell.x] = CELL_EMPTY;
    state.playerSpecial = createSpecialTemplate(state.specialTemplate.type);
    toggleBuildMode(false);
    updateSpecialInfo();
    return;
  }

  const idx = state.playerBlocks.findIndex(
    (block) => cell.x >= block.x && cell.x <= block.x + 1 && cell.y >= block.y && cell.y <= block.y + 1
  );
  if (idx === -1) return;
  clearBlock(state.playerGrid, state.playerBlocks[idx].x, state.playerBlocks[idx].y);
  state.playerBlocks.splice(idx, 1);
  state.coins = Math.min(state.coins + 1, state.coinBudget);
}

function handleMouseMove(evt) {
  if (!state.building) {
    state.hoverCell = null;
    return;
  }
  const cell = pointerToGrid(evt);
  state.hoverCell = cell;
}

function toggleBuildMode(forceNormal = false) {
  state.buildMode = forceNormal ? "normal" : state.buildMode === "normal" ? "special" : "normal";
  if (state.buildMode === "special") {
    specialButton.classList.add("active");
  } else {
    specialButton.classList.remove("active");
  }
}

function tryPlaceBlock(grid, gx, gy) {
  if (!canPlaceBlock(grid, gx, gy)) return false;
  placeBlock(grid, gx, gy, CELL_PLAYER);
  ensureOpenings(grid);
  if (!hasPath(grid)) {
    clearBlock(grid, gx, gy);
    ensureOpenings(grid);
    return false;
  }
  return true;
}

function tryPlaceSpecial(grid, gx, gy, special) {
  if (!isCellAvailableForSpecial(grid, gx, gy)) return false;
  grid[gy][gx] = CELL_SPECIAL;
  ensureOpenings(grid);
  if (!hasPath(grid)) {
    grid[gy][gx] = CELL_EMPTY;
    ensureOpenings(grid);
    return false;
  }
  special.cell = { x: gx, y: gy };
  special.placed = true;
  special.effectTimer = 0;
  if (state.waitingForSpecial) {
    state.waitingForSpecial = false;
    startRace();
  }
  if (state.coins <= 0) {
    startRace();
  }
  return true;
}

function startRace(forceStart = false) {
  if (!state.building) return;
  if (!state.playerSpecial.placed && !forceStart) {
    if (!state.waitingForSpecial) {
      notifySpecialNeeded();
      state.waitingForSpecial = true;
    }
    return;
  }
  state.waitingForSpecial = false;
  state.building = false;
  state.buildTimeLeft = 0;
  state.hoverCell = null;
  toggleBuildMode(false);

  const playerGrid = cloneGrid(state.playerGrid);
  const playerSpecial = cloneSpecial(state.playerSpecial);

  if (!state.aiGrid || !state.aiSpecial) {
    const aiLayout = buildAiLayout();
    state.aiGrid = aiLayout.grid;
    state.aiSpecial = aiLayout.special;
  }

  const playerRunner = createRunner("You", playerGrid, playerSpecial);
  const aiRunner = createRunner("AI", state.aiGrid, cloneSpecial(state.aiSpecial));

  if (!playerRunner.path.length || !aiRunner.path.length) {
    const fallbackPath = [
      { x: ENTRANCE_X, y: GRID_SIZE },
      { x: ENTRANCE_X, y: GRID_SIZE + 1 },
      { x: ENTRANCE_X, y: GRID_SIZE + 2 },
      { x: ENTRANCE_X, y: GRID_SIZE + 3 },
      { x: ENTRANCE_X, y: GRID_SIZE + 4 },
      { x: ENTRANCE_X, y: 0 },
      { x: ENTRANCE_X, y: -1 }
    ];
    if (!playerRunner.path.length) {
      playerRunner.path = fallbackPath.slice();
      playerRunner.segmentIndex = 0;
      playerRunner.segmentProgress = 0;
      playerRunner.segmentLengths = computeSegmentLengths(playerRunner.path);
    }
    if (!aiRunner.path.length) {
      aiRunner.path = fallbackPath.slice();
      aiRunner.segmentIndex = 0;
      aiRunner.segmentProgress = 0;
      aiRunner.segmentLengths = computeSegmentLengths(aiRunner.path);
    }
  }

  state.race = {
    runners: [playerRunner, aiRunner],
    finished: false,
    elapsed: null,
    elapsedTime: 0
  };
  state.results = { player: null, ai: null, winner: null };
  updatePhaseLabel("Phase: Race");
}

function buildAiLayout() {
  const grid = cloneGrid(state.baseGrid);
  const special = createSpecialTemplate(state.specialTemplate.type);
  const tries = state.coinBudget;
  let currentLength = pathDistance(grid);
  for (let i = 0; i < tries; i++) {
    const placement = findBestAiPlacement(grid, currentLength);
    if (!placement) break;
    placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
    ensureOpenings(grid);
    currentLength = placement.length;
  }
  placeAiSpecial(grid, special);
  return { grid, special };
}

function findBestAiPlacement(grid, currentLength) {
  let best = null;
  const basePath = computePath(grid);
  const targeted = [];
  basePath.forEach((node) => {
    for (const [ox, oy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0]
    ]) {
      targeted.push({ x: node.x + ox, y: node.y + oy });
    }
  });
  const candidates = targeted.concat(generateRandomCandidates(grid, 160));
  for (const cand of candidates) {
    if (!canPlaceBlock(grid, cand.x, cand.y)) continue;
    placeBlock(grid, cand.x, cand.y, CELL_PLAYER);
    ensureOpenings(grid);
    const len = pathDistance(grid);
    clearBlock(grid, cand.x, cand.y);
    ensureOpenings(grid);
    if (!len) continue;
    if (len < currentLength) continue;
    if (!best || len > best.length) {
      best = { x: cand.x, y: cand.y, length: len };
    }
  }
  return best;
}

function generateRandomCandidates(grid, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push({
      x: randomInt(state.rng, 0, GRID_SIZE - 2),
      y: randomInt(state.rng, 1, GRID_SIZE - 3)
    });
  }
  return results;
}

function placeAiSpecial(grid, special) {
  const targetCells = computePath(grid);
  for (const node of targetCells) {
    if (tryPlaceSpecial(grid, node.x, node.y, special)) return;
  }
  for (let i = 0; i < 80; i++) {
    const gx = randomInt(state.rng, 0, GRID_SIZE - 1);
    const gy = randomInt(state.rng, 1, GRID_SIZE - 2);
    if (tryPlaceSpecial(grid, gx, gy, special)) return;
  }
}

function createRunner(label, grid, special) {
  const path = computePath(grid);
  return {
    label,
    grid,
    special,
    path,
    segmentIndex: 0,
    segmentProgress: 0,
    segmentLengths: computeSegmentLengths(path),
    finished: !path.length,
    resultTime: null,
    worldPos: null,
    elapsedTime: 0,
    effects: { slowTimer: 0, fastTimer: 0, areaTimer: 0, speedMultiplier: 1 }
  };
}

function updateRace(delta) {
  if (!state.race) return;
  let allFinished = true;
  state.race.elapsedTime += delta;
  state.race.runners.forEach((runner) => {
    if (runner.finished) return;
    allFinished = false;
    if (!runner.path.length) {
      runner.finished = true;
      recordResult(runner, null);
      return;
    }
    updateRunnerEffects(runner, delta);
    const speed = NPC_SPEED * runner.effects.speedMultiplier;
    let remainingDistance = speed * delta;
    let timeConsumed = 0;
    while (remainingDistance > 0 && runner.segmentIndex < runner.segmentLengths.length) {
      const segmentLength = runner.segmentLengths[runner.segmentIndex] || 0;
      if (segmentLength === 0) {
        runner.segmentIndex++;
        runner.segmentProgress = 0;
        continue;
      }
      const segmentRemaining = segmentLength - runner.segmentProgress;
      if (remainingDistance < segmentRemaining) {
        runner.segmentProgress += remainingDistance;
        timeConsumed += remainingDistance / speed;
        remainingDistance = 0;
      } else {
        remainingDistance -= segmentRemaining;
        timeConsumed += segmentRemaining / speed;
        runner.segmentIndex++;
        runner.segmentProgress = 0;
        triggerPanelForRunner(runner);
      }
    }
    runner.worldPos = runnerWorldPosition(runner);
    checkPanelUnderRunner(runner);
    updateSpecialArea(runner, delta);
    runner.elapsedTime += timeConsumed;
    if (runner.segmentIndex >= runner.segmentLengths.length) {
      runner.finished = true;
      runner.resultTime = runner.elapsedTime;
      recordResult(runner, runner.resultTime);
    }
  });
  if (state.race.finished) return;
  if (allFinished) {
    state.race.finished = true;
    const playerTime = state.results.player ?? 0;
    const aiTime = state.results.ai ?? 0;
    state.race.elapsed = Math.max(playerTime, aiTime);
    state.race.elapsedTime = state.race.elapsed;
    decideWinner();
    updatePhaseLabel("Phase: Complete");
  }
}

function recordResult(runner, time) {
  if (runner.label === "You") {
    state.results.player = time;
  } else {
    state.results.ai = time;
  }
}

function decideWinner() {
  const player = state.results.player;
  const ai = state.results.ai;
  if (player == null && ai == null) {
    state.results.winner = "No valid runs";
  } else if (player == null) {
    state.results.winner = "AI wins!";
  } else if (ai == null) {
    state.results.winner = "You win!";
  } else if (player > ai) {
    state.results.winner = "You win!";
  } else if (player < ai) {
    state.results.winner = "AI wins!";
  } else {
    state.results.winner = "Tie!";
  }
  showResultPopup();
}

function updateRunnerEffects(runner, delta) {
  const effects = runner.effects;
  if (effects.slowTimer > 0) effects.slowTimer = Math.max(0, effects.slowTimer - delta);
  if (effects.fastTimer > 0) effects.fastTimer = Math.max(0, effects.fastTimer - delta);
  if (effects.areaTimer > 0) effects.areaTimer = Math.max(0, effects.areaTimer - delta);
  let mult = 1;
  if (effects.slowTimer > 0) mult *= PANEL_SLOW_MULT;
  if (effects.areaTimer > 0) mult *= SPECIAL_SLOW_MULT;
  if (effects.fastTimer > 0) mult *= PANEL_FAST_MULT;
  runner.effects.speedMultiplier = mult;
}

function triggerPanelForRunner(runner) {
  const node = runner.path[runner.segmentIndex];
  if (!node) return;
  const value = runner.grid[node.y]?.[node.x];
  if (value === CELL_SPEED || value === CELL_SLOW) {
    applyPanelEffect(runner, node.x, node.y, value);
  }
}

function checkPanelUnderRunner(runner) {
  const pos = runner.worldPos || runnerWorldPosition(runner);
  const radius = NPC_RADIUS;
  const minX = Math.max(0, Math.floor(pos.x - radius));
  const maxX = Math.min(GRID_SIZE - 1, Math.floor(pos.x + radius));
  const minY = Math.max(0, Math.floor(pos.y - radius));
  const maxY = Math.min(GRID_SIZE - 1, Math.floor(pos.y + radius));
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const value = runner.grid[gy][gx];
      if (value === CELL_SPEED || value === CELL_SLOW) {
        applyPanelEffect(runner, gx, gy, value);
      }
    }
  }
}

function applyPanelEffect(runner, x, y, value) {
  if (value === CELL_SPEED) {
    runner.grid[y][x] = CELL_SPEED_USED;
    runner.effects.fastTimer = 5;
  } else if (value === CELL_SLOW) {
    runner.grid[y][x] = CELL_SLOW_USED;
    runner.effects.slowTimer = 5;
  }
  updateRunnerEffects(runner, 0);
}

function updateSpecialArea(runner, delta) {
  const special = runner.special;
  if (!special?.placed || !special.cell) {
    runner.effects.areaTimer = 0;
    return;
  }
  const pos = runner.worldPos || runnerWorldPosition(runner);
  if (isPointInsideSpecial(pos, special)) {
    special.effectTimer = SPECIAL_LINGER;
  } else if (special.effectTimer > 0) {
    special.effectTimer = Math.max(0, special.effectTimer - delta);
  }
  runner.effects.areaTimer = special.effectTimer;
}

function runnerWorldPosition(runner) {
  if (!runner.path.length) {
    return { x: ENTRANCE_X + 0.5, y: GRID_SIZE - 0.5 };
  }
  if (runner.segmentIndex >= runner.path.length - 1) {
    return centerOf(runner.path[runner.path.length - 1]);
  }
  const start = runner.path[runner.segmentIndex];
  const end = runner.path[runner.segmentIndex + 1];
  const startCenter = centerOf(start);
  const endCenter = centerOf(end);
  const segmentLength = runner.segmentLengths[runner.segmentIndex] || 1;
  const t = Math.min(1, runner.segmentProgress / segmentLength);
  return {
    x: startCenter.x + (endCenter.x - startCenter.x) * t,
    y: startCenter.y + (endCenter.y - startCenter.y) * t
  };
}

function updateState(delta) {
  padPulseTimer = (padPulseTimer + delta) % PAD_PULSE_PERIOD;
  if (state.building) {
    if (!state.paused) {
      state.buildTimeLeft = Math.max(0, state.buildTimeLeft - delta);
      if (state.buildTimeLeft <= 0) {
        startRace(true);
      }
    }
  } else if (state.race && !state.paused && !state.race.finished) {
    updateRace(delta);
  }
  updateFloatingTexts(delta);
  updateHud();
}
function updateHud() {
  if (state.mode === "menu") {
    timerEl.textContent = "Build Time: --";
    coinsEl.textContent = "Coins: --";
    scoreEl.textContent = "Score: --";
    return;
  } else if (state.paused) {
    timerEl.textContent = "Paused";
    coinsEl.textContent = "Coins: --";
  } else if (state.building) {
    timerEl.textContent = `Build Time: ${Math.max(0, state.buildTimeLeft).toFixed(1)}s`;
    coinsEl.textContent = `Coins: ${state.coins}`;
  } else if (state.race && !state.race.finished) {
    const elapsed = state.race.elapsedTime || 0;
    timerEl.textContent = `Race Time: ${elapsed.toFixed(1)}s`;
    coinsEl.textContent = "Coins: --";
  } else if (state.race && state.race.finished && state.race.elapsed !== null) {
    timerEl.textContent = `Race Time: ${state.race.elapsed.toFixed(1)}s`;
    coinsEl.textContent = "Coins: --";
  } else {
    timerEl.textContent = "Race Time: --";
    coinsEl.textContent = "Coins: --";
  }
  scoreEl.textContent = formatScoreText();
}

function formatScoreText() {
  const finished = !!(state.race && state.race.finished);
  const formatVal = (val) => {
    if (val == null) return finished ? "DNF" : "--";
    return `${val.toFixed(2)}s`;
  };
  const playerText = formatVal(state.results.player);
  const aiText = formatVal(state.results.ai);
  return `Score: You ${playerText} | AI ${aiText}`;
}

function draw() {
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const views = getViewsForRender();
  views.forEach((view, index) => {
    const offsetX = index === 0 ? 0 : VIEW_RENDER_WIDTH + VIEW_GAP;
    drawView(view, offsetX);
  });
  if (state.building) {
    drawHoverPreview();
  }
  drawFloatingTexts();
}

function getViewsForRender() {
  if (state.building) {
    return [
      { label: "You", grid: state.playerGrid, special: state.playerSpecial, runner: null, overlay: null },
      {
        label: "AI Preview",
        grid: state.baseGrid,
        special: null,
        runner: null,
        overlay: "AI layout revealed at race"
      }
    ];
  }
  if (state.race) {
    return state.race.runners.map((runner) => ({
      label: runner.label,
      grid: runner.grid,
      special: runner.special,
      runner
    }));
  }
  return [
    { label: "You", grid: state.playerGrid, special: state.playerSpecial, runner: null },
    { label: "AI", grid: state.aiGrid || state.baseGrid, special: state.aiSpecial, runner: null }
  ];
}

function drawView(view, offsetX) {
  ctx.save();
  ctx.translate(offsetX != null ? offsetX : view.offset || 0, 0);
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(0, 0, VIEW_RENDER_WIDTH, VIEW_HEIGHT);

  ctx.save();
  ctx.translate(VIEW_BORDER, 0);
  if (view.grid) {
    drawGridFrame();
    ctx.save();
    ctx.beginPath();
    ctx.rect(1, GRID_OFFSET_Y - CELL_SIZE + 1, VIEW_WIDTH - 2, (GRID_SIZE + 2) * CELL_SIZE - 2);
    ctx.clip();
    if (view.special?.placed) {
      drawSpecialOverlay(view.special);
    }
    drawCells(view.grid, view.special);
    drawEntrances();
    drawGridLines();
    if (view.runner && view.runner.worldPos) {
      const pos = view.runner.worldPos;
      ctx.fillStyle = view.runner.label === "You" ? "#ffcc00" : "#f19d38";
      ctx.beginPath();
      ctx.arc(pos.x * CELL_SIZE, GRID_OFFSET_Y + pos.y * CELL_SIZE, CELL_SIZE * NPC_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    drawGridOutline();
  }
  ctx.restore();

  if (view.overlay) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, VIEW_RENDER_WIDTH, VIEW_HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(view.overlay, VIEW_RENDER_WIDTH / 2, VIEW_HEIGHT - 40);
    ctx.textAlign = "left";
  }

  if (!state.building && view.label.startsWith("AI")) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(0, 0, VIEW_RENDER_WIDTH, VIEW_HEIGHT);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px system-ui";
  ctx.textBaseline = "top";
  ctx.fillText(view.label, VIEW_BORDER + 10, 8);

  ctx.restore();
}

function drawSpecialOverlay(special) {
  ctx.save();
  if (special.type === "radius") {
    const centerX = (special.cell.x + 0.5) * CELL_SIZE;
    const centerY = GRID_OFFSET_Y + (special.cell.y + 0.5) * CELL_SIZE;
    const radius = SPECIAL_RADIUS * CELL_SIZE;
    const innerRadius = radius - 6;
    const outerRingGrad = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, radius);
    outerRingGrad.addColorStop(0, "rgba(255,255,255,0.04)");
    outerRingGrad.addColorStop(1, "rgba(100, 170, 255, 0.25)");
    ctx.fillStyle = outerRingGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.fillStyle = "rgba(90, 160, 255, 0.08)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.fill();
  } else if (special.type === "row") {
    const y = GRID_OFFSET_Y + special.cell.y * CELL_SIZE;
    const innerY = y + CELL_SIZE * 0.25;
    const innerH = CELL_SIZE * 0.5;
    const grad = ctx.createLinearGradient(0, innerY, 0, innerY + innerH);
    grad.addColorStop(0, "rgba(150, 110, 220, 0.14)");
    grad.addColorStop(0.5, "rgba(210, 160, 255, 0.28)");
    grad.addColorStop(1, "rgba(150, 110, 220, 0.14)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, innerY, VIEW_WIDTH, innerH);
  } else if (special.type === "column") {
    const x = special.cell.x * CELL_SIZE;
    const innerX = x + CELL_SIZE * 0.25;
    const innerW = CELL_SIZE * 0.5;
    const grad = ctx.createLinearGradient(innerX, 0, innerX + innerW, 0);
    grad.addColorStop(0, "rgba(150, 110, 220, 0.14)");
    grad.addColorStop(0.5, "rgba(210, 160, 255, 0.28)");
    grad.addColorStop(1, "rgba(150, 110, 220, 0.14)");
    ctx.fillStyle = grad;
    ctx.fillRect(innerX, GRID_OFFSET_Y, innerW, GRID_SIZE * CELL_SIZE);
  }
  ctx.restore();
}

function drawCells(grid, specialForGrid) {
  if (!grid) return;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell === CELL_EMPTY) continue;
      if (cell === CELL_STATIC) {
        drawStaticBlockSprite(x, y);
        continue;
      }
      if (cell === CELL_PLAYER) {
        drawPlayerBlockSprite(x, y);
        continue;
      }
      if (cell === CELL_SPECIAL) {
        const palette = specialPaletteForCell(specialForGrid, x, y);
        drawSpecialBlockSprite(x, y, palette);
        continue;
      }
      if (isPadCell(cell)) {
        drawPadPlate(cell, x, y, cell === CELL_SPEED || cell === CELL_SLOW);
        continue;
      }
      ctx.fillStyle = cellColor(cell);
      ctx.fillRect(x * CELL_SIZE, GRID_OFFSET_Y + y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }
}

function specialPaletteForCell(special, x, y) {
  if (!special?.placed || !special.cell) return null;
  if (special.cell.x !== x || special.cell.y !== y) return null;
  if (special.type === "radius") {
    return {
      outer: "#1b3866",
      inner: "#64b6ff",
      border: "#07111f",
      highlight: "rgba(255,255,255,0.18)"
    };
  }
  if (special.type === "row" || special.type === "column") {
    return {
      outer: "#4e2a74",
      inner: "#b98cff",
      border: "#110517",
      highlight: "rgba(255,255,255,0.2)"
    };
  }
  return null;
}

function cellColor(cell) {
  switch (cell) {
    case CELL_STATIC:
      return "#6a6a6a";
    case CELL_PLAYER:
      return "#2ba84a";
    case CELL_SPEED:
      return "rgba(240, 80, 80, 0.95)";
    case CELL_SLOW:
      return "rgba(80, 140, 255, 0.95)";
    case CELL_SPEED_USED:
      return "rgba(240, 80, 80, 0.25)";
    case CELL_SLOW_USED:
      return "rgba(80, 140, 255, 0.25)";
    case CELL_SPECIAL:
      return "#f5d06b";
    default:
      return "#777";
  }
}

function drawEntrances() {
  drawEntranceCell(ENTRANCE_X, -1, "F");
  drawEntranceCell(ENTRANCE_X, GRID_SIZE, "S");
}

function drawEntranceCell(gridX, gridY, label) {
  const baseX = gridX * CELL_SIZE;
  const baseY = GRID_OFFSET_Y + gridY * CELL_SIZE;
  ctx.fillStyle = "#090909";
  ctx.fillRect(baseX, baseY, CELL_SIZE, CELL_SIZE);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(baseX + 0.5, baseY + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
  ctx.fillStyle = "#f1f1f1";
  ctx.font = "bold 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, baseX + CELL_SIZE / 2, baseY + CELL_SIZE / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawGridFrame() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(-VIEW_BORDER, GRID_OFFSET_Y - CELL_SIZE, VIEW_WIDTH + VIEW_BORDER * 2, CELL_SIZE);
  ctx.fillRect(-VIEW_BORDER, GRID_OFFSET_Y + GRID_SIZE * CELL_SIZE, VIEW_WIDTH + VIEW_BORDER * 2, CELL_SIZE);
  ctx.fillRect(-VIEW_BORDER, GRID_OFFSET_Y - CELL_SIZE, VIEW_BORDER, (GRID_SIZE + 2) * CELL_SIZE);
  ctx.fillRect(VIEW_WIDTH, GRID_OFFSET_Y - CELL_SIZE, VIEW_BORDER, (GRID_SIZE + 2) * CELL_SIZE);
}

function drawGridOutline() {
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  const left = 0.5;
  const right = VIEW_WIDTH - 0.5;
  const top = GRID_OFFSET_Y + 0.5;
  const bottom = GRID_OFFSET_Y + GRID_SIZE * CELL_SIZE - 0.5;
  const bumpTop = top - CELL_SIZE;
  const bumpBottom = bottom + CELL_SIZE;
  const entryLeft = ENTRANCE_X * CELL_SIZE + 0.5;
  const entryRight = (ENTRANCE_X + 1) * CELL_SIZE - 0.5;

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(entryLeft, top);
  ctx.lineTo(entryLeft, bumpTop);
  ctx.lineTo(entryRight, bumpTop);
  ctx.lineTo(entryRight, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.lineTo(entryRight, bottom);
  ctx.lineTo(entryRight, bumpBottom);
  ctx.lineTo(entryLeft, bumpBottom);
  ctx.lineTo(entryLeft, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.stroke();
}

function drawGridLines() {
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(0, GRID_OFFSET_Y + i * CELL_SIZE);
    ctx.lineTo(VIEW_WIDTH, GRID_OFFSET_Y + i * CELL_SIZE);
    ctx.stroke();
  }
  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, GRID_OFFSET_Y);
    ctx.lineTo(i * CELL_SIZE, GRID_OFFSET_Y + GRID_SIZE * CELL_SIZE);
    ctx.stroke();
  }
}

function drawHoverPreview() {
  if (!state.hoverCell) return;
  ctx.save();
  ctx.translate(VIEW_BORDER, 0);
  ctx.beginPath();
  ctx.rect(1, GRID_OFFSET_Y - CELL_SIZE + 1, VIEW_WIDTH - 2, (GRID_SIZE + 2) * CELL_SIZE - 2);
  ctx.clip();
  const { x, y } = state.hoverCell;
  if (state.buildMode === "special") {
    if (!state.playerSpecial || state.playerSpecial.placed || !isCellAvailableForSpecial(state.playerGrid, x, y)) {
      ctx.restore();
      return;
    }
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(x * CELL_SIZE, GRID_OFFSET_Y + y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    drawSpecialOverlay({ type: state.playerSpecial.type, cell: { x, y } });
  } else {
    if (!canPlaceBlock(state.playerGrid, x, y)) {
      ctx.restore();
      return;
    }
    const outOfCoins = state.coins <= 0;
    ctx.fillStyle = outOfCoins ? "rgba(255, 80, 80, 0.4)" : "rgba(255,255,255,0.15)";
    ctx.fillRect(x * CELL_SIZE, GRID_OFFSET_Y + y * CELL_SIZE, CELL_SIZE * 2, CELL_SIZE * 2);
  }
  ctx.restore();
}

function drawFloatingTexts() {
  ctx.font = "16px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  state.floatingTexts.forEach((t) => {
    ctx.fillStyle = applyAlpha(t.color || "#ff9999", Math.min(1, t.life));
    ctx.fillText(t.text, t.x, t.y);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function pointerToGrid(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const px = (evt.clientX - rect.left) * scaleX;
  const py = (evt.clientY - rect.top) * scaleY;
  if (px < VIEW_BORDER || px > VIEW_BORDER + VIEW_WIDTH) return null;
  const gridX = Math.floor((px - VIEW_BORDER) / CELL_SIZE);
  const gridY = Math.floor((py - GRID_OFFSET_Y) / CELL_SIZE);
  if (gridX < 0 || gridX >= GRID_SIZE) return null;
  if (gridY < 0 || gridY >= GRID_SIZE) return null;
  return { x: gridX, y: gridY };
}

function updateFloatingTexts(delta) {
  state.floatingTexts = state.floatingTexts
    .map((t) => ({ ...t, life: t.life - delta, y: t.y - delta * 40 }))
    .filter((t) => t.life > 0);
}

function addFloatingText(text, evt, color) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;
  state.floatingTexts.push({ text, x, y, life: 1.2, color });
}

function getSpecialTypeName(type) {
  if (type === "radius") return "Slow Aura";
  if (type === "row") return "Horizontal Strip";
  return "Vertical Strip";
}


function updateSpecialInfo() {
  const status = state.playerSpecial.placed ? "placed" : "ready";
  specialInfoEl.textContent = `Special: ${getSpecialTypeName(state.playerSpecial.type)} (${status})`;
  if (state.playerSpecial.placed) {
    specialButton.classList.remove("active");
  }
}

function updatePhaseLabel(text) {
  phaseEl.textContent = text;
}

function showResultPopup() {
  if (!state.results.winner) return;
  const { player, ai, winner } = state.results;
  let emoji = "😐";
  if (winner.includes("You")) emoji = "😄";
  else if (winner.includes("AI")) emoji = "😢";
  let detail = "";
  if (player != null && ai != null) {
    const diff = Math.abs(player - ai).toFixed(2);
    detail = `${winner} by ${diff}s`;
  } else {
    detail = winner;
  }
  popupEmojiEl.textContent = emoji;
  popupMessageEl.innerHTML = `${detail}<br><span class="popup-detail">You: ${player == null ? "DNF" : player.toFixed(
    2
  )}s &nbsp;|&nbsp; AI: ${ai == null ? "DNF" : ai.toFixed(2)}s</span>`;
  resultPopup.classList.remove("hidden");
}

function hideResultPopup() {
  resultPopup.classList.add("hidden");
}

function notifySpecialNeeded() {
  const x = CANVAS_WIDTH / 2;
  const y = 50;
  state.floatingTexts.push({
    text: "Place your special to begin!",
    x,
    y,
    life: 1.5,
    color: "#ffdd66"
  });
}

function showMainMenu() {
  state.mode = "menu";
  state.paused = true;
  hud.classList.add("hidden");
  menuOverlay.classList.remove("hidden");
  pauseOverlay.classList.add("hidden");
}

function hideMainMenu() {
  state.mode = "game";
  hud.classList.remove("hidden");
  menuOverlay.classList.add("hidden");
}

function showLoadingOverlay(message = "Preparing...") {
  loadingText.textContent = message;
  loadingOverlay.classList.remove("hidden");
}

function hideLoadingOverlay() {
  loadingOverlay.classList.add("hidden");
}

function showPause() {
  state.paused = true;
  pauseOverlay.classList.remove("hidden");
  updateHud();
}

function hidePause() {
  state.paused = false;
  pauseOverlay.classList.add("hidden");
  updateHud();
}

function resumeGame() {
  hidePause();
  state.mode = "game";
}

function loop(timestamp) {
  let delta = (timestamp - lastFrame) / 1000;
  lastFrame = timestamp;
  if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;

  if (state.mode === "menu" || state.paused) {
    accumulator = 0;
    requestAnimationFrame(loop);
    return;
  }

  accumulator += delta;
  while (accumulator >= FIXED_TIMESTEP) {
    updateState(FIXED_TIMESTEP);
    accumulator -= FIXED_TIMESTEP;
  }
  draw();
  requestAnimationFrame(loop);
}
// GRID HELPERS ------------------------------------------------------------

function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(CELL_EMPTY));
}

function cloneGrid(grid) {
  return grid ? grid.map((row) => row.slice()) : createEmptyGrid();
}

function generateBaseGrid(rng) {
  let grid;
  let attempts = 0;
  do {
    grid = createEmptyGrid();
    placeStaticBlocks(grid, rng);
    placePowerPanels(grid, rng);
    ensureOpenings(grid);
    attempts++;
    if (attempts > 200) break;
  } while (!hasPath(grid));
  return grid;
}

function placeStaticBlocks(grid, rng) {
  const blockCount = randomInt(rng, 8, 18);
  let attempts = 0;
  while (attempts < blockCount * 6 && countBlocks(grid, CELL_STATIC) < blockCount) {
    const x = randomInt(rng, 0, GRID_SIZE - 2);
    const y = randomInt(rng, 2, GRID_SIZE - 4);
    if (Math.abs(x - ENTRANCE_X) <= 2) {
      attempts++;
      continue;
    }
    if (canPlaceBlock(grid, x, y)) {
      placeBlock(grid, x, y, CELL_STATIC);
    }
    attempts++;
  }
}

function placePowerPanels(grid, rng) {
  const candidates = [];
  for (let y = 1; y < GRID_SIZE - 1; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === CELL_EMPTY && Math.abs(x - ENTRANCE_X) > 1) {
        candidates.push({ x, y });
      }
    }
  }
  shuffleWithRng(candidates, rng);
  const speedCount = 4;
  const slowCount = 2;
  for (let i = 0; i < speedCount && candidates.length; i++) {
    const cell = candidates.shift();
    grid[cell.y][cell.x] = CELL_SPEED;
  }
  for (let i = 0; i < slowCount && candidates.length; i++) {
    const cell = candidates.shift();
    grid[cell.y][cell.x] = CELL_SLOW;
  }
}

function ensureOpenings(grid) {
  grid[0][ENTRANCE_X] = CELL_EMPTY;
  grid[GRID_SIZE - 1][ENTRANCE_X] = CELL_EMPTY;
}

function canPlaceBlock(grid, gx, gy) {
  if (gx < 0 || gy < 0 || gx + 1 >= GRID_SIZE || gy + 1 >= GRID_SIZE) return false;
  for (let y = gy; y <= gy + 1; y++) {
    for (let x = gx; x <= gx + 1; x++) {
      if (grid[y][x] !== CELL_EMPTY) return false;
      if ((y === 0 || y === GRID_SIZE - 1) && x === ENTRANCE_X) return false;
    }
  }
  return true;
}

function placeBlock(grid, gx, gy, type) {
  for (let y = gy; y <= gy + 1; y++) {
    for (let x = gx; x <= gx + 1; x++) {
      grid[y][x] = type;
    }
  }
}

function clearBlock(grid, gx, gy) {
  for (let y = gy; y <= gy + 1; y++) {
    for (let x = gx; x <= gx + 1; x++) {
      grid[y][x] = CELL_EMPTY;
    }
  }
}

function countBlocks(grid, type) {
  let total = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === type) total++;
    }
  }
  return Math.floor(total / 4);
}

function isCellAvailableForSpecial(grid, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return false;
  if ((gy === 0 || gy === GRID_SIZE - 1) && gx === ENTRANCE_X) return false;
  return ![CELL_STATIC, CELL_PLAYER, CELL_SPECIAL].includes(grid[gy][gx]);
}

// PATHFINDING ---------------------------------------------------------------

function computePath(grid) {
  const start = { x: ENTRANCE_X, y: GRID_SIZE - 1 };
  const goal = { x: ENTRANCE_X, y: 0 };
  const raw = findPath(grid, start, goal);
  if (!raw.length) return [];
  return extendWithEntrances(raw);
}

function findPath(grid, start, goal) {
  const open = [
    {
      x: start.x,
      y: start.y,
      g: 0,
      f: heuristic(start.x, start.y, goal.x, goal.y)
    }
  ];
  const cameFrom = new Map();
  const gScore = new Map([[key(start.x, start.y), 0]]);
  const closed = new Set();

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const cKey = key(current.x, current.y);
    if (closed.has(cKey)) continue;
    closed.add(cKey);

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(cameFrom, current);
    }

    for (const move of MOVES) {
      const nx = current.x + move.dx;
      const ny = current.y + move.dy;
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
      if (!isWalkableCell(grid, nx, ny)) continue;
      if (move.diagonal && !canPassDiagonal(grid, current.x, current.y, move.dx, move.dy)) continue;
      const nk = key(nx, ny);
      const tentativeG = current.g + move.cost;
      if (tentativeG >= (gScore.get(nk) ?? Infinity)) continue;
      cameFrom.set(nk, cKey);
      gScore.set(nk, tentativeG);
      open.push({
        x: nx,
        y: ny,
        g: tentativeG,
        f: tentativeG + heuristic(nx, ny, goal.x, goal.y)
      });
    }
  }

  return [];
}

function reconstructPath(cameFrom, current) {
  const path = [{ x: current.x, y: current.y }];
  let keyPtr = key(current.x, current.y);
  while (cameFrom.has(keyPtr)) {
    const prevKey = cameFrom.get(keyPtr);
    const [px, py] = prevKey.split(",").map(Number);
    path.unshift({ x: px, y: py });
    keyPtr = prevKey;
  }
  return path;
}

function extendWithEntrances(path) {
  const extended = path.slice();
  extended.unshift({ x: ENTRANCE_X, y: GRID_SIZE });
  extended.push({ x: ENTRANCE_X, y: -1 });
  return extended;
}

function hasPath(grid) {
  return computePath(grid).length > 0;
}

function isWalkableCell(grid, x, y) {
  const value = grid[y][x];
  return (
    value === CELL_EMPTY ||
    value === CELL_SPEED ||
    value === CELL_SLOW ||
    value === CELL_SPEED_USED ||
    value === CELL_SLOW_USED
  );
}

function canPassDiagonal(grid, x, y, dx, dy) {
  const horizX = x + dx;
  const vertY = y + dy;
  if (!isWalkableCell(grid, horizX, y)) return false;
  if (!isWalkableCell(grid, x, vertY)) return false;
  return true;
}

function key(x, y) {
  return `${x},${y}`;
}

function heuristic(x, y, gx, gy) {
  return Math.hypot(gx - x, gy - y);
}

function pathDistance(grid) {
  const path = computePath(grid);
  return path.length ? computeSegmentLengths(path).reduce((a, b) => a + b, 0) : 0;
}

function computeSegmentLengths(path) {
  const lengths = [];
  for (let i = 0; i < path.length - 1; i++) {
    const start = centerOf(path[i]);
    const end = centerOf(path[i + 1]);
    lengths.push(Math.hypot(end.x - start.x, end.y - start.y));
  }
  return lengths;
}

function centerOf(node) {
  return { x: node.x + 0.5, y: node.y + 0.5 };
}

function drawPadPlate(cell, gridX, gridY, isActive) {
  const isSpeed = cell === CELL_SPEED || cell === CELL_SPEED_USED;
  const color = isSpeed ? { r: 255, g: 120, b: 120 } : { r: 120, g: 170, b: 255 };
  let inset = 10;
  let alpha = 0.32;
  let brightness = 0.45;
  if (isActive) {
    const phase = (padPulseTimer / PAD_PULSE_PERIOD) * Math.PI * 2;
    const normalized = (Math.sin(phase) + 1) / 2;
    inset = 10 - normalized * 2;
    brightness = 0.58 + normalized * 0.28;
    alpha = 0.38 + normalized * 0.32;
  }
  const r = Math.min(255, Math.round(color.r * brightness));
  const g = Math.min(255, Math.round(color.g * brightness));
  const b = Math.min(255, Math.round(color.b * brightness));
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.fillRect(
    gridX * CELL_SIZE + inset,
    GRID_OFFSET_Y + gridY * CELL_SIZE + inset,
    CELL_SIZE - inset * 2,
    CELL_SIZE - inset * 2
  );
}

function isPadCell(cell) {
  return cell === CELL_SPEED || cell === CELL_SLOW || cell === CELL_SPEED_USED || cell === CELL_SLOW_USED;
}

function drawStaticBlockSprite(gridX, gridY) {
  const baseX = gridX * CELL_SIZE;
  const baseY = GRID_OFFSET_Y + gridY * CELL_SIZE;
  ctx.save();
  drawBeveledTile(baseX, baseY, {
    outer: "#163821",
    inner: "#2e623d",
    border: "#04160a",
    highlight: "rgba(185,255,185,0.1)"
  });
  ctx.restore();
}

function drawPlayerBlockSprite(gridX, gridY) {
  const baseX = gridX * CELL_SIZE;
  const baseY = GRID_OFFSET_Y + gridY * CELL_SIZE;
  ctx.save();
  drawBeveledTile(baseX, baseY, {
    outer: "#1d6f2c",
    inner: "#2fb64d",
    border: "#0f2f11",
    highlight: "rgba(255,255,255,0.12)"
  });
  ctx.restore();
}

function drawSpecialBlockSprite(gridX, gridY, paletteOverride) {
  const baseX = gridX * CELL_SIZE;
  const baseY = GRID_OFFSET_Y + gridY * CELL_SIZE;
  ctx.save();
  drawBeveledTile(
    baseX,
    baseY,
    paletteOverride || {
      outer: "#f3cf63",
      inner: "#ffeaa2",
      border: "#3b2f10",
      highlight: "rgba(255,255,255,0.2)"
    }
  );
  ctx.restore();
}

function drawBeveledTile(baseX, baseY, palette) {
  const bevel = Math.max(3, Math.floor(CELL_SIZE * 0.18));
  const innerInset = 4;
  ctx.beginPath();
  ctx.moveTo(baseX + bevel, baseY);
  ctx.lineTo(baseX + CELL_SIZE - bevel, baseY);
  ctx.lineTo(baseX + CELL_SIZE, baseY + bevel);
  ctx.lineTo(baseX + CELL_SIZE, baseY + CELL_SIZE - bevel);
  ctx.lineTo(baseX + CELL_SIZE - bevel, baseY + CELL_SIZE);
  ctx.lineTo(baseX + bevel, baseY + CELL_SIZE);
  ctx.lineTo(baseX, baseY + CELL_SIZE - bevel);
  ctx.lineTo(baseX, baseY + bevel);
  ctx.closePath();

  ctx.fillStyle = palette.outer;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.border || "#050505";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(baseX + bevel + innerInset, baseY + innerInset);
  ctx.lineTo(baseX + CELL_SIZE - bevel - innerInset, baseY + innerInset);
  ctx.lineTo(baseX + CELL_SIZE - innerInset, baseY + bevel + innerInset);
  ctx.lineTo(baseX + CELL_SIZE - innerInset, baseY + CELL_SIZE - bevel - innerInset);
  ctx.lineTo(baseX + CELL_SIZE - bevel - innerInset, baseY + CELL_SIZE - innerInset);
  ctx.lineTo(baseX + bevel + innerInset, baseY + CELL_SIZE - innerInset);
  ctx.lineTo(baseX + innerInset, baseY + CELL_SIZE - bevel - innerInset);
  ctx.lineTo(baseX + innerInset, baseY + bevel + innerInset);
  ctx.closePath();
  ctx.fillStyle = palette.inner || "#3a3a3a";
  ctx.fill();

  ctx.strokeStyle = palette.highlight || "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.stroke();
}

// SPECIALS -----------------------------------------------------------------

function createSpecialTemplate(type = pickSpecialType(state.rng)) {
  return {
    type,
    cell: null,
    placed: false,
    effectTimer: 0
  };
}

function cloneSpecial(special) {
  if (!special) return null;
  return {
    type: special.type,
    cell: special.cell ? { ...special.cell } : null,
    placed: special.placed,
    effectTimer: 0
  };
}

function pickSpecialType(rng) {
  return SPECIAL_TYPES[randomInt(rng, 0, SPECIAL_TYPES.length - 1)];
}

function isPointInsideSpecial(pos, special) {
  if (!special?.placed || !special.cell) return false;
  const { x, y } = special.cell;
  if (special.type === "radius") {
    const dx = pos.x - (x + 0.5);
    const dy = pos.y - (y + 0.5);
    return Math.hypot(dx, dy) <= SPECIAL_RADIUS;
  }
  if (special.type === "row") {
    return pos.y >= y && pos.y <= y + 1;
  }
  if (special.type === "column") {
    return pos.x >= x && pos.x <= x + 1;
  }
  return false;
}

// RANDOM HELPERS -----------------------------------------------------------

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffleWithRng(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function applyAlpha(color, alpha) {
  if (!color) {
    return `rgba(255, 120, 120, ${alpha})`;
  }
  if (!color.startsWith("#")) {
    return color;
  }
  const rgb = hexToRgb(color);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

