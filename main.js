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
const NPC_SPEED = 3;
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
const CELL_DETOUR = 8;
const CELL_STONE = 9;
const CELL_REWIND = 10;
const CELL_DETOUR_USED = 11;
const CELL_STONE_USED = 12;
const CELL_REWIND_USED = 13;
const CELL_SINGLE = 14;
const CELL_STATIC_SPECIAL = 15;

const SPECIAL_TYPES = ["radius", "row", "column", "gravity", "lightning"];
const SPECIAL_RADIUS = 4;
const SPECIAL_LINGER = 3;
const FREEZING_BUILDUP = 10;
const SPECIAL_SLOW_MULT = 0.7;
const FREEZING_MIN_MULT = 0.3;
const LIGHTNING_STUN = 1.5;
const LIGHTNING_COOLDOWN = 3.25;
const PANEL_SLOW_MULT = 0.55;
const PANEL_FAST_MULT = 1.5;
const MEDUSA_SLOW_MULT = 0.3;
const PANEL_EFFECT_DURATION = 5;
const GRAVITY_MIN_MULT = 0.4;
const GRAVITY_MAX_MULT = 0.7;
const PAD_AI_SCORES = {
  speed: -3,
  slow: 3,
  detour: 4,
  stone: 3,
  rewind: 8
};
const SPECIAL_RADIUS_WEIGHT = 1.5;
const SPECIAL_BEAM_WEIGHT = 1.2;
const SPECIAL_GRAVITY_WEIGHT = 0.9;
const SPECIAL_LIGHTNING_WEIGHT = 2.5;
const AI_PATH_WEIGHT = 12;
const COMBO_POOL_LIMIT = 3;
const COMBO_LOOKAHEAD_DEPTH = 2;
const MIN_BLOCK_RECLAIM_DELTA = 0.4;
const RECLAIM_RUNTIME_THRESHOLD = 0.4;
const RECLAIM_MAX_PASSES = 1;
const PAD_SLOW_EXTRA_TIME = PANEL_EFFECT_DURATION * (1 / PANEL_SLOW_MULT - 1);
const PAD_SPEED_TIME_DELTA = PANEL_EFFECT_DURATION * (1 - 1 / PANEL_FAST_MULT);
const PAD_STONE_EXTRA_TIME = 2 * (1 / MEDUSA_SLOW_MULT - 1);
const PAD_TIME_TO_DISTANCE = NPC_SPEED;
const PREDICT_SLOW_SCALE = 0.82;
const SPECIAL_PLACEMENT_BONUS = 1.8;
const SPECIAL_HOTSPOT_LIMIT = 5;
const SPECIAL_HOTSPOT_TOLERANCE = 35;
const SPECIAL_PATH_GAIN_THRESHOLD = 10;
const SPECIAL_RADIUS_TIME_PER_TILE =
  (FREEZING_BUILDUP / 2) * (1 / ((SPECIAL_SLOW_MULT + FREEZING_MIN_MULT) / 2) - 1);
const SPECIAL_BEAM_TIME_PER_TILE = SPECIAL_LINGER * (1 / SPECIAL_SLOW_MULT - 1);
const BEAM_LINGER_CAP = 1.5;
const TOUCH_RIGHT_CLICK_DELAY = 450;
const TOUCH_MOVE_CANCEL_DISTANCE = 10;
const SPECIAL_GRAVITY_TIME_PER_TILE =
  SPECIAL_LINGER * (1 / ((GRAVITY_MIN_MULT + GRAVITY_MAX_MULT) / 2) - 1);
const SPECIAL_LIGHTNING_TIME = LIGHTNING_STUN;
const SPECIAL_PAD_SYNERGY_TIME = PANEL_EFFECT_DURATION * (1 / PANEL_SLOW_MULT - 1);
const SPECIAL_PAD_SYNERGY_STRONG_TIME = SPECIAL_PAD_SYNERGY_TIME * 1.25;
const SPECIAL_NEUTRAL_OVERLAP_TIME = SPECIAL_LINGER * (1 / SPECIAL_SLOW_MULT - 1) * 0.75;
const BENEFICIAL_PAD_TYPES = ["slow", "detour", "stone", "rewind"];
const AI_WEIGHT_DEFAULTS = {
  pathTime: 2,
  pathTurns: 0.3,
  specialTime: 2,
  neutralSpecialTime: 1,
  slowTime: 1.75,
  slowStack: 1,
  slowInteraction: 0.05,
  blockUsage: 3,
  lightningPadPenalty: 1.5,
  beamCrossings: 2.5
};
const aiWeights = { ...AI_WEIGHT_DEFAULTS };
const LIGHTNING_EFFECT_RADIUS = 4;
const EARLY_PATH_CELLS = 35;
const SPEED_DIVERSION_RADIUS = 3;
const QUICK_REVIEW_TRIGGER = 4;
const PLACEMENT_LOOKAHEAD_COUNT = 3;
const LOOKAHEAD_BUDGET = 0;
const LOOKAHEAD_INTERVAL = 1;
const LOOKAHEAD_TRIGGER_THRESHOLD = 0.02;
const PLACEMENT_LOOKAHEAD_WEIGHT = 0.2;
let aiLookaheadBudgetOverride = null;
const CARDINAL_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
const BUILD_MODE_ORDER = ["normal", "single", "special"];
let aiWorker = null;
let aiWorkerJobCounter = 0;
let aiBuildToken = 0;
let touchHoldTimeout = null;
let touchHoldStart = null;
let touchHoldTriggered = false;
let suppressClickAfterTouch = false;

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

const PAD_VISUALS = {
  speed: {
    color: { r: 255, g: 110, b: 110 },
    idleAlpha: 0.28,
    activeAlpha: 0.62,
    baseBrightness: 0.46,
    pulseRange: 0.32,
    iconChar: "»",
    charOffset: { x: 0, y: -0.60 },
    charScale: 0.95
  },
  slow: {
    color: { r: 120, g: 170, b: 255 },
    idleAlpha: 0.3,
    activeAlpha: 0.64,
    baseBrightness: 0.48,
    pulseRange: 0.3,
    iconChar: "≈",
    charOffset: { x: 0, y: 0.6 }
  },
  detour: {
    color: { r: 70, g: 210, b: 205 },
    idleAlpha: 0.24,
    activeAlpha: 0.55,
    baseBrightness: 0.55,
    pulseRange: 0.22,
    iconChar: "↶",
    charOffset: { x: -0.4, y: 1.8 },
    charScale: 0.83
  },
  stone: {
    color: { r: 185, g: 180, b: 168 },
    idleAlpha: 0.28,
    activeAlpha: 0.54,
    baseBrightness: 0.45,
    pulseRange: 0.18,
    iconChar: "◈",
    charOffset: { x: -0.4, y: 1 }
  },
  rewind: {
    color: { r: 255, g: 210, b: 140 },
    idleAlpha: 0.26,
    activeAlpha: 0.6,
    baseBrightness: 0.52,
    pulseRange: 0.2,
    iconChar: "↺",
    charOffset: { x: -0.4, y: 0.5 },
    charScale: 0.75
  }
};

const CATALOGUE_ITEMS = [
  {
    id: "start",
    icon: "gate-start",
    name: "Start Gate (S)",
    description: "Runner spawns here and must climb straight into the maze before steering."
  },
  {
    id: "finish",
    icon: "gate-finish",
    name: "Finish Gate (F)",
    description: "Timer stops only when the runner reaches this exit."
  },
  {
    id: "seedWall",
    icon: "wall-static",
    name: "Seed Wall",
    description: "Immovable 2×2 block generated by the seed. Neither player nor AI can refund it."
  },
  {
    id: "playerWall",
    icon: "wall-player",
    name: "Wall (2×2)",
    description: "Costs 1 wall from your pool. Blocks a 2×2 area and can be refunded during build."
  },
  {
    id: "single",
    icon: "wall-single",
    name: "Single Block (1×1)",
    description: "Costs 1 single. Perfect for fine tuning choke points."
  },
  {
    id: "speedPad",
    icon: "pad-speed",
    name: "Speed Pad",
    description: () => `Boosts runner speed to ${formatMultiplier(PANEL_FAST_MULT)} for ${PANEL_EFFECT_DURATION}s.`
  },
  {
    id: "slowPad",
    icon: "pad-slow",
    name: "Slow Pad",
    description: () => `Drops speed to ${formatMultiplier(PANEL_SLOW_MULT)} for ${PANEL_EFFECT_DURATION}s.`
  },
  {
    id: "detourPad",
    icon: "pad-detour",
    name: "Detour Pad",
    description: "Reverses the runner along its current heading until a wall or boundary is reached, then reroutes."
  },
  {
    id: "stonePad",
    icon: "pad-stone",
    name: "Stone Pad",
    description: () => `Medusa effect: locks speed to ${formatMultiplier(MEDUSA_SLOW_MULT)} until the runner changes direction.`
  },
  {
    id: "rewindPad",
    icon: "pad-rewind",
    name: "Rewind Pad",
    description: "Teleports the runner to the start gate and forces a full re-path."
  },
  {
    id: "freeze",
    icon: "special-freeze",
    name: "Freezing Field",
    description: () =>
      `Slows inside the aura from ${formatMultiplier(SPECIAL_SLOW_MULT)} down to ${formatMultiplier(
        FREEZING_MIN_MULT
      )} over ${FREEZING_BUILDUP}s. Leaving restores speed over ${SPECIAL_LINGER}s.`
  },
  {
    id: "beamRow",
    icon: "special-row",
    name: "Horizontal Slow Beam",
    description: () =>
      `Applies ${formatMultiplier(SPECIAL_SLOW_MULT)} to every runner crossing that row for ${SPECIAL_LINGER}s.`
  },
  {
    id: "beamColumn",
    icon: "special-column",
    name: "Vertical Slow Beam",
    description: () =>
      `Applies ${formatMultiplier(SPECIAL_SLOW_MULT)} to runners crossing that column for ${SPECIAL_LINGER}s.`
  },
  {
    id: "gravity",
    icon: "special-gravity",
    name: "Gravity Well",
    description: () =>
      `A ${SPECIAL_RADIUS}-tile aura that drags the runner inward, scaling speed from ${formatMultiplier(
        GRAVITY_MAX_MULT
      )} at the rim down to ${formatMultiplier(GRAVITY_MIN_MULT)} at the core.`
  },
  {
    id: "lightning",
    icon: "special-lightning",
    name: "Lightning Strike",
    description: () =>
      `Zaps runners within ${SPECIAL_RADIUS} tiles, stunning them for ${LIGHTNING_STUN}s before recharging for ${LIGHTNING_COOLDOWN}s.`
  }
];

function formatMultiplier(value) {
  return `${value.toFixed(2)}x`;
}

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const seedInput = document.getElementById("seedInput");
const newGameBtn = document.getElementById("newGame");
const randomSeedBtn = document.getElementById("randomSeed");
const setSeedBtn = document.getElementById("setSeed");
const editRetryBtn = document.getElementById("editRetry");
const timerEl = document.getElementById("timer");
const timerStatusEl = document.getElementById("timerStatus");
const statusBoard = document.getElementById("statusBoard");
const wallsCard = document.getElementById("wallsCard");
const singleCard = document.getElementById("singleCard");
const specialCard = document.getElementById("specialCard");
const wallsValueEl = document.getElementById("wallsValue");
const singleValueEl = document.getElementById("singleValue");
const specialValueEl = document.getElementById("specialValue");
const specialPreviewCanvas = document.getElementById("specialPreview");
const specialPreviewCtx = specialPreviewCanvas?.getContext("2d");
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
const catalogueButton = document.getElementById("catalogueButton");
const catalogueOverlay = document.getElementById("catalogueOverlay");
const closeCatalogueBtn = document.getElementById("closeCatalogue");
const catalogueListEl = document.getElementById("catalogueList");
const resultPopup = document.getElementById("resultPopup");
const resultCard = resultPopup?.querySelector(".result-card");
const popupMessageEl = document.getElementById("popupMessage");
const popupEmojiEl = document.getElementById("popupEmoji");
const popupCloseBtn = document.getElementById("closePopup");
const shareResultBtn = document.getElementById("shareResult");
const menuVsBtn = document.getElementById("menuVs");
const vsToggleBtn = document.getElementById("vsToggle");
const vsPanel = document.getElementById("vsPanel");
const vsCreateBtn = document.getElementById("vsCreate");
const vsJoinBtn = document.getElementById("vsJoin");
const vsRoomInput = document.getElementById("vsRoomInput");
const vsReadyBtn = document.getElementById("vsReadyBtn");
const vsStatusEl = document.getElementById("vsStatus");
const vsTryAgainBtn = document.getElementById("vsTryAgain");
const vsNewGameBtn = document.getElementById("vsNewGame");
const vsChoiceStatus = document.getElementById("vsChoiceStatus");
const seedControls = [
  document.querySelector(".seed-field"),
  document.getElementById("setSeed"),
  document.getElementById("randomSeed"),
  document.getElementById("newGame"),
  document.getElementById("editRetry")
];
const vsUiControls = [vsToggleBtn, vsPanel];
function clearCanvas() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

const state = {
  rng: mulberry32(1),
  seed: "",
  building: true,
  buildTimeLeft: 0,
  coins: 0,
  coinBudget: 0,
  singleBlocks: 0,
  singleBudget: 0,
  playerBlocks: [],
  playerSingles: [],
  playerGrid: createEmptyGrid(),
  baseGrid: null,
  baseStaticCount: 0,
  aiGrid: null,
  aiWalls: [],
  aiSingles: [],
  aiPlacementOrder: [],
  aiProfile: null,
  aiProfileSource: null,
  aiBuildPromise: null,
  aiJobId: 0,
  hoverCell: null,
  floatingTexts: [],
  buildMode: "normal",
  specialTemplate: null,
  playerSpecial: null,
  aiSpecial: null,
  baseNeutralSpecials: [],
  neutralSpecials: [],
  race: null,
  results: { player: null, ai: null, winner: null },
  mode: "menu",
  paused: false,
  waitingForSpecial: false,
  catalogueOpen: false,
  vs: {
    active: false,
    room: null,
    connected: false,
    ready: false,
    startsAt: null,
    timerId: null,
    opponentMaze: null,
    role: null,
    selfLabel: "You",
    oppLabel: "Foe",
    selfShort: "You",
    oppShort: "Foe",
    buildStartsAt: null,
    buildEndsAt: null,
    waitingForStart: false,
    choiceSelf: null,
    choicePeer: null,
    lastSeed: "",
    rematchMode: null
  }
};
let padPulseTimer = 0;
let cataloguePrevPaused = false;

seedInput.value = Math.floor(Math.random() * 1e9).toString();
setupListeners();
prewarmAiWorker();
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
  editRetryBtn?.addEventListener("click", editAndRetry);
  wallsCard?.addEventListener("click", () => {
    if (!state.building || state.coins <= 0) return;
    setBuildMode("normal");
  });
  specialCard?.addEventListener("click", () => {
    if (!state.building || state.playerSpecial.placed) return;
    setBuildMode("special");
  });
  singleCard?.addEventListener("click", () => {
    if (!state.building || state.singleBlocks <= 0) return;
    setBuildMode("single");
  });
  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("contextmenu", handleRightClick);
  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd);
  canvas.addEventListener("touchcancel", handleTouchEnd);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseleave", () => (state.hoverCell = null));
  popupCloseBtn.addEventListener("click", hideResultPopup);
  menuSingleBtn.addEventListener("click", () => startFromMenu());
  menuVsBtn?.addEventListener("click", startVsFromMenu);
  menuQuitBtn.addEventListener("click", () => {
    window.close();
  });
  menuButton.addEventListener("click", () => {
    if (state.vs.active) {
      const ok = window.confirm("Leaving will exit the lobby. Continue?");
      if (!ok) return;
      leaveVsMode();
    }
    showMainMenu();
  });
  resumeBtn.addEventListener("click", resumeGame);
  pauseMenuBtn.addEventListener("click", () => {
    showMainMenu();
    hidePause();
  });
  catalogueButton?.addEventListener("click", openCatalogue);
  closeCatalogueBtn?.addEventListener("click", closeCatalogue);
  catalogueOverlay?.addEventListener("click", (evt) => {
    if (evt.target === catalogueOverlay) closeCatalogue();
  });
  shareResultBtn?.addEventListener("click", handleShareResult);
  vsToggleBtn?.addEventListener("click", toggleVsPanel);
  vsCreateBtn?.addEventListener("click", () => connectVs("create"));
  vsJoinBtn?.addEventListener("click", () => connectVs("join", vsRoomInput?.value?.trim()));
  vsReadyBtn?.addEventListener("click", () => sendVsReady());
  vsTryAgainBtn?.addEventListener("click", () => setVsChoice("same"));
  vsNewGameBtn?.addEventListener("click", () => setVsChoice("new"));
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && state.catalogueOpen) {
      closeCatalogue();
      return;
    }
    if (evt.key === "Escape" && state.mode === "game") {
      if (state.vs.active) return;
      if (state.paused) resumeGame();
      else showPause();
    }
  });
}

function startGame(seedText) {
  applyVsVisibility(state.vs.active);
  cancelAiBuild();
  const safeSeed = seedText || Date.now().toString();
  state.seed = safeSeed;
  seedInput.value = safeSeed;
  state.rng = mulberry32(hashSeed(safeSeed));
  closeCatalogue();

  const baseGeneration = generateBaseGrid(state.rng);
  state.baseGrid = baseGeneration.grid;
  state.baseStaticCount = countCells(state.baseGrid, CELL_STATIC);
  state.baseNeutralSpecials = baseGeneration.neutralSpecial ? [baseGeneration.neutralSpecial] : [];
  state.neutralSpecials = state.baseNeutralSpecials.map(cloneSpecial);
  state.playerGrid = cloneGrid(state.baseGrid);
  state.aiGrid = null;
  state.aiWalls = [];
  state.aiSingles = [];
  state.aiBuildPromise = null;
  state.aiJobId = 0;
  state.vs.opponentMaze = null;
  state.vs.startsAt = null;
  state.coins = randomInt(state.rng, 10, 21);
  state.coinBudget = state.coins;
  const singleCount = state.rng() < 0.1 ? 2 : 1;
  state.singleBlocks = singleCount;
  state.singleBudget = singleCount;
  state.playerBlocks = [];
  state.playerSingles = [];
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
  setBuildMode("normal");
  updateSpecialInfo();
  updatePhaseLabel("Phase: Build");
  hideResultPopup();
  state.mode = "game";
  state.paused = false;
  hud.classList.remove("hidden");
  canvas.classList.remove("vs-waiting");
  setSeedUiVisible(!state.vs.active);
  setVsUiVisible(state.vs.active);
  // Kick off AI generation in the background (async, non-blocking) unless in VS mode.
  if (!state.vs.active) {
    const buildToken = ++aiBuildToken;
    state.aiBuildPromise = buildAiLayoutViaWorker()
      .catch((err) => {
        console.warn("AI worker failed; falling back to main thread", err);
        return buildAiLayoutAsync();
      })
      .then((aiLayout) => {
        if (buildToken !== aiBuildToken) return null;
        if (!aiLayout) return null;
        state.aiGrid = aiLayout.grid;
        state.aiSpecial = aiLayout.special;
        state.aiLookaheadUsed = aiLayout.lookaheadUsed || 0;
        state.aiPlacementOrder = aiLayout.placementOrder || [];
        state.aiProfile = aiLayout.profile || null;
        return aiLayout;
      })
      .finally(() => {
        if (buildToken !== aiBuildToken) return;
      });
  } else {
    state.aiBuildPromise = null;
    state.aiGrid = null;
    state.aiSpecial = null;
  }
}

function toggleVsPanel() {
  if (vsPanel?.classList.contains("hidden")) {
    vsPanel.classList.remove("hidden");
    state.vs.active = true;
    connectVs();
  } else {
    vsPanel.classList.add("hidden");
    state.vs.active = false;
  }
}

function connectVs(mode, roomCode = "") {
  vsConnect(handleVsEvent);
  state.vs.active = true;
  vsPanel?.classList.remove("hidden");
  if (mode === "create") {
    vsCreateRoom();
  } else if (mode === "join" && roomCode) {
    vsJoinRoom(roomCode);
  }
  updateVsStatus("Connecting...");
}

function sendVsReady() {
  if (!state.vs.room) return;
  vsReady(state.vs.room);
}

function handleVsEvent(evt) {
  if (evt.type === "connected") {
    state.vs.connected = true;
    updateVsStatus("Connected. Create or join a room.");
    setVsWaitingTimer();
    return;
  }
  if (evt.type === "disconnected") {
    state.vs.connected = false;
    updateVsStatus("Disconnected.");
    return;
  }
  if (evt.type === "created") {
    state.vs.room = evt.room;
    updateVsStatus(`Room ${evt.room} created. Share code and press Ready.`);
    if (vsRoomInput) vsRoomInput.value = evt.room;
    setVsWaitingTimer();
    state.vs.role = "host";
    state.vs.selfLabel = "You";
    state.vs.oppLabel = "Foe";
    state.vs.selfShort = "P1";
    state.vs.oppShort = "P2";
    return;
  }
  if (evt.type === "joined") {
    state.vs.room = evt.room;
    updateVsStatus(`Joined room ${evt.room}. Press Ready.`);
    setVsWaitingTimer();
    state.vs.role = "guest";
    state.vs.selfLabel = "You";
    state.vs.oppLabel = "Foe";
    state.vs.selfShort = "P2";
    state.vs.oppShort = "P1";
    return;
  }
  if (evt.type === "peer-joined") {
    updateVsStatus("Peer joined. Press Ready.");
    setVsWaitingTimer();
    return;
  }
  if (evt.type === "peer-left") {
    updateVsStatus("Peer left.");
    alert("Peer disconnected from the lobby.");
    state.vs.waitingForStart = true;
    state.vs.opponentMaze = null;
    return;
  }
  if (evt.type === "ready") {
    updateVsStatus(`Ready count: ${evt.count || 0}`);
    return;
  }
  if (evt.type === "start") {
    state.vs.startsAt = evt.startsAt;
    updateVsStatus("Match starting...");
    const agreed = state.vs.choiceSelf && state.vs.choiceSelf === state.vs.choicePeer ? state.vs.choiceSelf : null;
    state.vs.rematchMode = agreed;
    state.vs.choiceSelf = null;
    state.vs.choicePeer = null;
    const useSeed =
      agreed === "same" ? state.vs.lastSeed || evt.seed || Date.now().toString() : evt.seed || Date.now().toString();
    state.vs.lastSeed = useSeed;
    if (agreed === "same") {
      editAndRetry();
      state.vs.buildStartsAt = evt.startsAt;
      state.vs.buildEndsAt = evt.startsAt + (evt.buildSeconds || VS_BUILD_SECONDS) * 1000;
      state.vs.waitingForStart = false;
      canvas.classList.remove("vs-waiting");
      startVsCountdown(evt.startsAt, evt.buildSeconds || VS_BUILD_SECONDS);
    } else {
      startGame(useSeed);
      canvas.classList.remove("vs-waiting");
      startVsCountdown(evt.startsAt, evt.buildSeconds || VS_BUILD_SECONDS);
    }
    return;
  }
  if (evt.type === "maze") {
    state.vs.opponentMaze = evt.payload;
    updateVsStatus("Opponent maze received.");
    maybeStartVsRace();
    return;
  }
  if (evt.type === "rematch") {
    state.vs.choicePeer = evt.choice || null;
    updateVsChoiceStatus();
    checkVsChoiceReady();
    return;
  }
  if (evt.type === "error") {
    updateVsStatus(`Error: ${evt.error}`);
    return;
  }
}

function updateVsStatus(text) {
  if (vsStatusEl) vsStatusEl.textContent = text;
}

function startVsCountdown(startsAt, buildSeconds) {
  if (state.vs.timerId) {
    clearInterval(state.vs.timerId);
    state.vs.timerId = null;
  }
  state.vs.buildStartsAt = startsAt;
  state.vs.buildEndsAt = startsAt + buildSeconds * 1000;
  state.vs.waitingForStart = false;
  const endAt = startsAt + buildSeconds * 1000;
  const tick = () => {
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((endAt - now) / 1000));
    if (remaining <= 0) {
      clearInterval(state.vs.timerId);
      state.vs.timerId = null;
      lockPlayerBuild();
      sendVsMaze();
      maybeStartVsRace();
      updateVsChoiceStatus();
    }
  };
  tick();
  state.vs.timerId = setInterval(tick, 200);
}

function lockPlayerBuild() {
  state.building = false;
}

function sendVsMaze() {
  if (!state.vs.room) return;
  state.vs.lastSeed = state.seed;
  const payload = {
    grid: state.playerGrid,
    special: state.playerSpecial
  };
  vsSendMaze(state.vs.room, payload);
  updateVsStatus("Sent your maze, waiting for opponent...");
}

function maybeStartVsRace() {
  if (!state.vs.opponentMaze) return;
  state.aiGrid = cloneGrid(state.vs.opponentMaze.grid || state.vs.opponentMaze);
  state.aiSpecial = state.vs.opponentMaze.special ? cloneSpecial(state.vs.opponentMaze.special) : null;
  state.aiBuildPromise = Promise.resolve();
  startRace(true);
  updateVsStatus("Running race!");
}

function editAndRetry() {
  if (!state.seed) return;
  state.building = true;
  state.buildTimeLeft = BUILD_DURATION / 1000;
  state.waitingForSpecial = false;
  state.race = null;
  state.results = { player: null, ai: null, winner: null };
  resetPadStates(state.playerGrid);
  resetPadStates(state.aiGrid);
  if (state.playerSpecial) state.playerSpecial.effectTimer = 0;
  if (state.aiSpecial) state.aiSpecial.effectTimer = 0;
  state.neutralSpecials = state.baseNeutralSpecials.map(cloneSpecial);
  updatePhaseLabel("Phase: Build");
  hideResultPopup();
  updateHud();
}

function resetPadStates(grid) {
  if (!grid) return;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === CELL_SPEED_USED) grid[y][x] = CELL_SPEED;
      else if (grid[y][x] === CELL_SLOW_USED) grid[y][x] = CELL_SLOW;
      else if (grid[y][x] === CELL_DETOUR_USED) grid[y][x] = CELL_DETOUR;
      else if (grid[y][x] === CELL_STONE_USED) grid[y][x] = CELL_STONE;
      else if (grid[y][x] === CELL_REWIND_USED) grid[y][x] = CELL_REWIND;
    }
  }
}

function startFromMenu() {
  showLoadingOverlay("Preparing...");
  requestAnimationFrame(() => {
    state.vs.active = false;
    setVsUiVisible(false);
    cancelAiBuild();
    clearCurrentGameState();
    applyVsVisibility(false);
    startGame(seedInput.value);
    hideLoadingOverlay();
    hideMainMenu();
  });
}

function startVsFromMenu() {
  showLoadingOverlay("Preparing VS...");
  requestAnimationFrame(() => {
    cancelAiBuild();
    clearCurrentGameState();
    state.vs.active = true;
    state.vs.room = null;
    state.vs.opponentMaze = null;
    state.vs.startsAt = null;
    state.vs.waitingForStart = true;
    state.vs.choiceSelf = null;
    state.vs.choicePeer = null;
    state.vs.rematchMode = null;
    state.vs.buildStartsAt = null;
    state.vs.buildEndsAt = null;
    vsPanel?.classList.remove("hidden");
    connectVs();
    hideLoadingOverlay();
    hideMainMenu();
    // Dim playfield while waiting
    canvas.classList.add("vs-waiting");
    setSeedUiVisible(false);
    setVsUiVisible(true);
    applyVsVisibility(true);
    setVsWaitingTimer();
    updateSpecialInfo();
    updateHud();
  });
}

function hasBuildResources() {
  return (state.coins || 0) > 0 || (state.singleBlocks || 0) > 0;
}

function allStructuresPlaced() {
  return (state.coins || 0) <= 0 && (state.singleBlocks || 0) <= 0 && Boolean(state.playerSpecial?.placed);
}

function handlePlacementComplete(evt) {
  updateResourceCards();
  if (state.vs.active) return;
  if (allStructuresPlaced()) {
    if (!state.playerSpecial.placed && evt) {
      addFloatingText("Structures placed! Add your special to begin.", evt, "#99ff99");
      setBuildMode("special");
    }
    startRace();
  }
}

function releaseSpecialWaitIfResources(prevWalls, prevSingles) {
  if (!state.waitingForSpecial) return;
  if ((prevWalls === 0 && state.coins > 0) || (prevSingles === 0 && state.singleBlocks > 0)) {
    state.waitingForSpecial = false;
  }
}

function handleCanvasClick(evt) {
  if (suppressClickAfterTouch) {
    suppressClickAfterTouch = false;
    evt.preventDefault?.();
    return;
  }
  if (!state.building) return;
  const cell = pointerToGrid(evt);
  if (!cell) return;

  if (state.buildMode === "special") {
    if (state.playerSpecial.placed) {
      addFloatingText("Special already placed", evt);
      return;
    }
    if (tryPlaceSpecial(state.playerGrid, cell.x, cell.y, state.playerSpecial)) {
      autoSelectNextBuildMode("special", state.playerSpecial?.placed);
      updateSpecialInfo();
      if (allStructuresPlaced()) {
        startRace();
      }
    } else {
      addFloatingText("Can't place special there", evt);
    }
    return;
  }

  if (state.buildMode === "single") {
    if (state.singleBlocks <= 0) {
      addFloatingText("No single blocks left!", evt, "#ff9c6b");
      if (state.coins > 0) setBuildMode("normal");
      return;
    }
    if (!tryPlaceSingleBlock(state.playerGrid, cell.x, cell.y)) {
      addFloatingText("Invalid placement", evt);
      return;
    }
    state.playerSingles.push({ x: cell.x, y: cell.y });
    state.singleBlocks -= 1;
    autoSelectNextBuildMode("single", state.singleBlocks <= 0);
    handlePlacementComplete(evt);
    return;
  }

  if (state.coins <= 0) {
    if (state.singleBlocks > 0) {
      addFloatingText("No walls left! Switch to the single block card.", evt, "#ffb36b");
      setBuildMode("single");
    } else if (!state.playerSpecial.placed) {
      addFloatingText("Structures placed! Add your special to begin.", evt, "#99ff99");
      setBuildMode("special");
    }
    return;
  }

  if (!tryPlaceBlock(state.playerGrid, cell.x, cell.y)) {
    addFloatingText("Invalid placement", evt);
    return;
  }
  state.playerBlocks.push({ x: cell.x, y: cell.y });
  state.coins -= 1;
  autoSelectNextBuildMode("normal", state.coins <= 0);
  handlePlacementComplete(evt);
}

function handleRightClick(evt) {
  evt.preventDefault();
  if (!state.building) return;
  const cell = pointerToGrid(evt);
  if (!cell) return;

  if (state.playerSpecial.placed && cell.x === state.playerSpecial.cell.x && cell.y === state.playerSpecial.cell.y) {
    state.playerGrid[cell.y][cell.x] = CELL_EMPTY;
    state.playerSpecial = createSpecialTemplate(state.specialTemplate.type);
    setBuildMode("normal");
    updateSpecialInfo();
    return;
  }

  const idx = state.playerBlocks.findIndex(
    (block) => cell.x >= block.x && cell.x <= block.x + 1 && cell.y >= block.y && cell.y <= block.y + 1
  );
  if (idx !== -1) {
    clearBlock(state.playerGrid, state.playerBlocks[idx].x, state.playerBlocks[idx].y);
    state.playerBlocks.splice(idx, 1);
    const prevCoins = state.coins;
    state.coins = Math.min(state.coins + 1, state.coinBudget);
    releaseSpecialWaitIfResources(prevCoins, state.singleBlocks);
    updateResourceCards();
    return;
  }

  const singleIdx = state.playerSingles.findIndex((block) => cell.x === block.x && cell.y === block.y);
  if (singleIdx === -1) return;
  if (state.playerGrid[cell.y][cell.x] === CELL_SINGLE) {
    state.playerGrid[cell.y][cell.x] = CELL_EMPTY;
  }
  state.playerSingles.splice(singleIdx, 1);
  const prevSingles = state.singleBlocks;
  state.singleBlocks = Math.min(state.singleBlocks + 1, state.singleBudget);
  releaseSpecialWaitIfResources(state.coins, prevSingles);
  updateResourceCards();
}

function handleTouchStart(evt) {
  if (evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  touchHoldStart = { x: touch.clientX, y: touch.clientY };
  touchHoldTriggered = false;
  clearTimeout(touchHoldTimeout);
  touchHoldTimeout = setTimeout(() => {
    touchHoldTriggered = true;
    suppressClickAfterTouch = true;
    handleRightClick({
      clientX: touchHoldStart.x,
      clientY: touchHoldStart.y,
      preventDefault: () => evt.preventDefault()
    });
  }, TOUCH_RIGHT_CLICK_DELAY);
}

function handleTouchMove(evt) {
  if (!touchHoldStart) return;
  if (evt.touches.length !== 1) {
    cancelTouchHold();
    return;
  }
  const touch = evt.touches[0];
  const dx = Math.abs(touch.clientX - touchHoldStart.x);
  const dy = Math.abs(touch.clientY - touchHoldStart.y);
  if (dx > TOUCH_MOVE_CANCEL_DISTANCE || dy > TOUCH_MOVE_CANCEL_DISTANCE) {
    cancelTouchHold();
  }
}

function handleTouchEnd(evt) {
  if (touchHoldTriggered) {
    evt.preventDefault();
    setTimeout(() => {
      suppressClickAfterTouch = false;
    }, 400);
  }
  cancelTouchHold();
}

function cancelTouchHold() {
  clearTimeout(touchHoldTimeout);
  touchHoldTimeout = null;
  touchHoldStart = null;
  touchHoldTriggered = false;
}

function handleMouseMove(evt) {
  if (!state.building) {
    state.hoverCell = null;
    return;
  }
  const cell = pointerToGrid(evt);
  state.hoverCell = cell;
}

function setBuildMode(mode = "normal") {
  if (!state.building) {
    mode = "normal";
  } else if (mode === "special" && state.playerSpecial?.placed) {
    mode = "normal";
  }
  if (mode === "normal" && state.coins <= 0) {
    if (state.singleBlocks > 0) mode = "single";
    else if (!state.playerSpecial?.placed) mode = "special";
  }
  if (mode === "single" && state.singleBlocks <= 0) {
    if (state.coins > 0) mode = "normal";
    else if (!state.playerSpecial?.placed) mode = "special";
    else mode = "normal";
  }
  state.buildMode = mode;
  updateCurrencySelection();
}

function isModeAvailable(mode) {
  if (!state.building) return false;
  if (mode === "normal") return state.coins > 0;
  if (mode === "single") return state.singleBlocks > 0;
  if (mode === "special") return state.playerSpecial && !state.playerSpecial.placed;
  return false;
}

function autoSelectNextBuildMode(currentMode, shouldSwitch = true) {
  if (!state.building || !shouldSwitch) return false;
  const startIndex = BUILD_MODE_ORDER.indexOf(currentMode ?? state.buildMode);
  const baseIndex = startIndex >= 0 ? startIndex : BUILD_MODE_ORDER.indexOf(state.buildMode);
  for (let i = 1; i <= BUILD_MODE_ORDER.length; i++) {
    const idx = ((baseIndex >= 0 ? baseIndex : -1) + i + BUILD_MODE_ORDER.length) % BUILD_MODE_ORDER.length;
    const nextMode = BUILD_MODE_ORDER[idx];
    if (!isModeAvailable(nextMode) || nextMode === state.buildMode) continue;
    setBuildMode(nextMode);
    showModeSwitchMessage(nextMode);
    return true;
  }
  return false;
}

function buildModeLabel(mode) {
  if (mode === "normal") return "Walls";
  if (mode === "single") return "Singles";
  if (mode === "special") return "Special";
  return "Build";
}

function showModeSwitchMessage(mode) {
  if (state.mode !== "game") return;
  const label = buildModeLabel(mode);
  state.floatingTexts.push({
    text: `Switched to ${label}`,
    x: CANVAS_WIDTH / 2,
    y: 70,
    life: 1.2,
    color: "#9cffaf"
  });
}

function renderSpecialPreview() {
  if (!specialPreviewCtx || !specialPreviewCanvas) return;
  const ctxPreview = specialPreviewCtx;
  ctxPreview.clearRect(0, 0, specialPreviewCanvas.width, specialPreviewCanvas.height);
  if (!state.playerSpecial) return;
  const previewSpecial = { ...state.playerSpecial, placed: true, cell: { x: 0, y: 0 } };
  const palette = specialPaletteForCell(previewSpecial, 0, 0);
  if (!palette) return;
  drawSpecialBlockSprite(0, 0, palette, ctxPreview, 0);
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

function tryPlaceSingleBlock(grid, gx, gy) {
  if (!canPlaceSingle(grid, gx, gy)) return false;
  grid[gy][gx] = CELL_SINGLE;
  ensureOpenings(grid);
  if (!hasPath(grid)) {
    grid[gy][gx] = CELL_EMPTY;
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
  return true;
}

async function startRace(forceStart = false) {
  if (state.vs.active) {
    if (!forceStart && !state.vs.opponentMaze) return;
  } else if (!state.building && !forceStart) return;
  if (!state.playerSpecial.placed && !forceStart) {
    if (!state.waitingForSpecial) {
      if (hasBuildResources()) {
        notifySpecialNeeded();
      }
      state.waitingForSpecial = true;
    }
    return;
  }
  state.waitingForSpecial = false;
  state.building = false;
  state.buildTimeLeft = 0;
  state.hoverCell = null;
  setBuildMode("normal");

  const playerGrid = cloneGrid(state.playerGrid);
  const playerSpecial = cloneSpecial(state.playerSpecial);

  if (!state.aiGrid || !state.aiSpecial) {
    if (state.vs.active && state.vs.opponentMaze) {
      state.aiGrid = cloneGrid(state.vs.opponentMaze.grid || state.vs.opponentMaze);
      state.aiSpecial = state.vs.opponentMaze.special ? cloneSpecial(state.vs.opponentMaze.special) : null;
      state.aiBuildPromise = Promise.resolve();
    } else {
      if (state.aiBuildPromise) {
        try {
          const aiLayout = await state.aiBuildPromise;
          if (aiLayout) {
            state.aiGrid = aiLayout.grid;
            state.aiSpecial = aiLayout.special;
            state.aiLookaheadUsed = aiLayout.lookaheadUsed || 0;
            state.aiPlacementOrder = aiLayout.placementOrder || [];
            state.aiProfile = aiLayout.profile || null;
            state.aiProfileSource = aiLayout.profile?.source || "unknown";
          }
        } catch (err) {
          console.error("AI build failed, falling back to sync build", err);
        }
      }
      if (!state.aiGrid || !state.aiSpecial) {
        const aiLayout = buildAiLayout();
        state.aiGrid = aiLayout.grid;
        state.aiSpecial = aiLayout.special;
        state.aiLookaheadUsed = aiLayout.lookaheadUsed || 0;
        state.aiPlacementOrder = aiLayout.placementOrder || [];
        state.aiProfile = aiLayout.profile || null;
        state.aiProfileSource = aiLayout.profile?.source || "sync-fallback";
      }
    }
  }

  const playerLabel = state.vs.active ? state.vs.selfLabel || "You" : "You";
  const playerRunner = createRunner(playerLabel, playerGrid, playerSpecial, state.baseNeutralSpecials);
  const aiLabel = state.vs.active ? state.vs.oppLabel || "Foe" : "AI";
  const aiRunner = createRunner(aiLabel, state.aiGrid, cloneSpecial(state.aiSpecial), state.baseNeutralSpecials);

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

function currentLookaheadBudget() {
  return aiLookaheadBudgetOverride != null
    ? Math.max(0, aiLookaheadBudgetOverride | 0)
    : LOOKAHEAD_BUDGET;
}

function buildAiLayout() {
  const t0 = performance.now();
  const grid = cloneGrid(state.baseGrid);
  const special = createSpecialTemplate(state.specialTemplate.type);
  const neutralSpecials = state.baseNeutralSpecials || [];
  let wallsLeft = state.coinBudget;
  let singlesLeft = state.singleBudget || 0;
  let currentScore = evaluateGridForAi(grid, special, neutralSpecials);
  state.aiWalls = [];
  state.aiSingles = [];
  const placementOrder = [];
  const lookaheadState = {
    remaining: currentLookaheadBudget(),
    interval: LOOKAHEAD_INTERVAL,
    index: 0,
    used: 0
  };
  const maxIterations = Math.max(1, wallsLeft + singlesLeft);
  const tPlaceStart = performance.now();
  for (let i = 0; i < maxIterations; i++) {
    if (wallsLeft <= 0 && singlesLeft <= 0) break;
    const pathInfo = analyzePath(grid);
    if (!pathInfo) break;
    const specialHotspots = !special.placed ? computeSpecialHotspots(grid, special, neutralSpecials) : [];
    const placement = findBestAiPlacement(
      grid,
      currentScore,
      special,
      neutralSpecials,
      pathInfo,
      lookaheadState,
      { wallsLeft, singlesLeft, specialHotspots },
      wallsLeft > 0,
      singlesLeft > 0
    );
    if (!placement) break;
    if (placement.type === "wall" && wallsLeft > 0) {
      placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
      ensureOpenings(grid);
      wallsLeft--;
      state.aiWalls.push({ x: placement.x, y: placement.y });
      placementOrder.push({ type: "wall", row: placement.y + 1, column: placement.x + 1 });
    } else if (placement.type === "single" && singlesLeft > 0) {
      grid[placement.y][placement.x] = CELL_SINGLE;
      ensureOpenings(grid);
      state.aiSingles.push({ x: placement.x, y: placement.y });
      singlesLeft--;
      placementOrder.push({ type: "single", row: placement.y + 1, column: placement.x + 1 });
    } else {
      break;
    }
    currentScore = placement.score;
  }
  const tPlaceEnd = performance.now();
  const tSpecialStart = performance.now();
  currentScore = reduceMandatorySpeedPads(grid, special, neutralSpecials, currentScore);
  const finalHotspots = computeSpecialHotspots(grid, special, neutralSpecials);
  placeAiSpecial(grid, special, neutralSpecials, finalHotspots);
  if (special?.cell) {
    placementOrder.push({ type: "special", row: special.cell.y + 1, column: special.cell.x + 1 });
  }
  const tSpecialEnd = performance.now();
  const tReclaimStart = performance.now();
  const reclaimStats = reclaimAndReallocateBlocks(grid, special, neutralSpecials, placementOrder);
  placementOrder.reallocations = reclaimStats.reallocated || 0;
  placementOrder.reallocationPasses = reclaimStats.passes || 0;
  annotatePlacementImpacts(grid, special, neutralSpecials, placementOrder);
  const tReclaimEnd = performance.now();
  const profile = {
    totalMs: +(performance.now() - t0).toFixed(2),
    placementMs: +(tPlaceEnd - tPlaceStart).toFixed(2),
    specialMs: +(tSpecialEnd - tSpecialStart).toFixed(2),
    reclaimMs: +(tReclaimEnd - tReclaimStart).toFixed(2),
    lookaheadUsed: lookaheadState.used || 0,
    placements: placementOrder.length,
    worker: false,
    source: "main-thread"
  };
  state.aiProfile = profile;
  state.aiProfileSource = profile.source;
  return { grid, special, lookaheadUsed: lookaheadState.used || 0, placementOrder, profile };
}

function setSeedUiVisible(show) {
  seedControls.forEach((el) => {
    if (!el) return;
    if (show) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

function setVsUiVisible(show) {
  vsUiControls.forEach((el) => {
    if (!el) return;
    if (show) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

function applyVsVisibility(active) {
  if (typeof document !== "undefined") {
    document.body.classList.toggle("vs-mode", active);
  }
  if (!active) {
    vsPanel?.classList.add("hidden");
  }
}

function setVsWaitingTimer() {
  const timerEl = document.getElementById("timer");
  const statusEl = document.getElementById("timerStatus");
  if (statusEl) statusEl.textContent = "Waiting for other player";
  if (timerEl) timerEl.textContent = "--";
  if (vsChoiceStatus) vsChoiceStatus.textContent = "";
}

function leaveVsMode() {
  state.vs.active = false;
  state.vs.room = null;
  state.vs.opponentMaze = null;
  state.vs.startsAt = null;
  state.vs.waitingForStart = false;
  state.vs.choiceSelf = null;
  state.vs.choicePeer = null;
  state.vs.buildEndsAt = null;
  if (state.vs.timerId) {
    clearInterval(state.vs.timerId);
    state.vs.timerId = null;
  }
  canvas.classList.remove("vs-waiting");
  setSeedUiVisible(true);
  setVsUiVisible(false);
  applyVsVisibility(false);
  if (versusClient.ws) {
    try {
      versusClient.ws.close();
    } catch (_) {}
  }
  versusClient.ws = null;
  updateVsStatus("Disconnected.");
}

function clearCurrentGameState() {
  state.building = false;
  state.waitingForSpecial = false;
  state.coins = 0;
  state.coinBudget = 0;
  state.singleBlocks = 0;
  state.singleBudget = 0;
  state.playerBlocks = [];
  state.playerSingles = [];
  state.playerGrid = createEmptyGrid();
  state.baseGrid = createEmptyGrid();
  state.baseNeutralSpecials = [];
  state.neutralSpecials = [];
  state.baseStaticCount = 0;
  state.playerSpecial = null;
  state.aiSpecial = null;
  state.specialTemplate = null;
  state.aiGrid = createEmptyGrid();
  state.aiPlacementOrder = [];
  state.aiProfile = null;
  state.aiProfileSource = null;
  state.aiBuildPromise = null;
  state.aiLookaheadUsed = 0;
  state.aiJobId = 0;
  state.aiWalls = [];
  state.aiSingles = [];
  state.results = { player: null, ai: null, winner: null };
  state.race = null;
  state.buildTimeLeft = 0;
  state.hoverCell = null;
  state.floatingTexts = [];
  state.seed = "";
  if (seedInput) seedInput.value = "";
  updateHud();
  clearCanvas();
}

function setVsChoice(choice) {
  if (!state.vs.active || state.vs.waitingForStart) return;
  state.vs.choiceSelf = choice;
  vsSendRematch(choice);
  updateVsChoiceStatus();
  checkVsChoiceReady();
}

function updateVsChoiceStatus() {
  if (!vsChoiceStatus) return;
  const self = state.vs.choiceSelf ? `You: ${state.vs.choiceSelf}` : "You: -";
  const peer = state.vs.choicePeer ? `Peer: ${state.vs.choicePeer}` : "Peer: -";
  vsChoiceStatus.textContent = `${self} | ${peer}`;
}

function checkVsChoiceReady() {
  if (!state.vs.choiceSelf || !state.vs.choicePeer) return;
  if (state.vs.choiceSelf !== state.vs.choicePeer) return;
  state.vs.rematchMode = state.vs.choiceSelf;
  state.vs.waitingForStart = true;
  setVsWaitingTimer();
  sendVsReady();
}

function setVsChoice(choice) {
  state.vs.choiceSelf = choice;
  vsSendRematch(choice);
  updateVsChoiceStatus();
  checkVsChoiceReady();
}

function vsSendRematch(choice) {
  if (!state.vs.room) return;
  vsSend({ type: "rematch", room: state.vs.room, choice });
}

function updateVsChoiceStatus() {
  if (!vsChoiceStatus) return;
  const self = state.vs.choiceSelf ? `You: ${state.vs.choiceSelf}` : "You: -";
  const peer = state.vs.choicePeer ? `Peer: ${state.vs.choicePeer}` : "Peer: -";
  vsChoiceStatus.textContent = `${self} | ${peer}`;
}

function checkVsChoiceReady() {
  if (!state.vs.choiceSelf || !state.vs.choicePeer) return;
  if (state.vs.choiceSelf !== state.vs.choicePeer) return;
  state.vs.waitingForStart = true;
  setVsWaitingTimer();
  sendVsReady();
}

const AI_ASYNC_YIELD_BUDGET = 1;
const VS_WS_URL =
  typeof location !== "undefined"
    ? location.protocol === "https:"
      ? "wss://pathofextile-production.up.railway.app"
      : "ws://localhost:8080"
    : "";
const VS_BUILD_SECONDS = 86;

async function buildAiLayoutAsync() {
  const t0 = performance.now();
  const grid = cloneGrid(state.baseGrid);
  const special = createSpecialTemplate(state.specialTemplate.type);
  const neutralSpecials = state.baseNeutralSpecials || [];
  let wallsLeft = state.coinBudget;
  let singlesLeft = state.singleBudget || 0;
  let currentScore = evaluateGridForAi(grid, special, neutralSpecials);
  state.aiWalls = [];
  state.aiSingles = [];
  const placementOrder = [];
  const lookaheadState = {
    remaining: currentLookaheadBudget(),
    interval: LOOKAHEAD_INTERVAL,
    index: 0,
    used: 0
  };
  const maxIterations = Math.max(1, wallsLeft + singlesLeft);
  const tPlaceStart = performance.now();
  let lastYield = performance.now();
  for (let i = 0; i < maxIterations; i++) {
    if (wallsLeft <= 0 && singlesLeft <= 0) break;
    if (performance.now() - lastYield > AI_ASYNC_YIELD_BUDGET) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      lastYield = performance.now();
    }
    const pathInfo = analyzePath(grid);
    if (!pathInfo) break;
    const specialHotspots = !special.placed ? computeSpecialHotspots(grid, special, neutralSpecials) : [];
    const placement = findBestAiPlacement(
      grid,
      currentScore,
      special,
      neutralSpecials,
      pathInfo,
      lookaheadState,
      { wallsLeft, singlesLeft, specialHotspots },
      wallsLeft > 0,
      singlesLeft > 0
    );
    if (!placement) break;
    if (placement.type === "wall" && wallsLeft > 0) {
      placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
      ensureOpenings(grid);
      wallsLeft--;
      state.aiWalls.push({ x: placement.x, y: placement.y });
      placementOrder.push({ type: "wall", row: placement.y + 1, column: placement.x + 1 });
    } else if (placement.type === "single" && singlesLeft > 0) {
      grid[placement.y][placement.x] = CELL_SINGLE;
      ensureOpenings(grid);
      state.aiSingles.push({ x: placement.x, y: placement.y });
      singlesLeft--;
      placementOrder.push({ type: "single", row: placement.y + 1, column: placement.x + 1 });
    } else {
      break;
    }
    currentScore = placement.score;
  }
  const tPlaceEnd = performance.now();
  const tSpecialStart = performance.now();
  currentScore = reduceMandatorySpeedPads(grid, special, neutralSpecials, currentScore);
  const finalHotspots = computeSpecialHotspots(grid, special, neutralSpecials);
  placeAiSpecial(grid, special, neutralSpecials, finalHotspots);
  if (special?.cell) {
    placementOrder.push({ type: "special", row: special.cell.y + 1, column: special.cell.x + 1 });
  }
  const tSpecialEnd = performance.now();
  const tReclaimStart = performance.now();
  const reclaimStats = reclaimAndReallocateBlocks(grid, special, neutralSpecials, placementOrder);
  placementOrder.reallocations = reclaimStats.reallocated || 0;
  placementOrder.reallocationPasses = reclaimStats.passes || 0;
  annotatePlacementImpacts(grid, special, neutralSpecials, placementOrder);
  const tReclaimEnd = performance.now();
  const profile = {
    totalMs: +(performance.now() - t0).toFixed(2),
    placementMs: +(tPlaceEnd - tPlaceStart).toFixed(2),
    specialMs: +(tSpecialEnd - tSpecialStart).toFixed(2),
    reclaimMs: +(tReclaimEnd - tReclaimStart).toFixed(2),
    lookaheadUsed: lookaheadState.used || 0,
    placements: placementOrder.length,
    worker: false,
    source: "main-thread"
  };
  state.aiProfile = profile;
  state.aiProfileSource = profile.source;
  return { grid, special, lookaheadUsed: lookaheadState.used || 0, placementOrder, profile };
}

function ensureAiWorker() {
  if (aiWorker) return aiWorker;
  if (typeof Worker === "undefined") return null;
  try {
    aiWorker = new Worker("ai-worker.js");
    return aiWorker;
  } catch (err) {
    console.warn("AI worker failed to start; falling back to main thread", err);
    aiWorker = null;
    return null;
  }
}

function prewarmAiWorker() {
  const spawn = () => {
    if (aiWorker) return;
    try {
      ensureAiWorker();
    } catch (_) {}
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(spawn, { timeout: 500 });
  } else {
    setTimeout(spawn, 0);
  }
}

function cancelAiBuild() {
  aiBuildToken++;
  state.aiBuildPromise = null;
}

function buildAiLayoutViaWorker() {
  return new Promise((resolve, reject) => {
    const worker = ensureAiWorker();
    if (!worker) {
      reject(new Error("Worker not available"));
      return;
    }
    const jobId = ++aiWorkerJobCounter;
    const snapshot = {
      baseGrid: state.baseGrid,
      baseNeutralSpecials: state.baseNeutralSpecials,
      specialTemplate: state.specialTemplate,
      coinBudget: state.coinBudget,
      singleBudget: state.singleBudget,
      rngSeed: hashSeed(state.seed || Date.now().toString())
    };
    const handleMessage = (evt) => {
      const data = evt.data || {};
      if (data.jobId !== jobId) return;
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      if (data.ok) {
        resolve({
          grid: data.grid,
          special: data.special,
          placementOrder: data.placementOrder,
          profile: { ...(data.profile || {}), source: "worker" },
          lookaheadUsed: data.lookaheadUsed
        });
      } else {
        reject(new Error(data.error || "AI worker failed"));
      }
    };
    const handleError = (err) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      reject(err instanceof Error ? err : new Error("AI worker error"));
    };
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ jobId, snapshot });
  });
}

// ---------------------------------------------------------------------------
// Versus mode WebSocket client (signaling only; gameplay integration TBD)
// ---------------------------------------------------------------------------
const versusClient = {
  ws: null,
  room: null,
  onEvent: null
};

function vsConnect(onEvent = null) {
  if (!VS_WS_URL) throw new Error("VS_WS_URL not set");
  if (versusClient.ws && versusClient.ws.readyState === WebSocket.OPEN) return versusClient.ws;
  versusClient.onEvent = onEvent;
  const ws = new WebSocket(VS_WS_URL);
  ws.onopen = () => emitVsEvent({ type: "connected" });
  ws.onclose = () => emitVsEvent({ type: "disconnected" });
  ws.onerror = (err) => emitVsEvent({ type: "error", error: err?.message || "ws error" });
  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      emitVsEvent(data);
    } catch (err) {
      emitVsEvent({ type: "error", error: "bad message" });
    }
  };
  versusClient.ws = ws;
  return ws;
}

function emitVsEvent(evt) {
  if (typeof versusClient.onEvent === "function") versusClient.onEvent(evt);
}

function vsSend(data) {
  if (!versusClient.ws || versusClient.ws.readyState !== WebSocket.OPEN) return;
  versusClient.ws.send(JSON.stringify(data));
}

function vsSendRematch(choice) {
  if (!state.vs.room) return;
  vsSend({ type: "rematch", room: state.vs.room, choice });
}

function vsCreateRoom() {
  vsSend({ type: "create" });
}

function vsJoinRoom(room) {
  vsSend({ type: "join", room });
}

function vsReady(room) {
  vsSend({ type: "ready", room });
}

function vsSendMaze(room, payload) {
  vsSend({ type: "maze", room, payload });
}

function findBestAiPlacement(
  grid,
  currentScore,
  special,
  neutralSpecials,
  pathInfoOverride = null,
  lookaheadState = null,
  budgetInfo = null,
  allowWalls = true,
  allowSingles = true,
  forcedSingleCells = null
) {
  if (lookaheadState) {
    lookaheadState.index = (lookaheadState.index || 0) + 1;
  }
  const lookaheadEnabled = lookaheadState?.remaining > 0;
  const candidateLimit = lookaheadEnabled ? PLACEMENT_LOOKAHEAD_COUNT : 1;
  const wallPool = [];
  const singlePool = [];
  if (allowWalls) {
    wallPool.push(...findTopAiWallCandidates(grid, special, neutralSpecials, candidateLimit));
  }
  if (allowSingles) {
    const steerCells = collectSpeedPadSteerCells(grid);
    const forced =
      forcedSingleCells && forcedSingleCells.length
        ? forcedSingleCells.concat(steerCells)
        : steerCells;
    singlePool.push(...findTopAiSingleCandidates(grid, special, neutralSpecials, forced, candidateLimit));
  }
  let candidates = wallPool.concat(singlePool);
  if (!candidates.length) {
    // Fallback: try a broader random search to avoid giving up when the adjacency pool is empty.
    candidates = findFallbackAiCandidates(grid, special, neutralSpecials, allowWalls, allowSingles);
    if (!candidates.length) return null;
  }
  candidates.sort((a, b) => b.score - a.score);
  const topCandidate = candidates[0];
  const second = candidates[1];
  const shouldLookahead =
    lookaheadEnabled &&
    second &&
    Math.abs(topCandidate.score - second.score) <=
      Math.max(1, Math.abs(topCandidate.score)) * LOOKAHEAD_TRIGGER_THRESHOLD;
  if (!shouldLookahead) {
    return topCandidate;
  }
  lookaheadState.remaining--;
  if (lookaheadState) {
    lookaheadState.used = (lookaheadState.used || 0) + 1;
  }
  const top = candidates.slice(0, PLACEMENT_LOOKAHEAD_COUNT);
  let best = null;
  top.forEach((candidate) => {
    const lookahead = evaluateCandidateWithLookahead(grid, special, neutralSpecials, candidate);
    candidate.lookaheadScore = lookahead;
    if (
      !best ||
      lookahead > best.lookaheadScore ||
      (lookahead === best.lookaheadScore && candidate.score > best.score)
    ) {
      best = candidate;
    }
  });
  let pick = best || topCandidate;
  if (budgetInfo) {
    const sequenceChoice = evaluatePlacementSequences(
      grid,
      special,
      neutralSpecials,
      wallPool,
      singlePool,
      budgetInfo,
      candidateLimit
    );
    if (sequenceChoice && sequenceChoice.score > (pick.lookaheadScore || pick.score || -Infinity)) {
      pick = sequenceChoice.candidate;
    }
  }
  return pick;
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

function findTopAiWallCandidates(grid, special, neutralSpecials, limit = 1) {
  const results = [];
  const basePath = computePath(grid);
  if (!basePath.length) return results;
  const candidateKeys = new Set();
  function addTarget(x, y) {
    if (isInsideGrid(x, y)) candidateKeys.add(key(x, y));
  }
  // Along current path and neighbors (Chebyshev radius 2, diagonals included)
  basePath.forEach((node) => {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        addTarget(node.x + dx, node.y + dy);
      }
    }
  });
  // Around already placed blocks (walls or singles)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const value = grid[y][x];
      if (value !== CELL_PLAYER && value !== CELL_SINGLE) continue;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          addTarget(x + dx, y + dy);
        }
      }
    }
  }
  // Around beneficial pads
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const padType = padTypeFromCell(grid[y][x]);
      if (!BENEFICIAL_PAD_TYPES.includes(padType)) continue;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          addTarget(x + dx, y + dy);
        }
      }
    }
  }
  // Around neutral special
  neutralSpecials?.forEach((ns) => {
    if (!ns?.placed || !ns.cell) return;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        addTarget(ns.cell.x + dx, ns.cell.y + dy);
      }
    }
  });
  const targeted = Array.from(candidateKeys).map((entry) => {
    const [x, y] = entry.split(",").map(Number);
    return { x, y };
  });
  const wallCandidates = targeted.length ? targeted : generateRandomCandidates(grid, 80);
  wallCandidates.forEach((cand) => {
    if (!canPlaceBlock(grid, cand.x, cand.y)) return;
    placeBlock(grid, cand.x, cand.y, CELL_PLAYER);
    ensureOpenings(grid);
    const score = evaluateGridForAi(grid, special, neutralSpecials);
    clearBlock(grid, cand.x, cand.y);
    ensureOpenings(grid);
    if (!Number.isFinite(score)) return;
    insertCandidate(results, { type: "wall", x: cand.x, y: cand.y, score }, limit);
  });
  return results;
}

function findTopAiSingleCandidates(
  grid,
  special,
  neutralSpecials,
  forcedCells = null,
  limit = 1
) {
  const basePath = computePath(grid);
  if (!basePath.length) return [];
  const singleCandidates = new Set();
  function addSingle(x, y) {
    if (isInsideGrid(x, y)) singleCandidates.add(key(x, y));
  }
  basePath.forEach((node) => {
    addSingle(node.x, node.y);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        addSingle(node.x + dx, node.y + dy);
      }
    }
  });
  // Around already placed blocks (walls or singles)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const value = grid[y][x];
      if (value !== CELL_PLAYER && value !== CELL_SINGLE) continue;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          addSingle(x + dx, y + dy);
        }
      }
    }
  }
  // Around beneficial pads
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const padType = padTypeFromCell(grid[y][x]);
      if (!BENEFICIAL_PAD_TYPES.includes(padType)) continue;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          addSingle(x + dx, y + dy);
        }
      }
    }
  }
  // Around neutral special
  neutralSpecials?.forEach((ns) => {
    if (!ns?.placed || !ns.cell) return;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        addSingle(ns.cell.x + dx, ns.cell.y + dy);
      }
    }
  });
  if (!singleCandidates.size) {
    generateRandomSingleCandidates(80).forEach((c) => singleCandidates.add(key(c.x, c.y)));
  }
  if (forcedCells?.length) {
    forcedCells.forEach((cell) => {
      if (cell && isInsideGrid(cell.x, cell.y)) {
        singleCandidates.add(key(cell.x, cell.y));
      }
    });
  }
  const results = [];
  for (const entry of singleCandidates) {
    const [cx, cy] = entry.split(",").map(Number);
    if (!canPlaceSingle(grid, cx, cy)) continue;
    const previous = grid[cy][cx];
    grid[cy][cx] = CELL_SINGLE;
    ensureOpenings(grid);
    const score = evaluateGridForAi(grid, special, neutralSpecials);
    grid[cy][cx] = previous;
    ensureOpenings(grid);
    if (!Number.isFinite(score)) continue;
    insertCandidate(results, { type: "single", x: cx, y: cy, score }, limit);
  }
  return results;
}

function generateRandomSingleCandidates(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: randomInt(state.rng, 0, GRID_SIZE - 1),
      y: randomInt(state.rng, 1, GRID_SIZE - 2)
    });
  }
  return out;
}

function findFallbackAiCandidates(grid, special, neutralSpecials, allowWalls, allowSingles) {
  const pool = [];
  const tries = 140;
  if (allowWalls) {
    for (let i = 0; i < tries; i++) {
      const x = randomInt(state.rng, 0, GRID_SIZE - 2);
      const y = randomInt(state.rng, 1, GRID_SIZE - 3);
      if (!canPlaceBlock(grid, x, y)) continue;
      placeBlock(grid, x, y, CELL_PLAYER);
      ensureOpenings(grid);
      const score = evaluateGridForAi(grid, special, neutralSpecials);
      clearBlock(grid, x, y);
      ensureOpenings(grid);
      if (!Number.isFinite(score)) continue;
      insertCandidate(pool, { type: "wall", x, y, score }, 3);
    }
  }
  if (allowSingles) {
    for (let i = 0; i < tries; i++) {
      const x = randomInt(state.rng, 0, GRID_SIZE - 1);
      const y = randomInt(state.rng, 1, GRID_SIZE - 2);
      if (!canPlaceSingle(grid, x, y)) continue;
      const prev = grid[y][x];
      grid[y][x] = CELL_SINGLE;
      ensureOpenings(grid);
      const score = evaluateGridForAi(grid, special, neutralSpecials);
      grid[y][x] = prev;
      ensureOpenings(grid);
      if (!Number.isFinite(score)) continue;
      insertCandidate(pool, { type: "single", x, y, score }, 3);
    }
  }
  return pool;
}

function collectSpeedPadSteerCells(grid) {
  const path = computePath(grid);
  if (!path.length) return [];
  const cells = new Set();
  path.forEach((node) => {
    if (grid[node.y]?.[node.x] !== CELL_SPEED) return;
    CARDINAL_NEIGHBORS.forEach(([dx, dy]) => {
      const nx = node.x + dx;
      const ny = node.y + dy;
      if (!isInsideGrid(nx, ny)) return;
      if (!canPlaceSingle(grid, nx, ny)) return;
      cells.add(key(nx, ny));
    });
  });
  return Array.from(cells).map((entry) => {
    const [x, y] = entry.split(",").map(Number);
    return { x, y };
  });
}

function evaluateCandidateWithLookahead(grid, special, neutralSpecials, candidate) {
  const baseScore = candidate.score;
  applyPlacementCandidate(grid, candidate);
  const followWalls = findTopAiWallCandidates(grid, special, neutralSpecials, 1);
  const followSingles = findTopAiSingleCandidates(
    grid,
    special,
    neutralSpecials,
    collectSpeedPadSteerCells(grid),
    1
  );
  const follow = followWalls.concat(followSingles);
  follow.sort((a, b) => b.score - a.score);
  const bestFollow = follow.length ? follow[0].score : baseScore;
  revertPlacementCandidate(grid, candidate);
  const bonus = Math.max(0, bestFollow - baseScore) * PLACEMENT_LOOKAHEAD_WEIGHT;
  return baseScore + bonus;
}

function evaluatePlacementSequences(
  grid,
  special,
  neutralSpecials,
  wallPool,
  singlePool,
  budgetInfo
) {
  if (!budgetInfo) return null;
  const wallsLeft = budgetInfo.wallsLeft || 0;
  const singlesLeft = budgetInfo.singlesLeft || 0;
  const specialHotspots = budgetInfo.specialHotspots || [];
  const pools = {
    walls: wallPool.slice(0, COMBO_POOL_LIMIT),
    singles: singlePool.slice(0, COMBO_POOL_LIMIT),
    specials: !special.placed ? specialHotspots.slice(0, COMBO_POOL_LIMIT) : []
  };
  if (!pools.walls.length && !pools.singles.length && !pools.specials.length) return null;

  let best = null;
  const maxDepth = Math.max(1, Math.min(COMBO_LOOKAHEAD_DEPTH, wallsLeft + singlesLeft + (special.placed ? 0 : 1)));

  function dfs(currentGrid, currentSpecial, wLeft, sLeft, depth, firstMoveUsed, usedSpecial) {
    const score = evaluateGridForAi(currentGrid, currentSpecial, neutralSpecials);
    if (depth === 0 || (!wLeft && !sLeft && (usedSpecial || currentSpecial?.placed))) {
      if (!best || score > best.score) {
        best = { score, candidate: firstMoveUsed };
      }
      return;
    }
    // walls
    if (wLeft > 0) {
      pools.walls.forEach((wall) => {
        const nextGrid = cloneGrid(currentGrid);
        placeBlock(nextGrid, wall.x, wall.y, CELL_PLAYER);
        ensureOpenings(nextGrid);
        if (!hasPath(nextGrid)) return;
        const nextSpecial = currentSpecial ? cloneSpecial(currentSpecial) : null;
        const move = firstMoveUsed || wall;
        dfs(nextGrid, nextSpecial, wLeft - 1, sLeft, depth - 1, move, usedSpecial);
      });
    }
    // singles
    if (sLeft > 0) {
      pools.singles.forEach((single) => {
        const nextGrid = cloneGrid(currentGrid);
        if (!canPlaceSingle(nextGrid, single.x, single.y)) return;
        const prev = nextGrid[single.y][single.x];
        nextGrid[single.y][single.x] = CELL_SINGLE;
        ensureOpenings(nextGrid);
        if (!hasPath(nextGrid)) {
          nextGrid[single.y][single.x] = prev;
          return;
        }
        const nextSpecial = currentSpecial ? cloneSpecial(currentSpecial) : null;
        const move = firstMoveUsed || single;
        dfs(nextGrid, nextSpecial, wLeft, sLeft - 1, depth - 1, move, usedSpecial);
      });
    }
    // special
    if (!usedSpecial && pools.specials.length && currentSpecial && !currentSpecial.placed) {
      pools.specials.forEach((spot) => {
        const [sx, sy] = [spot.x, spot.y];
        if (!isCellAvailableForSpecial(currentGrid, sx, sy)) return;
        const nextGrid = cloneGrid(currentGrid);
        nextGrid[sy][sx] = CELL_SPECIAL;
        ensureOpenings(nextGrid);
        if (!hasPath(nextGrid)) return;
        const nextSpecial = currentSpecial ? cloneSpecial(currentSpecial) : null;
        nextSpecial.cell = { x: sx, y: sy };
        nextSpecial.placed = true;
        nextSpecial.effectTimer = 0;
        nextSpecial.cooldown = 0;
        nextSpecial.flashTimer = 0;
        const move = firstMoveUsed || { type: "special", x: sx, y: sy, score: spot.score || 0 };
        dfs(nextGrid, nextSpecial, wLeft, sLeft, depth - 1, move, true);
      });
    }
  }

  const startGrid = cloneGrid(grid);
  const startSpecial = special ? cloneSpecial(special) : { placed: false };
  dfs(startGrid, startSpecial, wallsLeft, singlesLeft, maxDepth, null, !!special?.placed);
  return best;
}

function optimizeBlockReallocation(grid, special, neutralSpecials, specialHotspots = []) {
  const baselineScore = evaluateGridForAi(grid, special, neutralSpecials);
  let weakest = null;

  // Evaluate wall contributions
  const walls = listAiWallOrigins(grid);
  walls.forEach(({ x, y }) => {
    clearBlock(grid, x, y);
    ensureOpenings(grid);
    if (!hasPath(grid)) {
      placeBlock(grid, x, y, CELL_PLAYER);
      ensureOpenings(grid);
      return;
    }
    const score = evaluateGridForAi(grid, special, neutralSpecials);
    const contribution = baselineScore - score;
    if (!weakest || contribution < weakest.contribution) {
      weakest = {
        type: "wall",
        x,
        y,
        contribution
      };
    }
    placeBlock(grid, x, y, CELL_PLAYER);
    ensureOpenings(grid);
  });

  // Evaluate single contributions
  const singles = listAiSingleCells(grid);
  singles.forEach(({ x, y }) => {
    const prev = grid[y][x];
    grid[y][x] = CELL_EMPTY;
    ensureOpenings(grid);
    if (!hasPath(grid)) {
      grid[y][x] = prev;
      ensureOpenings(grid);
      return;
    }
    const score = evaluateGridForAi(grid, special, neutralSpecials);
    const contribution = baselineScore - score;
    if (!weakest || contribution < weakest.contribution) {
      weakest = {
        type: "single",
        x,
        y,
        contribution,
        prev
      };
    }
    grid[y][x] = prev;
    ensureOpenings(grid);
  });

  if (!weakest || weakest.contribution >= MIN_BLOCK_RECLAIM_DELTA) {
    return { changed: false, score: baselineScore };
  }

  // Remove weakest block and try reallocating it
  if (weakest.type === "wall") {
    clearBlock(grid, weakest.x, weakest.y);
  } else {
    grid[weakest.y][weakest.x] = CELL_EMPTY;
  }
  ensureOpenings(grid);
  if (!hasPath(grid)) {
    // Should not happen, but revert if it does
    if (weakest.type === "wall") {
      placeBlock(grid, weakest.x, weakest.y, CELL_PLAYER);
    } else {
      grid[weakest.y][weakest.x] = weakest.prev;
    }
    ensureOpenings(grid);
    return { changed: false, score: baselineScore };
  }

  const wallsLeft = weakest.type === "wall" ? 1 : 0;
  const singlesLeft = weakest.type === "single" ? 1 : 0;
  const placement = findBestAiPlacement(
    grid,
    evaluateGridForAi(grid, special, neutralSpecials),
    special,
    neutralSpecials,
    null,
    null,
    { wallsLeft, singlesLeft, specialHotspots },
    wallsLeft > 0,
    singlesLeft > 0
  );

  if (!placement) {
    // Revert
    if (weakest.type === "wall") {
      placeBlock(grid, weakest.x, weakest.y, CELL_PLAYER);
    } else {
      grid[weakest.y][weakest.x] = weakest.prev;
    }
    ensureOpenings(grid);
    return { changed: false, score: baselineScore };
  }

  // Apply new placement
  if (placement.type === "wall") {
    placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
  } else if (placement.type === "single") {
    grid[placement.y][placement.x] = CELL_SINGLE;
  }
  ensureOpenings(grid);
  const newScore = evaluateGridForAi(grid, special, neutralSpecials);
  if (newScore > baselineScore) {
    return { changed: true, score: newScore };
  }

  // Revert to original if no improvement
  if (placement.type === "wall") {
    clearBlock(grid, placement.x, placement.y);
  } else if (placement.type === "single") {
    grid[placement.y][placement.x] = CELL_EMPTY;
  }
  if (weakest.type === "wall") {
    placeBlock(grid, weakest.x, weakest.y, CELL_PLAYER);
  } else {
    grid[weakest.y][weakest.x] = weakest.prev;
  }
  ensureOpenings(grid);
  return { changed: false, score: baselineScore };
}

function reclaimAndReallocateBlocks(grid, special, neutralSpecials, placementOrder = []) {
  if (!grid) return { reallocated: 0, passes: 0 };
  if (!placementOrder || placementOrder.length < 8) {
    return { reallocated: 0, passes: 0 };
  }
  let reallocated = 0;
  let passes = 0;
  for (let pass = 0; pass < RECLAIM_MAX_PASSES; pass++) {
    passes++;
    const baseline = simulateRunnerTime(grid, special, neutralSpecials);
    if (baseline == null) break;
    const remaining = [];
    let reclaimedWalls = 0;
    let reclaimedSingles = 0;
    let reclaimedSpecial = false;
    let reclaimedAny = false;
    for (const entry of placementOrder) {
      if (entry.type === "special") {
        if (!special?.placed || !special.cell) continue;
        const sx = special.cell.x;
        const sy = special.cell.y;
        grid[sy][sx] = CELL_EMPTY;
        ensureOpenings(grid);
        if (!hasPath(grid)) {
          grid[sy][sx] = CELL_SPECIAL;
          continue;
        }
        const sim = simulateRunnerTime(grid, null, neutralSpecials);
        if (sim != null && baseline - sim < RECLAIM_RUNTIME_THRESHOLD) {
          special.placed = false;
          special.cell = null;
          reclaimedSpecial = true;
          reclaimedAny = true;
        } else {
          grid[sy][sx] = CELL_SPECIAL;
          remaining.push(entry);
          ensureOpenings(grid);
        }
        continue;
      }
      const x = entry.column != null ? entry.column - 1 : entry.x;
      const y = entry.row != null ? entry.row - 1 : entry.y;
      if (entry.type === "wall") {
        clearBlock(grid, x, y);
      } else {
        if (grid[y]?.[x] !== CELL_SINGLE) {
          remaining.push(entry);
          continue;
        }
        grid[y][x] = CELL_EMPTY;
      }
      ensureOpenings(grid);
      if (!hasPath(grid)) {
        restoreBlock(grid, entry);
        remaining.push(entry);
        ensureOpenings(grid);
        continue;
      }
      const sim = simulateRunnerTime(grid, special, neutralSpecials);
      if (sim != null && baseline - sim < RECLAIM_RUNTIME_THRESHOLD) {
        if (entry.type === "wall") reclaimedWalls++;
        else reclaimedSingles++;
        reclaimedAny = true;
      } else {
        restoreBlock(grid, entry);
        ensureOpenings(grid);
        remaining.push(entry);
      }
    }
    placementOrder.length = 0;
    placementOrder.push(...remaining);
    if (!reclaimedWalls && !reclaimedSingles && !reclaimedSpecial) break;

    // reallocate reclaimed blocks
    let currentSim = simulateRunnerTime(grid, special, neutralSpecials);
    const rejectedWalls = new Set();
    const rejectedSingles = new Set();
    let attempts = reclaimedWalls + reclaimedSingles + 10;
    while ((reclaimedWalls > 0 || reclaimedSingles > 0) && attempts-- > 0) {
      const placement = findBestAiPlacement(
        grid,
        evaluateGridForAi(grid, special, neutralSpecials),
        special,
        neutralSpecials,
        null,
        null,
        null,
        reclaimedWalls > 0,
        reclaimedSingles > 0
      );
      if (!placement) break;
      const key = keyFor(placement.x, placement.y);
      if (placement.type === "wall" && rejectedWalls.has(key)) {
        attempts--;
        continue;
      }
      if (placement.type === "single" && rejectedSingles.has(key)) {
        attempts--;
        continue;
      }
      const prevSim = currentSim;
      let accepted = false;
      if (placement.type === "wall" && reclaimedWalls > 0) {
        placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
        ensureOpenings(grid);
        const sim = simulateRunnerTime(grid, special, neutralSpecials);
        if (sim != null && (prevSim == null || sim - prevSim >= RECLAIM_RUNTIME_THRESHOLD)) {
          placementOrder.push({ type: "wall", row: placement.y + 1, column: placement.x + 1 });
          reclaimedWalls--;
          reallocated++;
          currentSim = sim != null ? sim : prevSim;
          accepted = true;
        } else {
          clearBlock(grid, placement.x, placement.y);
          ensureOpenings(grid);
          rejectedWalls.add(key);
        }
      } else if (placement.type === "single" && reclaimedSingles > 0) {
        grid[placement.y][placement.x] = CELL_SINGLE;
        ensureOpenings(grid);
        const sim = simulateRunnerTime(grid, special, neutralSpecials);
        if (sim != null && (prevSim == null || sim - prevSim >= RECLAIM_RUNTIME_THRESHOLD)) {
          placementOrder.push({ type: "single", row: placement.y + 1, column: placement.x + 1 });
          reclaimedSingles--;
          reallocated++;
          currentSim = sim != null ? sim : prevSim;
          accepted = true;
        } else {
          grid[placement.y][placement.x] = CELL_EMPTY;
          ensureOpenings(grid);
          rejectedSingles.add(key);
        }
      } else {
        break;
      }
      if (!accepted) continue;
    }
    // Fallback: place remaining reclaimed blocks only if they don't reduce sim time
    let fallbackAttempts = reclaimedWalls + reclaimedSingles + 20;
    while ((reclaimedWalls > 0 || reclaimedSingles > 0) && fallbackAttempts-- > 0) {
      const placement = findBestAiPlacement(
        grid,
        evaluateGridForAi(grid, special, neutralSpecials),
        special,
        neutralSpecials,
        null,
        null,
        null,
        reclaimedWalls > 0,
        reclaimedSingles > 0
      );
      if (!placement) break;
      const prevSim = currentSim;
      if (placement.type === "wall" && reclaimedWalls > 0) {
        placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
        ensureOpenings(grid);
        const sim = simulateRunnerTime(grid, special, neutralSpecials);
        if (sim != null && (prevSim == null || sim - prevSim >= 0)) {
          placementOrder.push({ type: "wall", row: placement.y + 1, column: placement.x + 1 });
          reclaimedWalls--;
          reallocated++;
          currentSim = sim != null ? sim : prevSim;
        } else {
          clearBlock(grid, placement.x, placement.y);
          ensureOpenings(grid);
        }
      } else if (placement.type === "single" && reclaimedSingles > 0) {
        grid[placement.y][placement.x] = CELL_SINGLE;
        ensureOpenings(grid);
        const sim = simulateRunnerTime(grid, special, neutralSpecials);
        if (sim != null && (prevSim == null || sim - prevSim >= 0)) {
          placementOrder.push({ type: "single", row: placement.y + 1, column: placement.x + 1 });
          reclaimedSingles--;
          reallocated++;
          currentSim = sim != null ? sim : prevSim;
        } else {
          grid[placement.y][placement.x] = CELL_EMPTY;
          ensureOpenings(grid);
        }
      } else {
        break;
      }
    }
    if (reclaimedSpecial && !special.placed) {
      const hotspots = computeSpecialHotspots(grid, special, neutralSpecials);
      placeAiSpecial(grid, special, neutralSpecials, hotspots);
      if (special?.cell) {
        placementOrder.push({ type: "special", row: special.cell.y + 1, column: special.cell.x + 1 });
      }
    }
    if (!reclaimedAny && !reclaimedSpecial) break;
  }
  return { reallocated, passes };
}

function annotatePlacementImpacts(grid, special, neutralSpecials, placementOrder = []) {
  if (!grid || !placementOrder?.length) return;
  const baseline = simulateRunnerTime(grid, special, neutralSpecials);
  if (baseline == null) return;
  placementOrder.forEach((entry) => {
    const x = entry.column != null ? entry.column - 1 : entry.x;
    const y = entry.row != null ? entry.row - 1 : entry.y;
    let sim = baseline;
    if (entry.type === "wall") {
      if (
        grid[y]?.[x] !== CELL_PLAYER ||
        grid[y + 1]?.[x] !== CELL_PLAYER ||
        grid[y]?.[x + 1] !== CELL_PLAYER ||
        grid[y + 1]?.[x + 1] !== CELL_PLAYER
      ) {
        entry.impactDelta = 0;
        return;
      }
      const testGrid = cloneGrid(grid);
      clearBlock(testGrid, x, y);
      ensureOpenings(testGrid);
      if (hasPath(testGrid)) {
        sim = simulateRunnerTime(testGrid, special, neutralSpecials);
      }
    } else if (entry.type === "single") {
      if (grid[y]?.[x] !== CELL_SINGLE) {
        entry.impactDelta = 0;
        return;
      }
      const testGrid = cloneGrid(grid);
      testGrid[y][x] = CELL_EMPTY;
      ensureOpenings(testGrid);
      if (hasPath(testGrid)) {
        sim = simulateRunnerTime(testGrid, special, neutralSpecials);
      }
    } else if (entry.type === "special") {
      if (!special?.placed || special.cell == null) {
        entry.impactDelta = 0;
        return;
      }
      const testGrid = cloneGrid(grid);
      const testSpecial = cloneSpecial(special);
      const sx = testSpecial.cell.x;
      const sy = testSpecial.cell.y;
      testGrid[sy][sx] = CELL_EMPTY;
      testSpecial.placed = false;
      testSpecial.cell = null;
      ensureOpenings(testGrid);
      if (hasPath(testGrid)) {
        sim = simulateRunnerTime(testGrid, testSpecial, neutralSpecials);
      }
    }
    const delta = sim != null ? baseline - sim : 0;
    entry.impactDelta = Number((delta || 0).toFixed(2));
  });
}

function applyPlacementCandidate(grid, candidate) {
  if (candidate.type === "wall") {
    placeBlock(grid, candidate.x, candidate.y, CELL_PLAYER);
  } else {
    candidate.previous = grid[candidate.y][candidate.x];
    grid[candidate.y][candidate.x] = CELL_SINGLE;
  }
  ensureOpenings(grid);
}

function revertPlacementCandidate(grid, candidate) {
  if (candidate.type === "wall") {
    clearBlock(grid, candidate.x, candidate.y);
  } else {
    const prev = candidate.previous != null ? candidate.previous : CELL_EMPTY;
    grid[candidate.y][candidate.x] = prev;
    candidate.previous = null;
  }
  ensureOpenings(grid);
}

function restoreBlock(grid, entry) {
  const x = entry.column != null ? entry.column - 1 : entry.x;
  const y = entry.row != null ? entry.row - 1 : entry.y;
  if (x == null || y == null) return;
  if (entry.type === "wall") {
    placeBlock(grid, x, y, CELL_PLAYER);
  } else if (entry.type === "single") {
    grid[y][x] = CELL_SINGLE;
  }
}

function insertCandidate(list, candidate, limit) {
  if (!candidate) return;
  list.push(candidate);
  list.sort((a, b) => b.score - a.score);
  if (list.length > limit) {
    list.length = limit;
  }
}

function refineAiLayout(grid, special, neutralSpecials, currentScore) {
  let score = currentScore;
  score = runStructureRefinement(grid, special, neutralSpecials, score);
  score = reduceMandatorySpeedPads(grid, special, neutralSpecials, score);
  return score;
}

function runStructureRefinement(grid, special, neutralSpecials, currentScore) {
  let score = currentScore;
  const iterations = 4;
  for (let i = 0; i < iterations; i++) {
    const pathInfo = analyzePath(grid);
    const earlySet = buildEarlyPathSet(pathInfo?.path);
    const wallResult = tryRepositionAiWall(
      grid,
      special,
      neutralSpecials,
      score,
      earlySet,
      state.aiWalls
    );
    if (wallResult.changed) score = wallResult.score;
    const singleResult = tryRepositionAiSingle(
      grid,
      special,
      neutralSpecials,
      score,
      earlySet,
      state.aiSingles
    );
    if (singleResult.changed) score = singleResult.score;
  }
  return score;
}

function quickPlacementReview(grid, special, neutralSpecials, currentScore) {
  const pathInfo = analyzePath(grid);
  if (!pathInfo?.path?.length) return currentScore;
  const earlySet = buildEarlyPathSet(pathInfo.path);
  const wallResult = tryRepositionAiWall(
    grid,
    special,
    neutralSpecials,
    currentScore,
    earlySet,
    state.aiWalls
  );
  let score = wallResult.changed ? wallResult.score : currentScore;
  const singleResult = tryRepositionAiSingle(
    grid,
    special,
    neutralSpecials,
    score,
    earlySet,
    state.aiSingles
  );
  if (singleResult.changed) score = singleResult.score;
  return score;
}

function buildEarlyPathSet(path) {
  if (!path?.length) return null;
  const limit = Math.min(path.length, EARLY_PATH_CELLS);
  const set = new Set();
  for (let i = 0; i < limit; i++) {
    const node = path[i];
    set.add(keyFor(node.x, node.y));
  }
  return set;
}

function tryRepositionAiWall(grid, special, neutralSpecials, currentScore, preferredCells) {
  const walls = listAiWallOrigins(grid, preferredCells);
  if (!walls.length) return { changed: false, score: currentScore };
  const idx = randomInt(state.rng, 0, walls.length - 1);
  const { x, y } = walls[idx];
  clearBlock(grid, x, y);
  ensureOpenings(grid);
  if (!hasPath(grid)) {
    placeBlock(grid, x, y, CELL_PLAYER);
    ensureOpenings(grid);
    return { changed: false, score: currentScore };
  }
  const placement = findBestAiPlacement(
    grid,
    currentScore,
    special,
    neutralSpecials,
    null,
    null,
    null,
    true,
    false
  );
  if (placement && placement.type === "wall" && placement.score > currentScore) {
    placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
    ensureOpenings(grid);
    return { changed: true, score: placement.score };
  }
  placeBlock(grid, x, y, CELL_PLAYER);
  ensureOpenings(grid);
  return { changed: false, score: currentScore };
}

function tryRepositionAiSingle(grid, special, neutralSpecials, currentScore, preferredCells) {
  const singles = listAiSingleCells(grid, preferredCells);
  if (!singles.length) return { changed: false, score: currentScore };
  const idx = randomInt(state.rng, 0, singles.length - 1);
  const { x, y } = singles[idx];
  grid[y][x] = CELL_EMPTY;
  ensureOpenings(grid);
  if (!hasPath(grid)) {
    grid[y][x] = CELL_SINGLE;
    ensureOpenings(grid);
    return { changed: false, score: currentScore };
  }
  const placement = findBestAiPlacement(
    grid,
    currentScore,
    special,
    neutralSpecials,
    false,
    true,
    null,
    null
  );
  if (placement && placement.type === "single" && placement.score > currentScore) {
    grid[placement.y][placement.x] = CELL_SINGLE;
    ensureOpenings(grid);
    return { changed: true, score: placement.score };
  }
  grid[y][x] = CELL_SINGLE;
  ensureOpenings(grid);
  return { changed: false, score: currentScore };
}

function listAiWallOrigins(grid, preferredCells) {
  const walls = [];
  const preferred = preferredCells || null;
  for (let y = 0; y < GRID_SIZE - 1; y++) {
    for (let x = 0; x < GRID_SIZE - 1; x++) {
      if (
        grid[y][x] === CELL_PLAYER &&
        grid[y + 1][x] === CELL_PLAYER &&
        grid[y][x + 1] === CELL_PLAYER &&
        grid[y + 1][x + 1] === CELL_PLAYER
      ) {
        const cellKey = keyFor(x, y);
        if (!preferred || preferred.has(cellKey)) {
          walls.push({ x, y });
        }
      }
    }
  }
  if (!walls.length && preferred) {
    return listAiWallOrigins(grid, null);
  }
  return walls;
}

function listAiSingleCells(grid, preferredCells) {
  const singles = [];
  const preferred = preferredCells || null;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === CELL_SINGLE) {
        if (!preferred || preferred.has(keyFor(x, y))) {
          singles.push({ x, y });
        }
      }
    }
  }
  if (!singles.length && preferred) {
    return listAiSingleCells(grid, null);
  }
  return singles;
}

function reduceMandatorySpeedPads(grid, special, neutralSpecials, currentScore) {
  let score = currentScore;
  const mandatoryPads = collectMandatorySpeedPads(grid);
  mandatoryPads.forEach((pad) => {
    const result = tryDivertSpeedPad(grid, special, neutralSpecials, score, pad);
    if (result.changed) score = result.score;
  });
  return score;
}

function collectMandatorySpeedPads(grid) {
  const info = analyzePath(grid);
  if (!info?.path?.length) return [];
  const pads = [];
  info.path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const value = grid[node.y]?.[node.x];
    if (padTypeFromCell(value) === "speed" && padIsMandatory(grid, node.x, node.y)) {
      pads.push({ x: node.x, y: node.y });
    }
  });
  return pads;
}

function tryDivertSpeedPad(grid, special, neutralSpecials, currentScore, pad) {
  const singles = listAiSingleCells(grid, buildDiversionPreferenceSet(pad));
  if (!singles.length) return { changed: false, score: currentScore };
  const forcedCells = getDiversionCandidates(grid, pad.x, pad.y);
  if (!forcedCells.length) return { changed: false, score: currentScore };
  for (const single of singles) {
    grid[single.y][single.x] = CELL_EMPTY;
    ensureOpenings(grid);
    if (!hasPath(grid)) {
      grid[single.y][single.x] = CELL_SINGLE;
      ensureOpenings(grid);
      continue;
    }
    const placement = findBestAiPlacement(
      grid,
      currentScore,
      special,
      neutralSpecials,
      null,
      { remaining: 1 },
      null,
      false,
      true,
      forcedCells
    );
    if (placement && placement.type === "single" && placement.score > currentScore) {
      grid[placement.y][placement.x] = CELL_SINGLE;
      ensureOpenings(grid);
      return { changed: true, score: placement.score };
    }
    grid[single.y][single.x] = CELL_SINGLE;
    ensureOpenings(grid);
  }
  return { changed: false, score: currentScore };
}

function buildDiversionPreferenceSet(pad) {
  const set = new Set();
  for (let dy = -SPEED_DIVERSION_RADIUS; dy <= SPEED_DIVERSION_RADIUS; dy++) {
    for (let dx = -SPEED_DIVERSION_RADIUS; dx <= SPEED_DIVERSION_RADIUS; dx++) {
      const x = pad.x + dx;
      const y = pad.y + dy;
      if (!isInsideGrid(x, y)) continue;
      set.add(keyFor(x, y));
    }
  }
  return set;
}

function getDiversionCandidates(grid, px, py) {
  const cells = [];
  for (let dy = -SPEED_DIVERSION_RADIUS; dy <= SPEED_DIVERSION_RADIUS; dy++) {
    for (let dx = -SPEED_DIVERSION_RADIUS; dx <= SPEED_DIVERSION_RADIUS; dx++) {
      const x = px + dx;
      const y = py + dy;
      if (!isInsideGrid(x, y)) continue;
      if (Math.abs(dx) + Math.abs(dy) === 0) continue;
      if (grid[y][x] === CELL_EMPTY) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function listAiWallOrigins(grid, preferredCells = null) {
  const walls = [];
  const preferred = preferredCells || null;
  for (let y = 0; y < GRID_SIZE - 1; y++) {
    for (let x = 0; x < GRID_SIZE - 1; x++) {
      if (
        grid[y][x] === CELL_PLAYER &&
        grid[y + 1][x] === CELL_PLAYER &&
        grid[y][x + 1] === CELL_PLAYER &&
        grid[y + 1][x + 1] === CELL_PLAYER
      ) {
        const cellKey = keyFor(x, y);
        if (!preferred || preferred.has(cellKey)) {
          walls.push({ x, y });
        }
      }
    }
  }
  if (!walls.length && preferred) {
    return listAiWallOrigins(grid, null);
  }
  return walls;
}

function listAiSingleCells(grid, preferredCells = null) {
  const singles = [];
  const preferred = preferredCells || null;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === CELL_SINGLE) {
        if (!preferred || preferred.has(keyFor(x, y))) {
          singles.push({ x, y });
        }
      }
    }
  }
  if (!singles.length && preferred) {
    return listAiSingleCells(grid, null);
  }
  return singles;
}

function reduceMandatorySpeedPads(grid, special, neutralSpecials, currentScore) {
  let score = currentScore;
  const mandatoryPads = collectMandatorySpeedPads(grid);
  mandatoryPads.forEach((pad) => {
    const result = tryDivertSpeedPad(grid, special, neutralSpecials, score, pad);
    if (result.changed) score = result.score;
  });
  return score;
}

function collectMandatorySpeedPads(grid) {
  const info = analyzePath(grid);
  if (!info?.path?.length) return [];
  const pads = [];
  info.path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const value = grid[node.y]?.[node.x];
    if (padTypeFromCell(value) === "speed" && padIsMandatory(grid, node.x, node.y)) {
      pads.push({ x: node.x, y: node.y });
    }
  });
  return pads;
}

function tryDivertSpeedPad(grid, special, neutralSpecials, currentScore, pad) {
  const singles = listAiSingleCells(grid);
  if (!singles.length) return { changed: false, score: currentScore };
  const forcedCells = getDiversionCandidates(grid, pad.x, pad.y);
  if (!forcedCells.length) return { changed: false, score: currentScore };
  for (const single of singles) {
    grid[single.y][single.x] = CELL_EMPTY;
    ensureOpenings(grid);
    if (!hasPath(grid)) {
      grid[single.y][single.x] = CELL_SINGLE;
      ensureOpenings(grid);
      continue;
    }
    const placement = findBestAiPlacement(
      grid,
      currentScore,
      special,
      neutralSpecials,
      false,
      true,
      forcedCells
    );
    if (placement && placement.type === "single" && placement.score > currentScore) {
      grid[placement.y][placement.x] = CELL_SINGLE;
      ensureOpenings(grid);
      return { changed: true, score: placement.score };
    }
    grid[single.y][single.x] = CELL_SINGLE;
    ensureOpenings(grid);
  }
  return { changed: false, score: currentScore };
}

function getDiversionCandidates(grid, px, py) {
  const cells = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = px + dx;
      const y = py + dy;
      if (!isInsideGrid(x, y)) continue;
      if (Math.abs(dx) + Math.abs(dy) === 0) continue;
      if (grid[y][x] === CELL_EMPTY) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function computeSpecialHotspots(grid, special, neutralSpecials, limit = SPECIAL_HOTSPOT_LIMIT) {
  const basePath = computePath(grid);
  if (!basePath.length) return [];
  const baselineInfo = analyzePath(grid);
  const baselineMandatory = countMandatorySpeedPads(grid, baselineInfo?.path);
  const candidates = new Set();
  basePath.forEach((node) => {
    if (node.x >= 0 && node.x < GRID_SIZE && node.y >= 0 && node.y < GRID_SIZE) {
      candidates.add(key(node.x, node.y));
    }
    MOVES.forEach((move) => {
      const nx = node.x + move.dx;
      const ny = node.y + move.dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
        candidates.add(key(nx, ny));
      }
    });
  });
  for (let i = 0; i < 120; i++) {
    const gx = randomInt(state.rng, 0, GRID_SIZE - 1);
    const gy = randomInt(state.rng, 1, GRID_SIZE - 2);
    candidates.add(key(gx, gy));
  }
  const hotspots = [];
  for (const entry of candidates) {
    const [x, y] = entry.split(",").map(Number);
    const placement = evaluateSpecialCandidate(
      grid,
      special,
      neutralSpecials,
      x,
      y,
      baselineInfo,
      baselineMandatory
    );
    if (!placement) continue;
    hotspots.push({ x: placement.x, y: placement.y, score: placement.score });
  }
  hotspots.sort((a, b) => b.score - a.score);
  return hotspots.slice(0, limit);
}

function placeAiSpecial(grid, special, neutralSpecials, preferredCells = []) {
  const basePath = computePath(grid);
  if (!basePath.length) return;
  const baselineInfo = analyzePath(grid);
  if (!baselineInfo) return;
  const baselineMandatory = countMandatorySpeedPads(grid, baselineInfo.path);
  const candidates = new Set();
  basePath.forEach((node) => {
    if (node.x >= 0 && node.x < GRID_SIZE && node.y >= 0 && node.y < GRID_SIZE) {
      candidates.add(key(node.x, node.y));
    }
    MOVES.forEach((move) => {
      const nx = node.x + move.dx;
      const ny = node.y + move.dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
        candidates.add(key(nx, ny));
      }
    });
  });
  for (let i = 0; i < 120; i++) {
    const gx = randomInt(state.rng, 0, GRID_SIZE - 1);
    const gy = randomInt(state.rng, 1, GRID_SIZE - 2);
    candidates.add(key(gx, gy));
  }
  const preferredList = (preferredCells || [])
    .map((cell) => (cell ? { x: cell.x, y: cell.y } : null))
    .filter(Boolean);
  const preferredSet = new Set(preferredList.map((cell) => key(cell.x, cell.y)));
  let bestPreferred = null;
  preferredList.forEach((cell) => {
    const placement = evaluateSpecialCandidate(
      grid,
      special,
      neutralSpecials,
      cell.x,
      cell.y,
      baselineInfo,
      baselineMandatory
    );
    if (placement && (!bestPreferred || placement.score > bestPreferred.score)) {
      bestPreferred = placement;
    }
  });
  let bestGeneral = null;
  for (const entry of candidates) {
    if (preferredSet.has(entry)) continue;
    const [x, y] = entry.split(",").map(Number);
    const placement = evaluateSpecialCandidate(
      grid,
      special,
      neutralSpecials,
      x,
      y,
      baselineInfo,
      baselineMandatory
    );
    if (!placement) continue;
    if (!bestGeneral || placement.score > bestGeneral.score) {
      bestGeneral = placement;
    }
  }
  let best = null;
  if (bestPreferred) {
    const generalException =
      bestGeneral &&
      (bestGeneral.pathGain >= SPECIAL_PATH_GAIN_THRESHOLD || bestGeneral.avoidsSpeedPad);
    if (generalException) {
      best = bestGeneral;
    } else {
      best = bestPreferred;
    }
  } else {
    best = bestGeneral;
  }
  if (!best) return;
  grid[best.y][best.x] = CELL_SPECIAL;
  special.cell = { x: best.x, y: best.y };
  special.placed = true;
  special.effectTimer = 0;
  special.cooldown = 0;
  special.flashTimer = 0;
}

function evaluateSpecialCandidate(
  grid,
  special,
  neutralSpecials,
  x,
  y,
  baselineInfo,
  baselineMandatorySpeedCount
) {
  if (!isCellAvailableForSpecial(grid, x, y)) return null;
  const original = grid[y][x];
  grid[y][x] = CELL_SPECIAL;
  ensureOpenings(grid);
  const candidateSpecial = {
    ...special,
    cell: { x, y },
    placed: true
  };
  const pathInfo = analyzePath(grid);
  if (!pathInfo) {
    grid[y][x] = original;
    ensureOpenings(grid);
    return null;
  }
  const score = evaluateGridForAi(grid, candidateSpecial, neutralSpecials, pathInfo);
  const mandatorySpeedCount = countMandatorySpeedPads(grid, pathInfo.path);
  const baseDistance = baselineInfo?.totalDistance ?? 0;
  const pathGain = pathInfo.totalDistance - baseDistance;
  const avoidsSpeedPad =
    typeof baselineMandatorySpeedCount === "number" &&
    mandatorySpeedCount < baselineMandatorySpeedCount;
  grid[y][x] = original;
  ensureOpenings(grid);
  if (!Number.isFinite(score)) return null;
  return { x, y, score, pathGain, avoidsSpeedPad };
}

function simulateRunnerTime(grid, special, neutralSpecials = []) {
  if (!grid) return null;
  const runner = createRunner(
    "AI",
    cloneGrid(grid),
    special ? cloneSpecial(special) : null,
    cloneNeutralSpecials(neutralSpecials)
  );
  if (!runner.path.length) return null;
  const maxTime = 600;
  let elapsed = 0;
  while (!runner.finished && elapsed < maxTime) {
    advanceRunnerSimulation(runner, FIXED_TIMESTEP);
    elapsed += FIXED_TIMESTEP;
  }
  if (!runner.finished) return null;
  return runner.resultTime ?? runner.elapsedTime ?? elapsed;
}

function advanceRunnerSimulation(runner, delta) {
  if (runner.finished) return;
  if (!runner.path.length) {
    runner.finished = true;
    runner.resultTime = runner.elapsedTime || 0;
    return;
  }
  updateRunnerEffects(runner, delta);
  const speed = NPC_SPEED * runner.effects.speedMultiplier;
  let remainingDistance = speed * delta;
  let timeConsumed = 0;
  while (remainingDistance > 0 && runner.segmentIndex < runner.segmentLengths.length) {
    const dirVector = segmentDirectionVector(runner.path, runner.segmentIndex);
    const dirStep = segmentStep(runner.path, runner.segmentIndex);
    if (dirVector) {
      runner.effects.lastDir = dirVector;
      runner.effects.lastStep = dirStep;
    }
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
  updateNeutralSpecialEffects(runner, delta);
  const finishedThisFrame = runner.segmentIndex >= runner.segmentLengths.length;
  const frameContribution = finishedThisFrame ? Math.min(timeConsumed, delta) : delta;
  runner.elapsedTime += frameContribution;
  updatePadEffectStates(runner);
  if (finishedThisFrame) {
    runner.finished = true;
    runner.resultTime = runner.elapsedTime;
  }
}

function evaluateAiSeed(seed, runs = 1, silentOrOptions = false, additionalOptions = {}) {
  let config = {};
  if (typeof silentOrOptions === "boolean" || silentOrOptions == null) {
    config = { ...(additionalOptions || {}) };
    if (silentOrOptions) config.silent = true;
  } else if (typeof silentOrOptions === "object") {
    config = { ...silentOrOptions };
  } else {
    config = { ...(additionalOptions || {}) };
  }
  const silent = !!config.silent;
  const lookaheadOverride =
    config.lookaheadBudget != null ? Number(config.lookaheadBudget) : null;
  const snapshot = snapshotAiContext();
  const previousLookaheadOverride = aiLookaheadBudgetOverride;
  if (Number.isFinite(lookaheadOverride)) {
    aiLookaheadBudgetOverride = Math.max(0, Math.floor(lookaheadOverride));
  }
  const iterations = Math.max(1, runs | 0);
  const results = [];
  for (let i = 0; i < iterations; i++) {
    const simSeed = i === 0 ? `${seed}` : `${seed}-${i}`;
    const rng = mulberry32(hashSeed(simSeed));
    state.rng = rng;
    state.seed = simSeed;
    const baseGeneration = generateBaseGrid(rng);
    state.baseGrid = baseGeneration.grid;
    state.baseNeutralSpecials = baseGeneration.neutralSpecial ? [baseGeneration.neutralSpecial] : [];
    state.neutralSpecials = state.baseNeutralSpecials.map(cloneSpecial);
    state.coinBudget = randomInt(rng, 10, 21);
    state.coins = state.coinBudget;
    const singleCount = rng() < 0.1 ? 2 : 1;
    state.singleBudget = singleCount;
    state.singleBlocks = singleCount;
    const specialType = pickSpecialType(rng);
    state.specialTemplate = createSpecialTemplate(specialType);
    state.aiGrid = null;
    state.aiSpecial = null;
    const layout = buildAiLayout();
    const pathInfo = analyzePath(layout.grid);
    const metrics = summarizeAiMetrics(simSeed, layout, pathInfo);
    results.push(metrics);
  }
  restoreAiContext(snapshot);
  aiLookaheadBudgetOverride = previousLookaheadOverride;
  if (!silent && typeof console !== "undefined" && console.table) {
    console.table(results);
  }
  return results;
}

function evaluateSeedBatch(seedList, runs = 1) {
  const seeds = Array.isArray(seedList)
    ? seedList
    : typeof seedList === "string"
    ? seedList
        .split(/[\s,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  if (!seeds.length) return [];
  const summaries = seeds.map((seed) => {
    const results = evaluateAiSeed(seed, runs, true);
    if (!results.length) {
      return { seed, predictedAvg: 0, simulatedAvg: 0, bestSimulated: 0, runs: 0 };
    }
    const predictedAvg =
      results.reduce((sum, entry) => sum + (entry.predictedTime || 0), 0) / results.length;
    const simulatedAvg =
      results.reduce((sum, entry) => sum + (entry.simulatedTime || 0), 0) / results.length;
    const bestSimulated = Math.max(...results.map((entry) => entry.simulatedTime || 0));
    return {
      seed,
      runs: results.length,
      predictedAvg: Number(predictedAvg.toFixed(2)),
      simulatedAvg: Number(simulatedAvg.toFixed(2)),
      bestSimulated: Number(bestSimulated.toFixed(2))
    };
  });
  if (typeof console !== "undefined" && console.table) {
    console.table(summaries);
  }
  return summaries;
}

function setAiWeights(overrides = {}) {
  Object.keys(AI_WEIGHT_DEFAULTS).forEach((key) => {
    aiWeights[key] =
      overrides[key] != null ? Number(overrides[key]) : Number(AI_WEIGHT_DEFAULTS[key]);
  });
  return { ...aiWeights };
}

function resetAiWeights() {
  return setAiWeights({});
}

function sweepAiWeights(seed, samples = 50, options = {}) {
  const runs = options.runs != null ? Math.max(1, options.runs | 0) : 1;
  const weightKeys = Object.keys(AI_WEIGHT_DEFAULTS);
  const ranges = {
    pathTime: 1.5,
    pathTurns: 1.5,
    specialTime: 1.5,
    neutralSpecialTime: 1.5,
    slowTime: 1.5,
    slowStack: 1.5,
    slowInteraction: 1.5,
    blockUsage: 1.5,
    lightningPadPenalty: 1.5,
    beamCrossings: 1.5,
    ...options.ranges
  };
  let varySet = null;
  if (options.varyOnly) {
    const list = Array.isArray(options.varyOnly) ? options.varyOnly : [options.varyOnly];
    varySet = new Set(list.filter((key) => weightKeys.includes(key)));
    if (!varySet.size) varySet = null;
  }
  const snapshot = { ...aiWeights };
  const report = [];
  for (let i = 0; i < samples; i++) {
    const overrides = {};
    weightKeys.forEach((key) => {
      if (varySet && !varySet.has(key)) {
        overrides[key] = Number(AI_WEIGHT_DEFAULTS[key]);
      } else {
        const range = ranges[key] != null ? ranges[key] : 1.5;
        overrides[key] = sampleWeight(AI_WEIGHT_DEFAULTS[key], range);
      }
    });
    setAiWeights(overrides);
    const results = evaluateAiSeed(seed, runs, true);
    if (!results.length) continue;
    const predictedAvg =
      results.reduce((sum, entry) => sum + (entry.predictedTime || 0), 0) / results.length;
    const simulatedAvg =
      results.reduce((sum, entry) => sum + (entry.simulatedTime || 0), 0) / results.length;
    const slowAvg =
      results.reduce((sum, entry) => sum + (entry.slowTime || 0), 0) / results.length;
    const bestSimulated = Math.max(...results.map((entry) => entry.simulatedTime || 0));
    report.push({
      sample: i + 1,
      pathTime: Number(aiWeights.pathTime.toFixed(3)),
      specialTime: Number(aiWeights.specialTime.toFixed(3)),
      neutralSpecialTime: Number(aiWeights.neutralSpecialTime.toFixed(3)),
      slowTime: Number(aiWeights.slowTime.toFixed(3)),
      slowStack: Number(aiWeights.slowStack.toFixed(3)),
      slowInteraction: Number(aiWeights.slowInteraction.toFixed(3)),
      blockUsage: Number(aiWeights.blockUsage.toFixed(3)),
      lightningPadPenalty: Number(aiWeights.lightningPadPenalty.toFixed(3)),
      beamCrossings: Number(aiWeights.beamCrossings.toFixed(3)),
      predictedAvg: Number(predictedAvg.toFixed(2)),
      simulatedAvg: Number(simulatedAvg.toFixed(2)),
      slowAvg: Number(slowAvg.toFixed(2)),
      bestSimulated: Number(bestSimulated.toFixed(2))
    });
  }
  Object.assign(aiWeights, snapshot);
  if (typeof console !== "undefined" && console.table) {
    console.table(report);
    const ranking = rankSweepReport(report, options);
    if (ranking.length) {
      console.log("Top by simulated/objective:", ranking.slice(0, 5));
    }
  }
  return report;
}

function tuneAiWeights(seed, samples = 8, options = {}) {
  const weightKeys = Object.keys(AI_WEIGHT_DEFAULTS);
  const baseline = { ...aiWeights };
  const range = options.range != null ? Number(options.range) : 1.1;
  const gapWeight = options.gapWeight != null ? Number(options.gapWeight) : 0;
  const apply = options.apply !== false;
  let best = { score: -Infinity, weights: baseline, result: null };
  const candidates = [baseline];
  for (let i = 1; i < samples; i++) {
    const candidate = {};
    weightKeys.forEach((key) => {
      candidate[key] = sampleWeight(AI_WEIGHT_DEFAULTS[key], range);
    });
    candidates.push(candidate);
  }
  candidates.forEach((weights, idx) => {
    setAiWeights(weights);
    const results = evaluateAiSeed(seed, 1, true);
    const res = results[0] || {};
    const predicted = res.predictedTime || 0;
    const simulated = res.simulatedTime || 0;
    const gap = Math.abs(simulated - predicted);
    const score = simulated - gapWeight * gap;
    if (score > best.score) {
      best = { score, weights: { ...weights }, result: res, idx };
    }
  });
  if (apply) {
    setAiWeights(best.weights);
  }
  if (typeof console !== "undefined") {
    console.log("tuneAiWeights best", { ...best, applied: apply });
  }
  return { weights: { ...best.weights }, result: best.result, score: best.score };
}

function tuneAiWeightsForSeeds(seeds, samples = 8, options = {}) {
  const seedList = Array.isArray(seeds)
    ? seeds
    : typeof seeds === "string"
    ? seeds
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!seedList.length) return null;
  const runs = options.runs != null ? Math.max(1, options.runs | 0) : 1;
  const minWeight = options.minWeight != null ? Number(options.minWeight) : 0.4;
  let best = null;
  for (let i = 0; i < samples; i++) {
    const weights =
      i === 0 && options.includeCurrent !== false
        ? { ...aiWeights }
        : sampleWeightsVariant(options.range || 1.0);
    setAiWeights(weights);
    let total = 0;
    let worst = Infinity;
    seedList.forEach((seed) => {
      const result = evaluateAiSeed(seed, runs, true)[0] || {};
      const sim = result.simulatedTime || 0;
      total += sim;
      worst = Math.min(worst, sim);
    });
    const avg = total / seedList.length;
    const score = minWeight * worst + (1 - minWeight) * avg;
    if (!best || score > best.score) {
      best = { score, avg, worst, weights: { ...weights } };
    }
  }
  if (best) setAiWeights(best.weights);
  if (typeof console !== "undefined") {
    console.log("tuneAiWeightsForSeeds best", best);
  }
  return best;
}

function sampleWeightsVariant(range = 1.0) {
  const variant = {};
  Object.keys(AI_WEIGHT_DEFAULTS).forEach((key) => {
    variant[key] = sampleWeight(AI_WEIGHT_DEFAULTS[key], range);
  });
  return variant;
}

function rankSweepReport(report, options = {}) {
  const mode = options.rankBy || "objective";
  const gapWeight = Number.isFinite(options.gapWeight) ? Number(options.gapWeight) : 0.6;
  const bestWeight = Number.isFinite(options.bestSimWeight) ? Number(options.bestSimWeight) : 0.25;
  const sorted = [...report];
  const scorer = (entry) => {
    const sim = entry.simulatedAvg || 0;
    const best = entry.bestSimulated || sim;
    const predicted = entry.predictedAvg || sim;
    const gap = Math.abs(sim - predicted);
    if (mode === "simulated") return sim;
    if (mode === "bestSimulated") return best;
    return sim + bestWeight * (best - sim) - gapWeight * gap;
  };
  sorted.sort((a, b) => scorer(b) - scorer(a));
  return sorted;
}

function sampleWeight(base, range = 0.25) {
  const span = Math.max(0, Number(range));
  const delta = (Math.random() * 2 - 1) * span;
  return Math.max(0, base * (1 + delta));
}

function summarizeAiMetrics(seed, layout, pathInfo) {
  if (!pathInfo) {
    return {
      seed,
      distance: 0,
      predictedTime: 0,
      simulatedTime: null,
      padHits: {},
      mandatorySpeeds: 0,
      slowTime: 0,
      slowStack: 0,
      lookaheadUsed: layout?.lookaheadUsed || 0
    };
  }
  const padHits = {};
  pathInfo.path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const padType = padTypeFromCell(layout.grid[node.y]?.[node.x]);
    if (!padType) return;
    padHits[padType] = (padHits[padType] || 0) + 1;
  });
  const mandatorySpeeds = countMandatorySpeedPads(layout.grid, pathInfo.path);
  const prediction = estimatePredictedRunTime(
    layout.grid,
    pathInfo,
    layout.special,
    state.baseNeutralSpecials
  );
  const components = prediction.components || {
    slowTime: 0,
    slowStackTime: 0,
    specialOwnedTime: 0,
    specialNeutralTime: 0
  };
  const simulated = simulateRunnerTime(layout.grid, layout.special, state.baseNeutralSpecials);
  const blockUsage = computeBlockUsageScore(layout.grid, pathInfo.path);
  const specialInfo = layout.special?.cell
    ? `${layout.special.type}@(${layout.special.cell.x + 1},${layout.special.cell.y + 1})`
    : "none";
  return {
    seed,
    gridString: JSON.stringify(layout.grid),
    distance: Number(pathInfo.totalDistance.toFixed(2)),
    predictedTime: Number(prediction.time.toFixed(2)),
    simulatedTime: simulated != null ? Number(simulated.toFixed(2)) : null,
    mandatorySpeeds,
    padHits,
    slowTime: Number((components.slowTime || 0).toFixed(2)),
    slowStack: Number((components.slowStackTime || 0).toFixed(2)),
    blockUsage: Number(blockUsage.toFixed(3)),
    special: specialInfo,
    lookaheadUsed: layout.lookaheadUsed || 0
  };
}

function snapshotAiContext() {
  return {
    baseGrid: state.baseGrid ? cloneGrid(state.baseGrid) : null,
    baseNeutralSpecials: state.baseNeutralSpecials?.map(cloneSpecial) || [],
    neutralSpecials: state.neutralSpecials?.map(cloneSpecial) || [],
    coinBudget: state.coinBudget,
    singleBudget: state.singleBudget,
    coins: state.coins,
    singleBlocks: state.singleBlocks,
    specialTemplate: state.specialTemplate ? cloneSpecial(state.specialTemplate) : null,
    aiGrid: state.aiGrid ? cloneGrid(state.aiGrid) : null,
    aiSpecial: state.aiSpecial ? cloneSpecial(state.aiSpecial) : null,
    rng: state.rng,
    seed: state.seed
  };
}

function restoreAiContext(snapshot) {
  if (!snapshot) return;
  state.baseGrid = snapshot.baseGrid ? cloneGrid(snapshot.baseGrid) : null;
  state.baseNeutralSpecials = snapshot.baseNeutralSpecials.map(cloneSpecial);
  state.neutralSpecials = snapshot.neutralSpecials.map(cloneSpecial);
  state.coinBudget = snapshot.coinBudget;
  state.singleBudget = snapshot.singleBudget;
  state.coins = snapshot.coins;
  state.singleBlocks = snapshot.singleBlocks;
  state.specialTemplate = snapshot.specialTemplate ? cloneSpecial(snapshot.specialTemplate) : null;
  state.aiGrid = snapshot.aiGrid ? cloneGrid(snapshot.aiGrid) : null;
  state.aiSpecial = snapshot.aiSpecial ? cloneSpecial(snapshot.aiSpecial) : null;
  state.rng = snapshot.rng;
  state.seed = snapshot.seed;
}

if (typeof window !== "undefined") {
  window.evaluateAiSeed = evaluateAiSeed;
  window.evaluateSeedBatch = evaluateSeedBatch;
  window.setAiWeights = setAiWeights;
  window.resetAiWeights = resetAiWeights;
  window.sweepAiWeights = sweepAiWeights;
  window.tuneAiWeights = tuneAiWeights;
  window.tuneAiWeightsForSeeds = tuneAiWeightsForSeeds;
  window.sampleWeightsVariant = sampleWeightsVariant;
  window.getAiWeights = () => ({ ...aiWeights });
  window.previewGridMetrics = previewGridMetrics;
  window.getAiProfile = () => state.aiProfile || null;
  window.vsConnect = vsConnect;
  window.vsCreateRoom = vsCreateRoom;
  window.vsJoinRoom = vsJoinRoom;
  window.vsReady = vsReady;
  window.vsSendMaze = vsSendMaze;
}

function previewGridMetrics(gridArray, specialSpec = null, neutralSpecials = null) {
  const grid = cloneGrid(gridArray);
  const special =
    specialSpec && specialSpec.type && specialSpec.x != null && specialSpec.y != null
      ? {
          type: specialSpec.type,
          placed: true,
          cell: { x: Number(specialSpec.x), y: Number(specialSpec.y) },
          effectTimer: 0,
          cooldown: 0,
          flashTimer: 0
        }
      : null;
  const neutrals =
    neutralSpecials != null
      ? neutralSpecials.map((ns) => (ns ? cloneSpecial(ns) : null)).filter(Boolean)
      : state.baseNeutralSpecials;
  const pathInfo = analyzePath(grid);
  const score = evaluateGridForAi(grid, special, neutrals, pathInfo);
  const prediction = estimatePredictedRunTime(grid, pathInfo, special, neutrals);
  return {
    score,
    predictedTime: prediction.time || 0,
    baseTime: prediction.baseTime || 0,
    slowTime: prediction.components?.slowTime || 0,
    slowStack: prediction.components?.slowStackTime || 0,
    specialOwned: prediction.components?.specialOwnedTime || 0,
    specialNeutral: prediction.components?.specialNeutralTime || 0,
    lightningPenalty: prediction.lightningPenalty || 0,
    pathDistance: pathInfo?.totalDistance || 0,
    special: special ? `${special.type}@(${special.cell.x + 1},${special.cell.y + 1})` : "none"
  };
}

function createRunner(label, grid, special, neutralSpecials = []) {
  const path = computePath(grid);
  return {
    label,
    grid,
    special,
    neutralSpecials: cloneNeutralSpecials(neutralSpecials),
    path,
    segmentIndex: 0,
    segmentProgress: 0,
    segmentLengths: computeSegmentLengths(path),
    finished: !path.length,
    resultTime: null,
    worldPos: null,
    elapsedTime: 0,
    effects: {
      slowTimer: 0,
      fastTimer: 0,
      areaTimer: 0,
      speedMultiplier: 1,
      gravityActive: false,
      gravityPull: null,
      gravityOffset: null,
      stunTimer: 0,
      medusaActive: false,
      medusaDir: null,
      lastDir: null,
      lastStep: null,
      neutralSlowTimer: 0
    }
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
      const dirVector = segmentDirectionVector(runner.path, runner.segmentIndex);
      const dirStep = segmentStep(runner.path, runner.segmentIndex);
      if (dirVector) {
        runner.effects.lastDir = dirVector;
        runner.effects.lastStep = dirStep;
      }
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
    updateNeutralSpecialEffects(runner, delta);
    const finishedThisFrame = runner.segmentIndex >= runner.segmentLengths.length;
    const frameContribution = finishedThisFrame ? Math.min(timeConsumed, delta) : delta;
    runner.elapsedTime += frameContribution;
    updatePadEffectStates(runner);
    if (finishedThisFrame) {
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
  const isSelf = runner.label === "You";
  const isFoe = runner.label === "Foe";
  if (isSelf) {
    state.results.player = time;
  } else if (isFoe) {
    state.results.ai = time;
  } else {
    state.results.ai = time;
  }
}

function decideWinner() {
  const player = state.results.player;
  const ai = state.results.ai;
  const oppLabel = state.vs.active ? "Foe" : "AI";
  if (player == null && ai == null) {
    state.results.winner = "No valid runs";
  } else if (player == null) {
    state.results.winner = `${oppLabel} wins!`;
  } else if (ai == null) {
    state.results.winner = "You win!";
  } else if (player > ai) {
    state.results.winner = "You win!";
  } else if (player < ai) {
    state.results.winner = `${oppLabel} wins!`;
  } else {
    state.results.winner = "Tie!";
  }
  showResultPopup();
}

function updateRunnerEffects(runner, delta) {
  const effects = runner.effects;
  if (effects.slowTimer > 0) effects.slowTimer = Math.max(0, effects.slowTimer - delta);
  if (effects.stunTimer > 0) effects.stunTimer = Math.max(0, effects.stunTimer - delta);
  if (effects.neutralSlowTimer > 0) effects.neutralSlowTimer = Math.max(0, effects.neutralSlowTimer - delta);
  if (effects.stunTimer > 0) {
    runner.effects.speedMultiplier = 0;
    return;
  }
  if (effects.fastTimer > 0) effects.fastTimer = Math.max(0, effects.fastTimer - delta);
  const specialType = runner.special?.type;
  if (effects.areaTimer > 0 && specialType !== "radius") {
    effects.areaTimer = Math.max(0, effects.areaTimer - delta);
  }
  let mult = 1;
  if (effects.slowTimer > 0) mult *= PANEL_SLOW_MULT;
  if (specialType === "radius") {
    if (effects.areaTimer > 0) {
      const ratio = Math.min(1, effects.areaTimer / FREEZING_BUILDUP);
      const auraMult = SPECIAL_SLOW_MULT - (SPECIAL_SLOW_MULT - FREEZING_MIN_MULT) * ratio;
      mult *= auraMult;
    }
  } else if (effects.areaTimer > 0) {
    mult *= SPECIAL_SLOW_MULT;
  }
  if (effects.neutralSlowTimer > 0) {
    mult *= SPECIAL_SLOW_MULT;
  }
  if (effects.fastTimer > 0) mult *= PANEL_FAST_MULT;
  if (effects.medusaActive) mult *= MEDUSA_SLOW_MULT;
  if (effects.gravityActive && effects.gravityPull) {
    const ratio = Math.max(0, Math.min(1, effects.gravityPull.distance / SPECIAL_RADIUS));
    const target = GRAVITY_MIN_MULT + (GRAVITY_MAX_MULT - GRAVITY_MIN_MULT) * ratio;
    mult *= target;
  }
  runner.effects.speedMultiplier = mult;
}

function triggerPanelForRunner(runner) {
  const node = runner.path[runner.segmentIndex];
  if (!node) return;
  const value = runner.grid[node.y]?.[node.x];
  if (isPadActiveCell(value)) {
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
      if (isPadActiveCell(value)) {
        applyPanelEffect(runner, gx, gy, value);
      }
    }
  }
}

function applyPanelEffect(runner, x, y, value) {
  if (!isPadActiveCell(value)) return;
  const padType = padTypeFromCell(value);
  runner.grid[y][x] = padUsedVariant(value);
  if (padType === "speed") {
    runner.effects.fastTimer = PANEL_EFFECT_DURATION;
  } else if (padType === "slow") {
    runner.effects.slowTimer = PANEL_EFFECT_DURATION;
  } else if (padType === "detour") {
    triggerDetourPad(runner, x, y);
  } else if (padType === "stone") {
    triggerStonePad(runner);
  } else if (padType === "rewind") {
    triggerRewindPad(runner);
  }
  updateRunnerEffects(runner, 0);
}

function updatePadEffectStates(runner) {
  if (runner.effects.medusaActive) {
    const dir = runner.effects.lastDir;
    if (dir) {
      if (!runner.effects.medusaDir) {
        runner.effects.medusaDir = dir;
      } else {
        const dot = dir.x * runner.effects.medusaDir.x + dir.y * runner.effects.medusaDir.y;
        if (dot < 0.98) {
          runner.effects.medusaActive = false;
          runner.effects.medusaDir = null;
        }
      }
    }
  }
}

function triggerDetourPad(runner, x, y) {
  const lastStep = runner.effects.lastStep || stepFromDirVector(runner.effects.lastDir);
  if (!lastStep) return;
  const stepX = -lastStep.x;
  const stepY = -lastStep.y;
  if (stepX === 0 && stepY === 0) return;
  const forced = [{ x, y }];
  let currentX = x;
  let currentY = y;
  while (true) {
    const nextX = currentX + stepX;
    const nextY = currentY + stepY;
    if (!isInsideGrid(nextX, nextY)) break;
    if (!isWalkableCell(runner.grid, nextX, nextY)) break;
    forced.push({ x: nextX, y: nextY });
    currentX = nextX;
    currentY = nextY;
  }
  if (forced.length < 2) return;
  const finalCell = forced[forced.length - 1];
  const onward = computePathFromCell(runner.grid, finalCell);
  if (!onward.length) return;
  const tail = onward.slice(1);
  const newPath = forced.concat(tail);
  applyRunnerPath(runner, newPath);
}

function triggerStonePad(runner) {
  runner.effects.medusaActive = true;
  runner.effects.medusaDir = runner.effects.lastDir ? { ...runner.effects.lastDir } : null;
}

function triggerRewindPad(runner) {
  const restart = computePath(runner.grid);
  if (!restart.length) return;
  applyRunnerPath(runner, restart);
  runner.effects.fastTimer = 0;
  runner.effects.slowTimer = 0;
  runner.effects.medusaActive = false;
  runner.effects.medusaDir = null;
}

function applyRunnerPath(runner, newPath) {
  if (!newPath.length) return;
  runner.path = newPath;
  runner.segmentLengths = computeSegmentLengths(newPath);
  runner.segmentIndex = 0;
  runner.segmentProgress = 0;
  runner.worldPos = runnerWorldPosition(runner);
  runner.finished = false;
  runner.resultTime = null;
  runner.effects.lastDir = null;
  runner.effects.lastStep = null;
  runner.effects.gravityOffset = null;
  runner.effects.gravityActive = false;
  runner.effects.gravityPull = null;
  runner.effects.neutralSlowTimer = 0;
}

function stepFromDirVector(dir) {
  if (!dir) return null;
  return {
    x: dir.x > 0.1 ? 1 : dir.x < -0.1 ? -1 : 0,
    y: dir.y > 0.1 ? 1 : dir.y < -0.1 ? -1 : 0
  };
}

function updateSpecialArea(runner, delta) {
  const special = runner.special;
  if (!special?.placed || !special.cell) {
    runner.effects.areaTimer = 0;
    runner.effects.gravityActive = false;
    runner.effects.gravityPull = null;
    runner.effects.gravityOffset = decayGravityOffset(runner.effects.gravityOffset, delta);
    return;
  }
  const pos = runner.worldPos || runnerWorldPosition(runner);
  if (special.type === "gravity") {
    const centerX = special.cell.x + 0.5;
    const centerY = special.cell.y + 0.5;
    const dx = centerX - pos.x;
    const dy = centerY - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= SPECIAL_RADIUS) {
      runner.effects.gravityActive = true;
      const norm = dist === 0 ? 0 : 1 / dist;
      runner.effects.gravityPull = { x: dx * norm, y: dy * norm, distance: dist };
      runner.effects.gravityOffset = { x: dx * norm * 0.15, y: dy * norm * 0.15 };
    } else {
      runner.effects.gravityActive = false;
      runner.effects.gravityPull = null;
      runner.effects.gravityOffset = decayGravityOffset(runner.effects.gravityOffset, delta);
    }
    runner.effects.areaTimer = 0;
    return;
  }
  runner.effects.gravityActive = false;
  runner.effects.gravityPull = null;
  runner.effects.gravityOffset = decayGravityOffset(runner.effects.gravityOffset, delta);
  if (special.type === "radius") {
    if (isPointInsideSpecial(pos, special)) {
      runner.effects.areaTimer = Math.min(FREEZING_BUILDUP, runner.effects.areaTimer + delta);
    } else {
      const decayRate = FREEZING_BUILDUP / SPECIAL_LINGER;
      runner.effects.areaTimer = Math.max(0, runner.effects.areaTimer - decayRate * delta);
    }
    return;
  }
  if (special.type === "lightning") {
    special.cooldown = Math.max(0, (special.cooldown || 0) - delta);
    special.flashTimer = Math.max(0, (special.flashTimer || 0) - delta);
    const centerX = special.cell.x + 0.5;
    const centerY = special.cell.y + 0.5;
    const dist = Math.hypot(centerX - pos.x, centerY - pos.y);
    if (dist <= LIGHTNING_EFFECT_RADIUS + NPC_RADIUS && special.cooldown <= 0 && runner.effects.stunTimer <= 0) {
      runner.effects.stunTimer = LIGHTNING_STUN;
      special.cooldown = LIGHTNING_COOLDOWN;
      special.flashTimer = 0.3;
    }
    runner.effects.areaTimer = 0;
    return;
  }
  if (isPointInsideSpecial(pos, special)) {
    special.effectTimer = SPECIAL_LINGER;
  } else if (special.effectTimer > 0) {
    special.effectTimer = Math.max(0, special.effectTimer - delta);
  }
  runner.effects.areaTimer = special.effectTimer;
}

function updateNeutralSpecialEffects(runner, delta) {
  const list = runner.neutralSpecials;
  if (!list?.length) return;
  const pos = runner.worldPos || runnerWorldPosition(runner);
  list.forEach((special) => {
    special.cooldown = Math.max(0, (special.cooldown || 0) - delta);
    special.flashTimer = Math.max(0, (special.flashTimer || 0) - delta);
    if (special.effectTimer > 0) {
      special.effectTimer = Math.max(0, special.effectTimer - delta);
    }
    if (!special.cell) return;
    if (special.type === "lightning") {
      if (special.cooldown <= 0 && isPointInsideSpecial(pos, special) && runner.effects.stunTimer <= 0) {
        runner.effects.stunTimer = LIGHTNING_STUN;
        special.cooldown = LIGHTNING_COOLDOWN;
        special.flashTimer = 0.3;
      }
      return;
    }
    if (special.type === "row" || special.type === "column") {
      if (isPointInsideSpecial(pos, special)) {
        runner.effects.neutralSlowTimer = SPECIAL_LINGER;
      }
    }
  });
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
  const pos = {
    x: startCenter.x + (endCenter.x - startCenter.x) * t,
    y: startCenter.y + (endCenter.y - startCenter.y) * t
  };
  if (runner.effects.gravityOffset) {
    pos.x += runner.effects.gravityOffset.x;
    pos.y += runner.effects.gravityOffset.y;
  }
  return pos;
}

function updateState(delta) {
  padPulseTimer = (padPulseTimer + delta) % PAD_PULSE_PERIOD;
  if (state.building) {
    if (!state.paused) {
      if (!state.vs.active) {
        state.buildTimeLeft = Math.max(0, state.buildTimeLeft - delta);
        if (state.buildTimeLeft <= 0) {
          startRace(true);
        }
      } else if (state.vs.buildEndsAt) {
        const now = Date.now();
        state.buildTimeLeft = Math.max(0, (state.vs.buildEndsAt - now) / 1000);
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
    timerEl.textContent = "--";
    timerStatusEl.textContent = "Awaiting run";
    if (scoreEl) scoreEl.textContent = "Score: --";
    updateResourceCards();
    return;
  }

  if (state.vs.active && state.vs.waitingForStart) {
    timerEl.textContent = "--";
    timerStatusEl.textContent = "Waiting for other player";
    if (scoreEl) scoreEl.textContent = "Score: --";
    updateResourceCards();
    return;
  }

  if (state.paused) {
    timerEl.textContent = "--";
    timerStatusEl.textContent = "Paused";
  } else if (state.building) {
    if (state.vs.active && state.vs.buildEndsAt) {
      const now = Date.now();
      const remaining = Math.max(0, (state.vs.buildEndsAt - now) / 1000);
      state.buildTimeLeft = remaining;
    }
    timerEl.textContent = `${Math.max(0, state.buildTimeLeft).toFixed(1)}s`;
    timerStatusEl.textContent = state.vs.active ? "VS build phase" : "Build phase";
  } else if (state.race && !state.race.finished) {
    const elapsed = state.race.elapsedTime || 0;
    timerEl.textContent = `${elapsed.toFixed(1)}s`;
    timerStatusEl.textContent = state.vs.active ? "VS race in progress" : "Race in progress";
  } else if (state.race && state.race.finished && state.race.elapsed !== null) {
    timerEl.textContent = `${state.race.elapsed.toFixed(1)}s`;
    timerStatusEl.textContent = state.vs.active ? "VS race complete" : "Race complete";
  } else {
    timerEl.textContent = "--";
    timerStatusEl.textContent = "Ready";
  }
  timerEl.classList.toggle("timer-warning", state.building && state.buildTimeLeft <= 20);
  if (scoreEl) scoreEl.textContent = formatScoreText();
  updateResourceCards();
}

function updateResourceCards() {
  if (!wallsValueEl || !specialValueEl) return;
  if (state.mode === "menu") {
    wallsValueEl.textContent = "--";
    if (singleValueEl) singleValueEl.textContent = "--";
    specialValueEl.textContent = "--";
    updateCurrencySelection(true);
    return;
  }
  wallsValueEl.textContent = state.coins != null ? state.coins : "--";
  if (singleValueEl) {
    singleValueEl.textContent = state.singleBlocks != null ? state.singleBlocks : "--";
  }
  const specialsRemaining = state.playerSpecial?.placed ? 0 : 1;
  specialValueEl.textContent = specialsRemaining.toString();
  updateCurrencySelection();
}

function updateCurrencySelection(forceDisabled = false) {
  if (wallsCard) {
    const canUseWalls = !forceDisabled && state.building && state.coins > 0;
    wallsCard.classList.toggle("disabled", !canUseWalls);
    wallsCard.classList.toggle("active", state.building && state.buildMode === "normal" && canUseWalls);
  }
  if (singleCard) {
    const canUseSingle = !forceDisabled && state.building && state.singleBlocks > 0;
    const isActive = state.building && state.buildMode === "single" && canUseSingle;
    singleCard.classList.toggle("disabled", !canUseSingle);
    singleCard.classList.toggle("active", isActive);
  }
  if (specialCard) {
    const canUseSpecial = !forceDisabled && state.building && !state.playerSpecial?.placed;
    const isActive = state.building && state.buildMode === "special" && canUseSpecial;
    specialCard.classList.toggle("disabled", !canUseSpecial);
    specialCard.classList.toggle("active", isActive);
  }
}

function formatScoreText() {
  const finished = !!(state.race && state.race.finished);
  const formatVal = (val) => {
    if (val == null) return finished ? "DNF" : "--";
    return `${val.toFixed(2)}s`;
  };
  const playerText = formatVal(state.results.player);
  const foeText = formatVal(state.results.ai);
  const oppLabel = state.vs.active ? "Foe" : "AI";
  return `Score: You ${playerText} | ${oppLabel} ${foeText}`;
}

function formatLabelScore(label) {
  const finished = !!(state.race && state.race.finished);
  const valFor = (val) => {
    if (val == null) return finished ? " (DNF)" : " (--)";
    return ` (${val.toFixed(2)}s)`;
  };
  if (label.startsWith("You")) {
    return valFor(state.results.player);
  }
  if (label.startsWith("AI") || label.startsWith("Foe")) {
    return valFor(state.results.ai);
  }
  return "";
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
      {
        label: "You",
        grid: state.playerGrid,
        special: state.playerSpecial,
        runner: null,
        overlay: null,
        neutralSpecials: state.neutralSpecials
      },
      {
        label: state.vs.active ? "Foe" : "AI Preview",
        grid: state.baseGrid,
        special: null,
        runner: null,
        overlay: state.vs.active ? "Foe layout revealed at race" : "AI layout revealed at race",
        neutralSpecials: state.neutralSpecials
      }
    ];
  }
  if (state.race) {
    return state.race.runners.map((runner) => ({
      label: runner.label,
      grid: runner.grid,
      special: runner.special,
      runner,
      neutralSpecials: runner.neutralSpecials || state.neutralSpecials
    }));
  }
  return [
    {
      label: "You",
      grid: state.playerGrid,
      special: state.playerSpecial,
      runner: null,
      neutralSpecials: state.neutralSpecials
    },
    {
      label: "AI",
      grid: state.aiGrid || state.baseGrid,
      special: state.aiSpecial,
      runner: null,
      neutralSpecials: state.neutralSpecials
    }
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
    const neutralSpecials = view.neutralSpecials || [];
    neutralSpecials.forEach((spec) => drawSpecialOverlay({ ...spec, dimmed: true }));
    if (view.special?.placed) {
      drawSpecialOverlay(view.special);
    }
    drawCells(view.grid, view.special, neutralSpecials);
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
  ctx.fillText(`${view.label}${formatLabelScore(view.label)}`, VIEW_BORDER + 10, 8);

  ctx.restore();
}

function drawSpecialOverlay(special) {
  ctx.save();
  if (special.dimmed) {
    ctx.globalAlpha *= 0.6;
  }
  if (special.type === "radius") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, GRID_OFFSET_Y, VIEW_WIDTH, GRID_SIZE * CELL_SIZE);
    ctx.clip();
    const centerX = (special.cell.x + 0.5) * CELL_SIZE;
    const centerY = GRID_OFFSET_Y + (special.cell.y + 0.5) * CELL_SIZE;
    const radius = (SPECIAL_RADIUS + 0.5) * CELL_SIZE;
    const innerRadius = radius - 6;
    const outerRingGrad = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, radius);
    outerRingGrad.addColorStop(0, "rgba(255,255,255,0.015)");
    outerRingGrad.addColorStop(1, "rgba(120, 190, 255, 0.14)");
    ctx.fillStyle = outerRingGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
    ctx.fill();

    const innerGlow = ctx.createRadialGradient(centerX, centerY, innerRadius * 0.2, centerX, centerY, innerRadius * 0.9);
    innerGlow.addColorStop(0, "rgba(200, 235, 255, 0.08)");
    innerGlow.addColorStop(1, "rgba(200, 235, 255, 0)");
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius * 0.9, 0, Math.PI * 2);
    ctx.fill();
    drawSnowflake(centerX, centerY, innerRadius * 0.8);
    drawIcyArrows(centerX, centerY, innerRadius);
    ctx.restore();
  } else if (special.type === "gravity") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, GRID_OFFSET_Y, VIEW_WIDTH, GRID_SIZE * CELL_SIZE);
    ctx.clip();
    const centerX = (special.cell.x + 0.5) * CELL_SIZE;
    const centerY = GRID_OFFSET_Y + (special.cell.y + 0.5) * CELL_SIZE;
    const radius = SPECIAL_RADIUS * CELL_SIZE;
    const grad = ctx.createRadialGradient(centerX, centerY, radius * 0.2, centerX, centerY, radius);
    grad.addColorStop(0, "rgba(150, 90, 220, 0.35)");
    grad.addColorStop(1, "rgba(60, 20, 80, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (special.type === "lightning") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, GRID_OFFSET_Y, VIEW_WIDTH, GRID_SIZE * CELL_SIZE);
    ctx.clip();
    const centerX = (special.cell.x + 0.5) * CELL_SIZE;
    const centerY = GRID_OFFSET_Y + (special.cell.y + 0.5) * CELL_SIZE;
    const ratio = 1 - Math.min(1, (special.cooldown || 0) / LIGHTNING_COOLDOWN);
    const radius = LIGHTNING_EFFECT_RADIUS * CELL_SIZE;
    const ready = (special.cooldown || 0) <= 0;
    const colorReady = "rgba(255,215,130,0.15)";
    const colorInactive = "rgba(140,140,160,0.05)";
    ctx.shadowColor = ready ? "rgba(255,230,150,0.35)" : "rgba(200,210,250,0.15)";
    ctx.shadowBlur = ready ? 18 : 8;
    ctx.strokeStyle = ready ? colorReady : colorInactive;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (!ready) {
      const spokes = 10;
      for (let i = 0; i < spokes; i++) {
        const angle = (Math.PI * 2 * i) / spokes;
        const len = radius * ratio;
        // grey guide
        ctx.strokeStyle = "rgba(120,120,140,0.02)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
        ctx.stroke();
        if (len > 0) {
          // gold fill growing outward from center
          ctx.shadowColor = "rgba(255,230,160,0.3)";
          ctx.shadowBlur = 16;
          ctx.strokeStyle = "rgba(255,215,130,0.12)";
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(centerX + Math.cos(angle) * len, centerY + Math.sin(angle) * len);
          ctx.stroke();
          ctx.shadowBlur = ready ? 18 : 8;
          ctx.shadowColor = ready ? "rgba(255,230,150,0.35)" : "rgba(200,210,250,0.15)";
        }
      }
    }
    if (ready || (special.flashTimer || 0) > 0) {
      drawLightningBolts(centerX, centerY, radius, ratio, (special.flashTimer || 0) > 0);
      if ((special.flashTimer || 0) > 0) {
        drawElectricStun(centerX, centerY, radius * 0.5, ratio);
      }
    }
    ctx.restore();
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

function drawCells(grid, specialForGrid, neutralSpecials = []) {
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
      if (cell === CELL_SINGLE) {
        drawSingleBlockSprite(x, y);
        continue;
      }
      if (cell === CELL_SPECIAL) {
        const palette = specialPaletteForCell(specialForGrid, x, y);
        drawSpecialBlockSprite(x, y, palette);
        continue;
      }
      if (cell === CELL_STATIC_SPECIAL) {
        const palette = neutralPaletteForCell(neutralSpecials, x, y);
        drawSpecialBlockSprite(x, y, palette);
        continue;
      }
      if (isPadCell(cell)) {
        drawPadPlate(cell, x, y);
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
      outer: "#1c2f4f",
      inner: "#8ad0ff",
      border: "#1c4f8c",
      highlight: "rgba(255,255,255,0.25)",
      glyph: "✶",
      glyphScale: 1.5,
      glyphOffsetPx: { x: 0, y: 0.8 }
    };
  }
  if (special.type === "row" || special.type === "column") {
    return {
      outer: "#4e2a74",
      inner: "#b98cff",
      border: "#110517",
      highlight: "rgba(255,255,255,0.2)",
      arrow: special.type === "row" ? "horizontal" : "vertical"
    };
  }
  if (special.type === "gravity") {
    return {
      outer: "#2a0b3f",
      inner: "#9059d6",
      border: "#120620",
      highlight: "rgba(255,255,255,0.15)",
      glyph: "⊙",
      glyphScale: 0.88,
      glyphOffsetPx: { x: -0.6, y: 0.8 }
    };
  }
  if (special.type === "lightning") {
    return {
      outer: "#5a3b04",
      inner: "#ffcb64",
      border: "#1e1100",
      highlight: "rgba(255,255,255,0.22)",
      glyph: "Ψ",
      glyphScale: 1,
      glyphOffsetPx: { x: 0, y: 1.2 }
    };
  }
  return null;
}

function neutralPaletteForCell(neutralSpecials, x, y) {
  const target = findNeutralSpecial(neutralSpecials, x, y);
  if (!target)
    return {
      outer: "#2c2c2c",
      inner: "#5a5a5a",
      border: "#101010",
      highlight: "rgba(255,255,255,0.08)",
      glyph: "?"
    };
  if (target.type === "row" || target.type === "column") {
    return {
      outer: "#392048",
      inner: "#7a5a9e",
      border: "#110517",
      highlight: "rgba(255,255,255,0.12)",
      arrow: target.type === "row" ? "horizontal" : "vertical"
    };
  }
  if (target.type === "lightning") {
    return {
      outer: "#5a4a1c",
      inner: "#c7a956",
      border: "#1f1604",
      highlight: "rgba(255,255,255,0.12)",
      glyph: "Ψ",
      glyphOffsetPx: { x: 0, y: 2 }
    };
  }
  return {
    outer: "#2c2c2c",
    inner: "#5a5a5a",
    border: "#101010",
    highlight: "rgba(255,255,255,0.08)",
    glyph: "?",
    glyphColor: "#f5f5f5"
  };
}

function cellColor(cell) {
  switch (cell) {
    case CELL_STATIC:
      return "#6a6a6a";
    case CELL_PLAYER:
      return "#2ba84a";
    case CELL_SINGLE:
      return "#8a8a8a";
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
  } else if (state.buildMode === "single") {
    if (!canPlaceSingle(state.playerGrid, x, y)) {
      ctx.restore();
      return;
    }
    const out = state.singleBlocks <= 0;
    ctx.fillStyle = out ? "rgba(255, 80, 80, 0.35)" : "rgba(255,255,255,0.15)";
    ctx.fillRect(x * CELL_SIZE, GRID_OFFSET_Y + y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  } else {
    if (!canPlaceBlock(state.playerGrid, x, y)) {
      ctx.restore();
      return;
    }
    const outOfWalls = state.coins <= 0;
    ctx.fillStyle = outOfWalls ? "rgba(255, 80, 80, 0.4)" : "rgba(255,255,255,0.15)";
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
  if (type === "radius") return "Freezing Field";
  if (type === "row") return "Horizontal Slow Beam";
  if (type === "column") return "Vertical Slow Beam";
  if (type === "gravity") return "Gravity Well";
  if (type === "lightning") return "Lightning Strike";
  return "Unknown";
}


function updateSpecialInfo() {
  if (!state.playerSpecial) {
    if (specialInfoEl) specialInfoEl.textContent = "Special: --";
    updateResourceCards();
    renderSpecialPreview();
    return;
  }
  const status = state.playerSpecial.placed ? "placed" : "ready";
  if (specialInfoEl) {
    specialInfoEl.textContent = `Special: ${getSpecialTypeName(state.playerSpecial.type)} (${status})`;
  }
  updateResourceCards();
  renderSpecialPreview();
}

function updatePhaseLabel(text) {
  if (phaseEl) phaseEl.textContent = text;
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
  document.addEventListener("mousedown", handlePopupBackdrop, true);
}

function hideResultPopup() {
  resultPopup.classList.add("hidden");
  document.removeEventListener("mousedown", handlePopupBackdrop, true);
}

function handlePopupBackdrop(evt) {
  if (!resultCard) return;
  if (!resultCard.contains(evt.target)) {
    hideResultPopup();
  }
}

// Override result popup to use Foe labeling in VS mode
function showResultPopup() {
  if (!state.results.winner) return;
  const { player, ai, winner } = state.results;
  const oppLabel = state.vs.active ? "Foe" : "AI";
  let emoji = "🙂";
  if (winner.includes("You")) emoji = "😄";
  else if (winner.includes("AI") || winner.includes("Foe")) emoji = "😞";
  let detail = "";
  if (player != null && ai != null) {
    const diff = Math.abs(player - ai).toFixed(2);
    detail = `${winner} by ${diff}s`;
  } else {
    detail = winner;
  }
  popupEmojiEl.textContent = emoji;
  popupMessageEl.innerHTML = `${detail}<br><span class="popup-detail">You: ${
    player == null ? "DNF" : player.toFixed(2)
  }s &nbsp;|&nbsp; ${oppLabel}: ${ai == null ? "DNF" : ai.toFixed(2)}s</span>`;
  resultPopup.classList.remove("hidden");
  document.addEventListener("mousedown", handlePopupBackdrop, true);
}

function handleShareResult() {
  const shareText = buildShareText();
  if (!shareText) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(shareText).catch(() => fallbackShare(shareText));
  } else {
    fallbackShare(shareText);
  }
}

function buildShareText() {
  const player = state.results.player;
  const ai = state.results.ai;
  if (player == null || ai == null) return `Seed: ${state.seed || "unknown"}`;
  const diff = player - ai;
  const pace = `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`;
  return `Pace ${pace} (Seed: ${state.seed || "unknown"})`;
}

function fallbackShare(text) {
  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "");
  temp.style.position = "absolute";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  temp.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(temp);
  }
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
  closeCatalogue();
  state.mode = "menu";
  state.paused = true;
  hud.classList.add("hidden");
  menuOverlay.classList.remove("hidden");
  pauseOverlay.classList.add("hidden");
  updateHud();
  setSeedUiVisible(true);
  setVsUiVisible(false);
  applyVsVisibility(false);
  cancelAiBuild();
  clearCurrentGameState();
}

function hideMainMenu() {
  state.mode = "game";
  hud.classList.remove("hidden");
  menuOverlay.classList.add("hidden");
  updateHud();
}

function showLoadingOverlay(message = "Preparing...") {
  loadingText.textContent = message;
  loadingOverlay.classList.remove("hidden");
}

function hideLoadingOverlay() {
  loadingOverlay.classList.add("hidden");
}

function showPause() {
  if (state.vs.active) return;
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

function openCatalogue() {
  if (!catalogueOverlay || state.catalogueOpen) return;
  state.catalogueOpen = true;
  cataloguePrevPaused = state.paused;
  populateCatalogueList();
  catalogueOverlay.classList.remove("hidden");
}

function closeCatalogue() {
  if (!catalogueOverlay || !state.catalogueOpen) return;
  state.catalogueOpen = false;
  state.paused = cataloguePrevPaused;
  catalogueOverlay.classList.add("hidden");
}

function populateCatalogueList() {
  if (!catalogueListEl) return;
  catalogueListEl.innerHTML = "";
  CATALOGUE_ITEMS.forEach((item) => {
    const entry = document.createElement("div");
    entry.className = "catalogue-item";
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    canvas.className = "catalogue-icon";
    const ctxIcon = canvas.getContext("2d");
    drawCatalogueIcon(ctxIcon, item.icon);
    const textWrap = document.createElement("div");
    textWrap.className = "catalogue-text";
    const title = document.createElement("h3");
    title.textContent = item.name;
    const body = document.createElement("p");
    const description = typeof item.description === "function" ? item.description() : item.description;
    body.textContent = description;
    textWrap.appendChild(title);
    textWrap.appendChild(body);
    entry.appendChild(canvas);
    entry.appendChild(textWrap);
    catalogueListEl.appendChild(entry);
  });
}

function drawCatalogueIcon(ctx, icon) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, w, h);
  switch (icon) {
    case "gate-start":
      drawCatalogueGateIcon(ctx, "S");
      break;
    case "gate-finish":
      drawCatalogueGateIcon(ctx, "F");
      break;
    case "wall-static":
      renderCatalogueSprite(ctx, (localCtx) => drawStaticBlockSprite(0, 0, localCtx, 0));
      break;
    case "wall-player":
      renderCatalogueSprite(ctx, (localCtx) => drawPlayerBlockSprite(0, 0, localCtx, 0));
      break;
    case "wall-single":
      renderCatalogueSprite(ctx, (localCtx) => drawSingleBlockSprite(0, 0, localCtx, 0));
      break;
    case "pad-speed":
      renderCatalogueSprite(ctx, (localCtx) => drawPadPlate(CELL_SPEED, 0, 0, localCtx, 0));
      break;
    case "pad-slow":
      renderCatalogueSprite(ctx, (localCtx) => drawPadPlate(CELL_SLOW, 0, 0, localCtx, 0));
      break;
    case "pad-detour":
      renderCatalogueSprite(ctx, (localCtx) => drawPadPlate(CELL_DETOUR, 0, 0, localCtx, 0));
      break;
    case "pad-stone":
      renderCatalogueSprite(ctx, (localCtx) => drawPadPlate(CELL_STONE, 0, 0, localCtx, 0));
      break;
    case "pad-rewind":
      renderCatalogueSprite(ctx, (localCtx) => drawPadPlate(CELL_REWIND, 0, 0, localCtx, 0));
      break;
    case "special-freeze":
      renderSpecialCatalogueSprite(ctx, "radius");
      break;
    case "special-row":
      renderSpecialCatalogueSprite(ctx, "row");
      break;
    case "special-column":
      renderSpecialCatalogueSprite(ctx, "column");
      break;
    case "special-gravity":
      renderSpecialCatalogueSprite(ctx, "gravity");
      break;
    case "special-lightning":
      renderSpecialCatalogueSprite(ctx, "lightning");
      break;
    default:
      drawCatalogueBlockIcon(ctx, "#2a2a2a", "#4a4a4a");
  }
}

function renderCatalogueSprite(ctx, drawFn) {
  const padX = (ctx.canvas.width - CELL_SIZE) / 2;
  const padY = (ctx.canvas.height - CELL_SIZE) / 2;
  ctx.save();
  ctx.translate(padX, padY);
  drawFn(ctx);
  ctx.restore();
}

function renderSpecialCatalogueSprite(ctx, type) {
  renderCatalogueSprite(ctx, (localCtx) => {
    const previewSpecial = { type, placed: true, cell: { x: 0, y: 0 } };
    const palette = specialPaletteForCell(previewSpecial, 0, 0);
    if (!palette) return;
    drawSpecialBlockSprite(0, 0, palette, localCtx, 0);
  });
}

function drawCatalogueGateIcon(ctx, label) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = "#090909";
  ctx.fillRect(6, 6, w - 12, h - 12);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "bold 20px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2);
}

function drawCatalogueBlockIcon(ctx, outer, inner) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = outer;
  ctx.fillRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = inner;
  ctx.fillRect(10, 10, w - 20, h - 20);
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
  let attempts = 0;
  while (attempts < 200) {
    const grid = createEmptyGrid();
    placeStaticBlocks(grid, rng);
    placePowerPanels(grid, rng);
    ensureOpenings(grid);
    const neutralSpecial = placeNeutralSpecial(grid, rng);
    if (hasPath(grid)) {
      return { grid, neutralSpecial };
    }
    attempts++;
  }
  const fallback = createEmptyGrid();
  ensureOpenings(fallback);
  return { grid: fallback, neutralSpecial: null };
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
    maybeUpgradePadToSpecial(grid, cell, rng, "speed");
  }
  for (let i = 0; i < slowCount && candidates.length; i++) {
    const cell = candidates.shift();
    grid[cell.y][cell.x] = CELL_SLOW;
    maybeUpgradePadToSpecial(grid, cell, rng, "slow");
  }
}

function placeNeutralSpecial(grid, rng) {
  const roll = rng();
  if (roll < 0.25) return null;
  const type = roll < 0.5 ? "lightning" : roll < 0.75 ? "row" : "column";
  const cells = [];
  for (let y = 1; y < GRID_SIZE - 1; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === CELL_EMPTY && Math.abs(x - ENTRANCE_X) > 1) {
        cells.push({ x, y });
      }
    }
  }
  shuffleWithRng(cells, rng);
  for (const cell of cells) {
    grid[cell.y][cell.x] = CELL_STATIC_SPECIAL;
    ensureOpenings(grid);
    if (hasPath(grid)) {
      return createNeutralSpecial(type, cell);
    }
    grid[cell.y][cell.x] = CELL_EMPTY;
  }
  return null;
}

function maybeUpgradePadToSpecial(grid, cell, rng, baseType) {
  const chance = baseType === "slow" ? 0.15 : 0.01;
  if (rng() > chance) return;
  const options = [CELL_DETOUR, CELL_STONE, CELL_REWIND];
  const pick = options[Math.floor(rng() * options.length)];
  grid[cell.y][cell.x] = pick;
}

function ensureOpenings(grid) {
  clearBlockingAt(grid, ENTRANCE_X, 0);
  clearBlockingAt(grid, ENTRANCE_X, GRID_SIZE - 1);
  grid[0][ENTRANCE_X] = CELL_EMPTY;
  grid[GRID_SIZE - 1][ENTRANCE_X] = CELL_EMPTY;
}

function clearBlockingAt(grid, x, y) {
  const val = grid[y][x];
  if (val === CELL_PLAYER) {
    const anchorX = grid[y][x - 1] === CELL_PLAYER ? x - 1 : x;
    const anchorY = grid[y - 1]?.[x] === CELL_PLAYER ? y - 1 : y;
    clearBlock(grid, anchorX, anchorY);
  } else if (val === CELL_SINGLE) {
    grid[y][x] = CELL_EMPTY;
  }
}

function isInsideGrid(x, y) {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
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

function canPlaceSingle(grid, gx, gy) {
  if (!isInsideGrid(gx, gy)) return false;
  if ((gy === 0 || gy === GRID_SIZE - 1) && gx === ENTRANCE_X) return false;
  return grid[gy][gx] === CELL_EMPTY;
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

function countCells(grid, value) {
  if (!grid) return 0;
  let total = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === value) total++;
    }
  }
  return total;
}

function isCellAvailableForSpecial(grid, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return false;
  if ((gy === 0 || gy === GRID_SIZE - 1) && gx === ENTRANCE_X) return false;
  const value = grid[gy][gx];
  if ([CELL_STATIC, CELL_STATIC_SPECIAL, CELL_PLAYER, CELL_SPECIAL, CELL_SINGLE].includes(value)) return false;
  if (isPadCell(value)) return false;
  return true;
}

// PATHFINDING ---------------------------------------------------------------

function computePath(grid) {
  const start = { x: ENTRANCE_X, y: GRID_SIZE - 1 };
  const goal = { x: ENTRANCE_X, y: 0 };
  const raw = findPath(grid, start, goal);
  if (!raw.length) return [];
  return extendWithEntrances(raw);
}

function computePathFromCell(grid, startCell) {
  if (!startCell) return [];
  const goal = { x: ENTRANCE_X, y: 0 };
  const path = findPath(grid, { x: startCell.x, y: startCell.y }, goal);
  if (!path.length) return [];
  path.push({ x: ENTRANCE_X, y: -1 });
  return path;
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
    value === CELL_DETOUR ||
    value === CELL_STONE ||
    value === CELL_REWIND ||
    value === CELL_SPEED_USED ||
    value === CELL_SLOW_USED ||
    value === CELL_DETOUR_USED ||
    value === CELL_STONE_USED ||
    value === CELL_REWIND_USED
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

function evaluateGridForAi(grid, special = null, neutralSpecials = [], pathInfoOverride = null) {
  const info = pathInfoOverride || analyzePath(grid);
  if (!info) return -Infinity;
  const prediction = estimatePredictedRunTime(grid, info, special, neutralSpecials);
  const baseline = estimatePredictedRunTime(grid, info, null, neutralSpecials);
  const components = prediction.components || {
    slowTime: 0,
    slowStackTime: 0,
    specialOwnedTime: 0,
    specialNeutralTime: 0
  };
  const predictedTime = prediction.time;
  const baselineTime = baseline.time;
  const specialDelta = Math.max(0, predictedTime - baselineTime);
  const pathContribution = (info.totalDistance / NPC_SPEED) * aiWeights.pathTime;
  const slowContribution = components.slowTime * aiWeights.slowTime;
  const slowStackContribution = components.slowStackTime * aiWeights.slowStack;
  const specialImpactContribution =
    specialDelta * aiWeights.specialTime * PAD_TIME_TO_DISTANCE +
    specialDelta * SPECIAL_PLACEMENT_BONUS;
  const neutralSpecialContribution =
    components.specialNeutralTime * aiWeights.neutralSpecialTime * PAD_TIME_TO_DISTANCE;
  const interactionContribution = aiWeights.slowInteraction * components.slowTime * info.totalDistance;
  const blockUsageContribution =
    computeBlockUsageScore(grid, info.path) * aiWeights.blockUsage;
  const lightningPenalty = prediction.lightningPenalty * aiWeights.lightningPadPenalty;
  const beamCrossContribution = computeBeamCrossings(info.path, special) * aiWeights.beamCrossings;
  const turnContribution = computePathTurnCount(info.path) * aiWeights.pathTurns;
  return (
    info.totalDistance * AI_PATH_WEIGHT +
    info.padScore +
    pathContribution +
    turnContribution +
    slowContribution +
    slowStackContribution +
    specialImpactContribution +
    neutralSpecialContribution +
    interactionContribution +
    blockUsageContribution +
    beamCrossContribution -
    lightningPenalty
  );
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

function computePathTurnCount(path) {
  if (!path || path.length < 3) return 0;
  let turns = 0;
  let prevDx = Math.sign(path[1].x - path[0].x);
  let prevDy = Math.sign(path[1].y - path[0].y);
  for (let i = 2; i < path.length; i++) {
    const dx = Math.sign(path[i].x - path[i - 1].x);
    const dy = Math.sign(path[i].y - path[i - 1].y);
    if (dx !== prevDx || dy !== prevDy) {
      turns++;
    }
    prevDx = dx;
    prevDy = dy;
  }
  return turns;
}

function analyzePath(grid) {
  const path = computePath(grid);
  if (!path.length) return null;
  const lengths = computeSegmentLengths(path);
  const totalDistance = lengths.reduce((sum, len) => sum + len, 0);
  const padScore = computePadScore(grid, path);
  return { path, lengths, totalDistance, padScore };
}

function computePadScore(grid, path) {
  let score = 0;
  const visited = new Set();
  for (const node of path) {
    if (node.x < 0 || node.y < 0 || node.x >= GRID_SIZE || node.y >= GRID_SIZE) continue;
    const key = keyFor(node.x, node.y);
    if (visited.has(key)) continue;
    visited.add(key);
    const value = grid[node.y]?.[node.x];
    const padType = padTypeFromCell(value);
    if (padType && PAD_AI_SCORES[padType]) {
      score += PAD_AI_SCORES[padType];
    }
  }
  return score;
}

function padIsMandatory(grid, x, y) {
  if (!isInsideGrid(x, y)) return false;
  const value = grid[y][x];
  if (padTypeFromCell(value) !== "speed") return false;
  const testGrid = cloneGrid(grid);
  testGrid[y][x] = CELL_PLAYER;
  ensureOpenings(testGrid);
  return !hasPath(testGrid);
}

function countMandatorySpeedPads(grid, path) {
  if (!path?.length) return 0;
  let count = 0;
  const checked = new Set();
  path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const key = keyFor(node.x, node.y);
    if (checked.has(key)) return;
    checked.add(key);
    const value = grid[node.y]?.[node.x];
    if (padTypeFromCell(value) === "speed" && padIsMandatory(grid, node.x, node.y)) {
      count++;
    }
  });
  return count;
}

function computeBlockUsageScore(grid, path) {
  if (!path?.length || !state.baseGrid) return 0;
  const totalStatic = state.baseStaticCount || 0;
  if (!totalStatic) return 0;
  let used = 0;
  const seen = new Set();
  path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const key = keyFor(node.x, node.y);
    if (seen.has(key)) return;
    seen.add(key);
    if (state.baseGrid[node.y]?.[node.x] === CELL_STATIC) {
      used++;
    }
  });
  return used / Math.max(1, totalStatic);
}

function computeLightningPadPenalty(grid, pathInfo, special) {
  if (!special?.placed || special.type !== "lightning") return 0;
  let penalty = 0;
  const zapWindow = LIGHTNING_COOLDOWN + LIGHTNING_STUN;
  iteratePathSegments(pathInfo, (cell, baseTime) => {
    if (!isInsideGrid(cell.x, cell.y)) return;
    const padType = padTypeFromCell(grid[cell.y]?.[cell.x]);
    if (padType !== "slow") return;
    const center = centerOf(cell);
    const dist = Math.hypot(
      special.cell.x + 0.5 - center.x,
      special.cell.y + 0.5 - center.y
    );
    const overlap =
      dist <= SPECIAL_RADIUS + NPC_RADIUS
        ? Math.max(0, SPECIAL_RADIUS + NPC_RADIUS - dist) / (SPECIAL_RADIUS + NPC_RADIUS)
        : 0;
    if (overlap <= 0) return;
    const hitChance = Math.min(1, (baseTime / zapWindow) * overlap);
    const expectedStun = LIGHTNING_STUN * hitChance;
    penalty += expectedStun * 0.7;
  });
  return penalty;
}

function computeBeamCrossings(path, special) {
  if (!special?.placed) return 0;
  if (special.type !== "row" && special.type !== "column") return 0;
  let crossings = 0;
  let inside = false;
  path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const posInside =
      special.type === "row"
        ? node.y === special.cell.y
        : node.x === special.cell.x;
    if (posInside && !inside) {
      crossings++;
    }
    inside = posInside;
  });
  return crossings;
}

function computeLightningHits(pathInfo, special) {
  if (!special?.placed || special.type !== "lightning") return 0;
  let cooldown = 0;
  let hits = 0;
  iteratePathSegments(pathInfo, (cell, baseTime) => {
    const center = centerOf(cell);
    const dist = Math.hypot(
      special.cell.x + 0.5 - center.x,
      special.cell.y + 0.5 - center.y
    );
    const inside = dist <= LIGHTNING_EFFECT_RADIUS + NPC_RADIUS;
    if (inside && cooldown <= 0) {
      hits++;
      cooldown = LIGHTNING_COOLDOWN;
    }
    cooldown = Math.max(0, cooldown - baseTime);
  });
  return hits;
}

function computeSpecialUsageTimes(grid, pathInfo, special, neutralSpecials = []) {
  const owned = estimateTimeForSpecial(grid, pathInfo, special);
  let neutral = 0;
  if (neutralSpecials?.length) {
    neutralSpecials.forEach((ns) => {
      if (!ns?.placed || !ns.cell) return;
      neutral += estimateTimeForSpecial(grid, pathInfo, ns);
    });
  }
  const padSynergy = special?.placed ? estimateSpecialPadSynergyTime(grid, pathInfo.path, special) : 0;
  const overlap = special?.placed
    ? estimateSpecialOverlapTime(pathInfo.path, special, neutralSpecials)
    : 0;
  return { owned: owned + padSynergy + overlap, neutral };
}

function estimateTimeForSpecial(grid, pathInfo, special) {
  if (!special?.placed || !special.cell || !pathInfo?.path?.length) return 0;
  switch (special.type) {
    case "radius":
      return estimateRadiusSlowTime(pathInfo, special);
    case "row":
      return estimateBeamSlowTime(pathInfo, special, "row");
    case "column":
      return estimateBeamSlowTime(pathInfo, special, "column");
    case "gravity":
      return estimateGravitySlowTime(pathInfo, special);
    case "lightning":
      return estimateLightningSlowTime(pathInfo, special);
    default:
      return 0;
  }
}

function estimateRadiusSlowTime(pathInfo, special) {
  const decayRate = FREEZING_BUILDUP / SPECIAL_LINGER;
  let timer = 0;
  let total = 0;
  iteratePathSegments(pathInfo, (cell, baseTime) => {
    const inside = isPointInsideSpecial(centerOf(cell), special);
    if (inside) {
      timer = Math.min(FREEZING_BUILDUP, timer + baseTime);
    } else if (timer > 0) {
      timer = Math.max(0, timer - decayRate * baseTime);
    }
    if (timer > 0) {
      const ratio = Math.min(1, timer / FREEZING_BUILDUP);
      const auraMult =
        SPECIAL_SLOW_MULT - (SPECIAL_SLOW_MULT - FREEZING_MIN_MULT) * ratio;
      total += baseTime * (1 / auraMult - 1);
    }
  });
  return total;
}

function estimateBeamSlowTime(pathInfo, special, orientation) {
  let linger = 0;
  let total = 0;
  iteratePathSegments(pathInfo, (cell, baseTime) => {
    const inside =
      orientation === "row"
        ? cell.y === special.cell.y
        : cell.x === special.cell.x;
    if (inside) {
      linger = BEAM_LINGER_CAP;
    }
    const active = inside ? Math.min(baseTime, SPECIAL_LINGER) : Math.min(baseTime, linger);
    if (inside || linger > 0) {
      total += active * (1 / SPECIAL_SLOW_MULT - 1);
    }
    if (!inside && linger > 0) {
      linger = Math.max(0, linger - baseTime);
    }
  });
  return total;
}

function estimateGravitySlowTime(pathInfo, special) {
  let total = 0;
  iteratePathSegments(pathInfo, (cell, baseTime) => {
    const center = centerOf(cell);
    const dx = special.cell.x + 0.5 - center.x;
    const dy = special.cell.y + 0.5 - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= SPECIAL_RADIUS) {
      const ratio = Math.max(0, Math.min(1, dist / SPECIAL_RADIUS));
      const target =
        GRAVITY_MIN_MULT + (GRAVITY_MAX_MULT - GRAVITY_MIN_MULT) * ratio;
      total += baseTime * (1 / target - 1);
    }
  });
  return total;
}

function estimateLightningSlowTime(pathInfo, special) {
  let cooldown = 0;
  let total = 0;
  iteratePathSegments(pathInfo, (cell, baseTime) => {
    const center = centerOf(cell);
    const dist = Math.hypot(
      special.cell.x + 0.5 - center.x,
      special.cell.y + 0.5 - center.y
    );
    const inside = dist <= LIGHTNING_EFFECT_RADIUS + NPC_RADIUS;
    if (inside && cooldown <= 0) {
      total += LIGHTNING_STUN;
      cooldown = LIGHTNING_COOLDOWN;
    }
    cooldown = Math.max(0, cooldown - baseTime);
  });
  return total;
}

function iteratePathSegments(pathInfo, callback) {
  const path = pathInfo.path;
  if (!path?.length) return;
  for (let i = 1; i < path.length; i++) {
    const cell = path[i];
    const baseTime = (pathInfo.lengths[i - 1] || 0) / NPC_SPEED;
    callback(cell, baseTime, i);
  }
}

function estimateDetourForcedDistance(grid, current, previous) {
  if (!previous) return 0;
  const stepX = Math.sign(previous.x - current.x);
  const stepY = Math.sign(previous.y - current.y);
  if (stepX === 0 && stepY === 0) return 0;
  let distance = 0;
  let x = current.x;
  let y = current.y;
  while (true) {
    const nextX = x + stepX;
    const nextY = y + stepY;
    if (!isInsideGrid(nextX, nextY)) break;
    if (!isWalkableCell(grid, nextX, nextY)) break;
    distance++;
    x = nextX;
    y = nextY;
  }
  return distance;
}

function computePadSlowTime(grid, pathInfo) {
  if (!pathInfo?.path?.length) return 0;
  let total = 0;
  const visited = new Set();
  let distanceSoFar = 0;
  for (let i = 0; i < pathInfo.path.length; i++) {
    if (i > 0) {
      distanceSoFar += pathInfo.lengths[i - 1] || 0;
    }
    const cell = pathInfo.path[i];
    if (!isInsideGrid(cell.x, cell.y)) continue;
    const padType = padTypeFromCell(grid[cell.y]?.[cell.x]);
    if (!padType) continue;
    const key = keyFor(cell.x, cell.y);
    if (visited.has(key)) continue;
    visited.add(key);
    if (padType === "slow") {
      total += PAD_SLOW_EXTRA_TIME;
    } else if (padType === "stone") {
      total += PAD_STONE_EXTRA_TIME;
    } else if (padType === "detour") {
      const forced = estimateDetourForcedDistance(grid, cell, pathInfo.path[i - 1]);
      if (forced > 0) {
        total += forced / NPC_SPEED;
      }
    } else if (padType === "rewind") {
      total += distanceSoFar / NPC_SPEED;
    } else if (padType === "speed") {
      total -= PAD_SPEED_TIME_DELTA;
    }
  }
  return total;
}

function computeDetourDistance(grid, pathInfo) {
  if (!pathInfo?.path?.length) return 0;
  let distance = 0;
  for (let i = 0; i < pathInfo.path.length; i++) {
    const cell = pathInfo.path[i];
    const prev = pathInfo.path[i - 1];
    if (!isInsideGrid(cell.x, cell.y)) continue;
    const padType = padTypeFromCell(grid[cell.y]?.[cell.x]);
    if (padType === "detour") {
      distance += estimateDetourForcedDistance(grid, cell, prev);
    }
  }
  return distance;
}

function computeSlowPadProximityReward(grid, pathInfo) {
  if (!pathInfo?.path?.length) return 0;
  const slowPads = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === CELL_SLOW) {
        slowPads.push({ x, y });
      }
    }
  }
  if (!slowPads.length) return 0;
  let totalReward = 0;
  slowPads.forEach((pad) => {
    let minDist = Infinity;
    pathInfo.path.forEach((node) => {
      if (!isInsideGrid(node.x, node.y)) return;
      const dx = pad.x - node.x;
      const dy = pad.y - node.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < minDist) minDist = dist;
    });
    const reward = 1 / (1 + minDist); // 1 when on path, decays with distance
    totalReward += reward;
  });
  return totalReward / slowPads.length;
}

function computePathCoverage(grid, path) {
  if (!path?.length) return 0;
  let placed = 0;
  let onPath = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const val = grid[y][x];
      if (val === CELL_PLAYER || val === CELL_SINGLE) {
        placed++;
      }
    }
  }
  const seen = new Set();
  path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const key = keyFor(node.x, node.y);
    if (seen.has(key)) return;
    seen.add(key);
    const val = grid[node.y]?.[node.x];
    if (val === CELL_PLAYER || val === CELL_SINGLE) {
      onPath++;
    }
  });
  if (!placed) return 0;
  return onPath / placed;
}

function collectAiTimeComponents(grid, pathInfo, special, neutralSpecials = []) {
  const specialUsage = computeSpecialUsageTimes(grid, pathInfo, special, neutralSpecials);
  const padSlow = computePadSlowTime(grid, pathInfo);
  const slowTime = Math.max(0, padSlow + specialUsage.owned + specialUsage.neutral);
  const slowStackTime = computeSlowStackTime(grid, pathInfo, special, neutralSpecials);
  return {
    slowTime,
    slowStackTime,
    specialOwnedTime: specialUsage.owned,
    specialNeutralTime: specialUsage.neutral
  };
}

function estimatePredictedRunTime(grid, pathInfo, special, neutralSpecials = []) {
  if (!pathInfo) {
    return { time: 0, baseTime: 0, lightningPenalty: 0, components: null };
  }
  const components = collectAiTimeComponents(grid, pathInfo, special, neutralSpecials);
  const baseTime = pathInfo.totalDistance / NPC_SPEED;
  const lightningPenalty = computeLightningPadPenalty(grid, pathInfo, special);
  const predictedTime =
    baseTime + PREDICT_SLOW_SCALE * (components.slowTime + components.slowStackTime + lightningPenalty);
  return { time: predictedTime, baseTime, lightningPenalty, components };
}

function estimateSpecialPadSynergyTime(grid, path, special) {
  if (!path?.length) return 0;
  let time = 0;
  path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const pos = centerOf(node);
    if (!isPointInsideSpecial(pos, special)) return;
    const padType = padTypeFromCell(grid[node.y]?.[node.x]);
    if (!padType) return;
    if (padType === "slow" || padType === "stone") {
      time += SPECIAL_PAD_SYNERGY_TIME;
    } else if (padType === "detour" || padType === "rewind") {
      time += SPECIAL_PAD_SYNERGY_STRONG_TIME;
    }
  });
  return time;
}

function estimateSpecialOverlapTime(path, special, neutralSpecials = []) {
  if (!path?.length || !neutralSpecials?.length) return 0;
  let total = 0;
  neutralSpecials.forEach((neutral) => {
    if (!neutral?.placed || !neutral.cell) return;
    let overlap = 0;
    path.forEach((node) => {
      const pos = centerOf(node);
      if (isPointInsideSpecial(pos, special) && isPointInsideSpecial(pos, neutral)) {
        overlap++;
      }
    });
    if (overlap > 0) {
      total += overlap * SPECIAL_NEUTRAL_OVERLAP_TIME;
    }
  });
  return total;
}

function keyFor(x, y) {
  return `${x},${y}`;
}

function segmentDirectionVector(path, index) {
  if (!path || index == null || index >= path.length - 1 || index < 0) return null;
  const start = centerOf(path[index]);
  const end = centerOf(path[index + 1]);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  return { x: dx / len, y: dy / len };
}

function segmentStep(path, index) {
  if (!path || index == null || index >= path.length - 1 || index < 0) return null;
  const start = path[index];
  const end = path[index + 1];
  return { x: Math.sign(end.x - start.x), y: Math.sign(end.y - start.y) };
}

function centerOf(node) {
  return { x: node.x + 0.5, y: node.y + 0.5 };
}

function scoreSpecialPlacement(pathInfo, specialType, cell) {
  const special = { type: specialType, placed: true, cell };
  const positions = pathInfo.path;
  switch (specialType) {
    case "radius":
      return scoreRadiusPlacement(positions, special) * SPECIAL_RADIUS_WEIGHT;
    case "row":
    case "column":
      return scoreBeamPlacement(positions, special) * SPECIAL_BEAM_WEIGHT;
    case "gravity":
      return scoreGravityPlacement(positions, special) * SPECIAL_GRAVITY_WEIGHT;
    case "lightning":
      return scoreLightningPlacement(positions, special) * SPECIAL_LIGHTNING_WEIGHT;
    default:
      return 0;
  }
}

function scoreRadiusPlacement(pathNodes, special) {
  let coverage = 0;
  pathNodes.forEach((node) => {
    if (node.x < 0 || node.x >= GRID_SIZE || node.y < 0 || node.y >= GRID_SIZE) return;
    const pos = { x: node.x + 0.5, y: node.y + 0.5 };
    if (isPointInsideSpecial(pos, special)) coverage++;
  });
  return coverage;
}

function scoreBeamPlacement(pathNodes, special) {
  let coverage = 0;
  pathNodes.forEach((node) => {
    const pos = { x: node.x + 0.5, y: node.y + 0.5 };
    if (isPointInsideSpecial(pos, special)) coverage++;
  });
  return coverage;
}

function scoreGravityPlacement(pathNodes, special) {
  let total = 0;
  const centerX = special.cell.x + 0.5;
  const centerY = special.cell.y + 0.5;
  pathNodes.forEach((node) => {
    const pos = { x: node.x + 0.5, y: node.y + 0.5 };
    const dx = pos.x - centerX;
    const dy = pos.y - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist <= SPECIAL_RADIUS) {
      total += (SPECIAL_RADIUS - dist) / SPECIAL_RADIUS;
    }
  });
  return total;
}

function scoreLightningPlacement(pathNodes, special) {
  let hits = 0;
  let inside = false;
  pathNodes.forEach((node) => {
    const pos = { x: node.x + 0.5, y: node.y + 0.5 };
    const nowInside = isPointInsideSpecial(pos, special);
    if (nowInside && !inside) hits++;
    inside = nowInside;
  });
  return hits;
}

function drawPadPlate(cell, gridX, gridY, context = ctx, offsetY = GRID_OFFSET_Y) {
  const renderCtx = context;
  const type = padTypeFromCell(cell);
  if (!type) return;
  const config = PAD_VISUALS[type] || PAD_VISUALS.speed;
  const isActive = isPadActiveCell(cell);
  const color = config.color;
  let inset = config.inset ?? 10;
  let alpha = config.idleAlpha ?? 0.3;
  const baseBrightness = config.baseBrightness ?? 0.48;
  const pulseRange = config.pulseRange ?? 0.25;
  let brightness = isActive ? baseBrightness : baseBrightness * 0.85;
  if (isActive) {
    const phase = (padPulseTimer / PAD_PULSE_PERIOD) * Math.PI * 2;
    const normalized = (Math.sin(phase) + 1) / 2;
    inset = inset - normalized * 2;
    brightness = baseBrightness + normalized * pulseRange;
    const activeAlpha = config.activeAlpha ?? alpha + 0.25;
    alpha = alpha + normalized * (activeAlpha - alpha);
  } else {
    alpha *= 0.6;
  }
  const r = Math.min(255, Math.round(color.r * brightness));
  const g = Math.min(255, Math.round(color.g * brightness));
  const b = Math.min(255, Math.round(color.b * brightness));
  renderCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  const x = gridX * CELL_SIZE + inset;
  const y = offsetY + gridY * CELL_SIZE + inset;
  renderCtx.fillRect(x, y, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2);
  if (config.iconChar) {
    drawPadGlyph(config, gridX, gridY, color, isActive, renderCtx, offsetY);
  }
}

function drawPadGlyph(config, gridX, gridY, baseColor, isActive, context = ctx, offsetY = GRID_OFFSET_Y) {
  const renderCtx = context;
  const cx = gridX * CELL_SIZE + CELL_SIZE / 2;
  const cy = offsetY + gridY * CELL_SIZE + CELL_SIZE / 2;
  const fontSize = Math.floor(CELL_SIZE * 0.62 * (config.charScale ?? 1));
  const color = config.charColor
    ? config.charColor
    : `rgba(${Math.min(255, Math.round(baseColor.r * 0.85))}, ${Math.min(255, Math.round(baseColor.g * 0.85))}, ${Math.min(255, Math.round(
        baseColor.b * 0.85
      ))}, ${isActive ? 0.95 : 0.65})`;
  const step = CELL_SIZE * 0.05;
  const offsetX = (config.charOffset?.x ?? 0) * step;
  const offsetYChar = (config.charOffset?.y ?? 0) * step;
  renderCtx.save();
  renderCtx.font = `bold ${fontSize}px "Courier New", monospace`;
  renderCtx.textAlign = "center";
  renderCtx.textBaseline = "middle";
  renderCtx.fillStyle = color;
  renderCtx.fillText(config.iconChar, cx + offsetX, cy + offsetYChar);
  renderCtx.restore();
}

function isPadActiveCell(cell) {
  return (
    cell === CELL_SPEED ||
    cell === CELL_SLOW ||
    cell === CELL_DETOUR ||
    cell === CELL_STONE ||
    cell === CELL_REWIND
  );
}

function isPadUsedCell(cell) {
  return (
    cell === CELL_SPEED_USED ||
    cell === CELL_SLOW_USED ||
    cell === CELL_DETOUR_USED ||
    cell === CELL_STONE_USED ||
    cell === CELL_REWIND_USED
  );
}

function isPadCell(cell) {
  return isPadActiveCell(cell) || isPadUsedCell(cell);
}

function padTypeFromCell(cell) {
  switch (cell) {
    case CELL_SPEED:
    case CELL_SPEED_USED:
      return "speed";
    case CELL_SLOW:
    case CELL_SLOW_USED:
      return "slow";
    case CELL_DETOUR:
    case CELL_DETOUR_USED:
      return "detour";
    case CELL_STONE:
    case CELL_STONE_USED:
      return "stone";
    case CELL_REWIND:
    case CELL_REWIND_USED:
      return "rewind";
    default:
      return null;
  }
}

function padUsedVariant(cell) {
  switch (cell) {
    case CELL_SPEED:
      return CELL_SPEED_USED;
    case CELL_SLOW:
      return CELL_SLOW_USED;
    case CELL_DETOUR:
      return CELL_DETOUR_USED;
    case CELL_STONE:
      return CELL_STONE_USED;
    case CELL_REWIND:
      return CELL_REWIND_USED;
    default:
      return cell;
  }
}

function findNeutralSpecial(list, x, y) {
  if (!list) return null;
  return list.find((special) => special?.cell && special.cell.x === x && special.cell.y === y) || null;
}

function drawStaticBlockSprite(gridX, gridY, context = ctx, offsetY = GRID_OFFSET_Y) {
  const baseX = gridX * CELL_SIZE;
  const baseY = offsetY + gridY * CELL_SIZE;
  context.save();
  drawBeveledTile(
    baseX,
    baseY,
    {
      outer: "#163821",
      inner: "#2e623d",
      border: "#04160a",
      highlight: "rgba(185,255,185,0.1)"
    },
    context
  );
  context.restore();
}

function drawPlayerBlockSprite(gridX, gridY, context = ctx, offsetY = GRID_OFFSET_Y) {
  const baseX = gridX * CELL_SIZE;
  const baseY = offsetY + gridY * CELL_SIZE;
  context.save();
  drawBeveledTile(
    baseX,
    baseY,
    {
      outer: "#1d6f2c",
      inner: "#2fb64d",
      border: "#0f2f11",
      highlight: "rgba(255,255,255,0.12)"
    },
    context
  );
  context.restore();
}

function drawSingleBlockSprite(gridX, gridY, context = ctx, offsetY = GRID_OFFSET_Y) {
  const baseX = gridX * CELL_SIZE;
  const baseY = offsetY + gridY * CELL_SIZE;
  context.save();
  drawBeveledTile(
    baseX,
    baseY,
    {
      outer: "#4b4b4b",
      inner: "#7d7d7d",
      border: "#111",
      highlight: "rgba(255,255,255,0.08)"
    },
    context
  );
  context.restore();
}

function drawSpecialBlockSprite(gridX, gridY, paletteOverride, context = ctx, offsetY = GRID_OFFSET_Y) {
  const baseX = gridX * CELL_SIZE;
  const baseY = offsetY + gridY * CELL_SIZE;
  const palette =
    paletteOverride || {
      outer: "#f3cf63",
      inner: "#ffeaa2",
      border: "#3b2f10",
      highlight: "rgba(255,255,255,0.2)",
      arrow: null,
      glyph: "?"
    };
  const { arrow, ...tilePalette } = palette;
  context.save();
  drawBeveledTile(baseX, baseY, tilePalette, context);
  if (arrow) {
    drawBlockLine(baseX, baseY, arrow, context);
  }
  if (palette.glyph) {
    drawSpecialGlyph(baseX, baseY, palette, context);
  }
  context.restore();
}

function drawBlockLine(baseX, baseY, direction, context = ctx) {
  context.save();
  context.fillStyle = "rgba(70, 30, 110, 0.85)";
  const inset = 8;
  const thickness = 4;
  if (direction === "horizontal") {
    const midY = baseY + CELL_SIZE / 2 - thickness / 2;
    context.fillRect(baseX + inset, midY, CELL_SIZE - inset * 2, thickness);
  } else {
    const midX = baseX + CELL_SIZE / 2 - thickness / 2;
    context.fillRect(midX, baseY + inset, thickness, CELL_SIZE - inset * 2);
  }
  context.restore();
}

function drawSpecialGlyph(baseX, baseY, palette, context = ctx) {
  const glyph = palette.glyph;
  if (!glyph) return;
  const color = palette.glyphColor || palette.border || "#fff";
  const scale = palette.glyphScale ?? 1;
  const step = CELL_SIZE * 0.05;
  const offsetX = (palette.glyphOffset?.x ?? 0) * step + (palette.glyphOffsetPx?.x ?? 0);
  const offsetY = (palette.glyphOffset?.y ?? 0) * step + (palette.glyphOffsetPx?.y ?? 0);
  context.save();
  const fontSize = Math.floor(CELL_SIZE * 0.55 * scale);
  context.font = `bold ${fontSize}px "Courier New", monospace`;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(glyph, baseX + CELL_SIZE / 2 + offsetX, baseY + CELL_SIZE / 2 + offsetY);
  context.restore();
}

function drawSnowflake(cx, cy, radius) {
  ctx.save();
  ctx.strokeStyle = "rgba(190, 230, 255, 0.14)";
  ctx.lineWidth = 1.3;
  const arms = 6;
  for (let i = 0; i < arms; i++) {
    const angle = (Math.PI * 2 * i) / arms;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    const branchAngle1 = angle + Math.PI / 6;
    const branchAngle2 = angle - Math.PI / 6;
    const branchLen = radius * 0.35;
    const bx1 = x - Math.cos(angle) * branchLen + Math.cos(branchAngle1) * branchLen;
    const by1 = y - Math.sin(angle) * branchLen + Math.sin(branchAngle1) * branchLen;
    const bx2 = x - Math.cos(angle) * branchLen + Math.cos(branchAngle2) * branchLen;
    const by2 = y - Math.sin(angle) * branchLen + Math.sin(branchAngle2) * branchLen;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(bx1, by1);
    ctx.moveTo(x, y);
    ctx.lineTo(bx2, by2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIcyArrows(cx, cy, radius) {
  const outer = "rgba(130, 195, 255, 0.14)";
  const inner = "rgba(150, 210, 255, 0.14)";
  drawRadialArrows(cx, cy, radius * 0.95, radius * 0.35, 6, 0, outer);
  drawRadialArrows(cx, cy, radius * 0.65, radius * 0.25, 6, Math.PI / 6, inner);
}

function drawRadialArrows(cx, cy, outerLen, innerLen, count, offset, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < count; i++) {
    const angle = offset + (Math.PI * 2 * i) / count;
    const innerX = cx + Math.cos(angle) * innerLen;
    const innerY = cy + Math.sin(angle) * innerLen;
    const outerX = cx + Math.cos(angle) * outerLen;
    const outerY = cy + Math.sin(angle) * outerLen;
    ctx.beginPath();
    ctx.moveTo(innerX, innerY);
    ctx.lineTo(outerX, outerY);
    ctx.stroke();
    const headAngle1 = angle + Math.PI / 6;
    const headAngle2 = angle - Math.PI / 6;
    const headSize = 6;
    ctx.beginPath();
    ctx.moveTo(outerX, outerY);
    ctx.lineTo(outerX - Math.cos(headAngle1) * headSize, outerY - Math.sin(headAngle1) * headSize);
    ctx.lineTo(outerX - Math.cos(headAngle2) * headSize, outerY - Math.sin(headAngle2) * headSize);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawLightningBolts(cx, cy, radius, ratio, flashing) {
  const bolts = 6;
  ctx.save();
  for (let i = 0; i < bolts; i++) {
    const angle = (Math.PI * 2 * i) / bolts + (ratio * Math.PI) / 3;
    const length = radius * (0.6 + 0.2 * Math.random());
    const points = [];
    const segments = 4;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const r = length * t;
      const wobble = (Math.random() - 0.5) * radius * 0.15 * (1 - t);
      const px = cx + Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * wobble;
      const py = cy + Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * wobble;
      points.push({ x: px, y: py });
    }
    ctx.strokeStyle = flashing ? "rgba(255,255,255,0.45)" : "rgba(255,215,130,0.5)";
    ctx.lineWidth = flashing ? 2.5 : 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawElectricStun(cx, cy, radius, intensity) {
  ctx.save();
  const sparks = 12;
  for (let i = 0; i < sparks; i++) {
    const angle = (Math.PI * 2 * i) / sparks;
    const len = radius * (0.6 + 0.3 * Math.random());
    const wobble = (Math.random() - 0.5) * radius * 0.2;
    const color = `rgba(255, 255, 255, ${0.25 + 0.2 * intensity})`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * len + Math.cos(angle + Math.PI / 2) * wobble, cy + Math.sin(angle) * len + Math.sin(angle + Math.PI / 2) * wobble);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBeveledTile(baseX, baseY, palette, context = ctx) {
  const bevel = Math.max(3, Math.floor(CELL_SIZE * 0.18));
  const innerInset = 4;
  context.beginPath();
  context.moveTo(baseX + bevel, baseY);
  context.lineTo(baseX + CELL_SIZE - bevel, baseY);
  context.lineTo(baseX + CELL_SIZE, baseY + bevel);
  context.lineTo(baseX + CELL_SIZE, baseY + CELL_SIZE - bevel);
  context.lineTo(baseX + CELL_SIZE - bevel, baseY + CELL_SIZE);
  context.lineTo(baseX + bevel, baseY + CELL_SIZE);
  context.lineTo(baseX, baseY + CELL_SIZE - bevel);
  context.lineTo(baseX, baseY + bevel);
  context.closePath();

  context.fillStyle = palette.outer;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = palette.border || "#050505";
  context.stroke();

  context.beginPath();
  context.moveTo(baseX + bevel + innerInset, baseY + innerInset);
  context.lineTo(baseX + CELL_SIZE - bevel - innerInset, baseY + innerInset);
  context.lineTo(baseX + CELL_SIZE - innerInset, baseY + bevel + innerInset);
  context.lineTo(baseX + CELL_SIZE - innerInset, baseY + CELL_SIZE - bevel - innerInset);
  context.lineTo(baseX + CELL_SIZE - bevel - innerInset, baseY + CELL_SIZE - innerInset);
  context.lineTo(baseX + bevel + innerInset, baseY + CELL_SIZE - innerInset);
  context.lineTo(baseX + innerInset, baseY + CELL_SIZE - bevel - innerInset);
  context.lineTo(baseX + innerInset, baseY + bevel + innerInset);
  context.closePath();
  context.fillStyle = palette.inner || "#3a3a3a";
  context.fill();

  context.strokeStyle = palette.highlight || "rgba(255,255,255,0.1)";
  context.lineWidth = 1;
  context.setLineDash([2, 3]);
  context.stroke();
}

// SPECIALS -----------------------------------------------------------------

function createSpecialTemplate(type = pickSpecialType(state.rng)) {
  return {
    type,
    cell: null,
    placed: false,
    effectTimer: 0,
    cooldown: 0,
    flashTimer: 0
  };
}

function createNeutralSpecial(type, cell) {
  return {
    type,
    cell: { ...cell },
    placed: true,
    effectTimer: 0,
    cooldown: 0,
    flashTimer: 0,
    neutral: true
  };
}

function cloneSpecial(special) {
  if (!special) return null;
  return {
    type: special.type,
    cell: special.cell ? { ...special.cell } : null,
    placed: special.placed,
    effectTimer: 0,
    cooldown: special.cooldown || 0,
    flashTimer: 0,
    neutral: !!special.neutral
  };
}

function cloneNeutralSpecials(list) {
  if (!list) return [];
  return list.map((special) => cloneSpecial(special));
}

function pickSpecialType(rng) {
  const roll = rng();
  if (roll < 0.25) return "radius";
  if (roll < 0.5) return "lightning";
  if (roll < 0.75) return "gravity";
  if (roll < 0.875) return "row";
  return "column";
}

function isPointInsideSpecial(pos, special) {
  if (!special?.placed || !special.cell) return false;
  const { x, y } = special.cell;
  if (special.type === "radius" || special.type === "gravity" || special.type === "lightning") {
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

function decayGravityOffset(offset, delta) {
  if (!offset) return null;
  const decay = Math.pow(0.5, delta / 2); // ~2s half-life
  const next = { x: offset.x * decay, y: offset.y * decay };
  if (Math.abs(next.x) < 0.001 && Math.abs(next.y) < 0.001) {
    return null;
  }
  return next;
}
function computeSlowStackTime(grid, pathInfo, special, neutralSpecials = []) {
  if (!pathInfo?.path?.length) return 0;
  let total = 0;
  iteratePathSegments(pathInfo, (cell, baseTime) => {
    if (!isInsideGrid(cell.x, cell.y)) return;
    const slows = [];
    const padType = padTypeFromCell(grid[cell.y]?.[cell.x]);
    if (padType === "slow" || padType === "stone") slows.push(1);
    const pos = centerOf(cell);
    if (special?.placed && isPointInsideSpecial(pos, special)) slows.push(1);
    neutralSpecials?.forEach((ns) => {
      if (!ns?.placed) return;
      if (isPointInsideSpecial(pos, ns)) slows.push(1);
    });
    if (slows.length >= 2) {
      total += baseTime * (slows.length - 1);
    }
  });
  return total;
}
