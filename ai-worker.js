/* eslint-disable no-restricted-globals */
// AI worker runs maze generation off the main thread.

// ----------------------------
// Minimal deterministic RNG
// ----------------------------
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------
// Constants (mirrors main.js)
// ----------------------------
const GRID_SIZE = 21;
const ENTRANCE_X = Math.floor(GRID_SIZE / 2);
const NPC_SPEED = 3;
const AI_PATH_WEIGHT = 12;

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

const PAD_AI_SCORES = {
  speed: -3,
  slow: 3,
  detour: 4,
  stone: 3,
  rewind: 8
};

const AI_WEIGHT_DEFAULTS = {
  pathTime: 2,
  pathTurns: 0.5,
  specialTime: 2,
  neutralSpecialTime: 1,
  slowTime: 1.75,
  slowStack: 1,
  slowInteraction: 0.05,
  blockUsage: 3,
  lightningPadPenalty: 1.5,
  beamCrossings: 2.5
};

// ----------------------------
// Utility helpers
// ----------------------------
function key(x, y) {
  return `${x},${y}`;
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function isInsideGrid(x, y) {
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
}

function centerOf(cell) {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

function padTypeFromCell(value) {
  if (value === CELL_SPEED || value === CELL_SPEED_USED) return "speed";
  if (value === CELL_SLOW || value === CELL_SLOW_USED) return "slow";
  if (value === CELL_DETOUR || value === CELL_DETOUR_USED) return "detour";
  if (value === CELL_STONE || value === CELL_STONE_USED) return "stone";
  if (value === CELL_REWIND || value === CELL_REWIND_USED) return "rewind";
  return null;
}

function isPadCell(value) {
  return Boolean(padTypeFromCell(value));
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
  const hx = x + dx;
  const vy = y + dy;
  if (!isWalkableCell(grid, hx, y)) return false;
  if (!isWalkableCell(grid, x, vy)) return false;
  return true;
}

function heuristic(x, y, gx, gy) {
  return Math.hypot(gx - x, gy - y);
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
      if (!isInsideGrid(nx, ny)) continue;
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
  const path = [current];
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

function computePath(grid) {
  const start = { x: ENTRANCE_X, y: GRID_SIZE - 1 };
  const goal = { x: ENTRANCE_X, y: 0 };
  const raw = findPath(grid, start, goal);
  if (!raw.length) return [];
  return extendWithEntrances(raw);
}

function ensureOpenings(grid) {
  // Keep entrance/exit clear and remove overlapping blocks.
  clearBlockingAt(grid, ENTRANCE_X, 0);
  clearBlockingAt(grid, ENTRANCE_X, GRID_SIZE - 1);
  grid[GRID_SIZE - 1][ENTRANCE_X] =
    grid[GRID_SIZE - 1][ENTRANCE_X] === CELL_STATIC ? CELL_STATIC : CELL_EMPTY;
  grid[0][ENTRANCE_X] = grid[0][ENTRANCE_X] === CELL_STATIC ? CELL_STATIC : CELL_EMPTY;
}

function hasPath(grid) {
  return computePath(grid).length > 0;
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

function computePadScore(grid, path) {
  let score = 0;
  const visited = new Set();
  for (const node of path) {
    if (!isInsideGrid(node.x, node.y)) continue;
    const k = key(node.x, node.y);
    if (visited.has(k)) continue;
    visited.add(k);
    const value = grid[node.y][node.x];
    const padType = padTypeFromCell(value);
    if (padType && PAD_AI_SCORES[padType]) {
      score += PAD_AI_SCORES[padType];
    }
  }
  return score;
}

function analyzePath(grid) {
  const path = computePath(grid);
  if (!path.length) return null;
  const lengths = computeSegmentLengths(path);
  const totalDistance = lengths.reduce((a, b) => a + b, 0);
  const padScore = computePadScore(grid, path);
  return { path, lengths, totalDistance, padScore };
}

function computePathTurnCount(path) {
  if (!path || path.length < 3) return 0;
  let turns = 0;
  let prevDx = Math.sign(path[1].x - path[0].x);
  let prevDy = Math.sign(path[1].y - path[0].y);
  for (let i = 2; i < path.length; i++) {
    const dx = Math.sign(path[i].x - path[i - 1].x);
    const dy = Math.sign(path[i].y - path[i - 1].y);
    if (dx !== prevDx || dy !== prevDy) turns++;
    prevDx = dx;
    prevDy = dy;
  }
  return turns;
}

function evaluateGridForAi(grid, aiWeights) {
  const info = analyzePath(grid);
  if (!info) return -Infinity;
  const pathContribution = (info.totalDistance / NPC_SPEED) * aiWeights.pathTime;
  const turnContribution = computePathTurnCount(info.path) * aiWeights.pathTurns;
  // Lightweight heuristic: path length + turns + padScore.
  return info.totalDistance * AI_PATH_WEIGHT + info.padScore + pathContribution + turnContribution;
}

// ----------------------------
// Placement helpers
// ----------------------------
function canPlaceBlock(grid, gx, gy) {
  if (gx < 0 || gy < 0 || gx + 1 >= GRID_SIZE || gy + 1 >= GRID_SIZE) return false;
  for (let y = gy; y <= gy + 1; y++) {
    for (let x = gx; x <= gx + 1; x++) {
      const v = grid[y][x];
      if (v !== CELL_EMPTY) return false;
      if ((y === 0 || y === GRID_SIZE - 1) && x === ENTRANCE_X) return false;
    }
  }
  return true;
}

function placeBlock(grid, gx, gy, value) {
  grid[gy][gx] = value;
  grid[gy + 1][gx] = value;
  grid[gy][gx + 1] = value;
  grid[gy + 1][gx + 1] = value;
}

function clearBlock(grid, gx, gy) {
  grid[gy][gx] = CELL_EMPTY;
  grid[gy + 1][gx] = CELL_EMPTY;
  grid[gy][gx + 1] = CELL_EMPTY;
  grid[gy + 1][gx + 1] = CELL_EMPTY;
}

function canPlaceSingle(grid, gx, gy) {
  if (!isInsideGrid(gx, gy)) return false;
  const v = grid[gy][gx];
  if (v !== CELL_EMPTY) return false;
  if ((gy === 0 || gy === GRID_SIZE - 1) && gx === ENTRANCE_X) return false;
  return true;
}

function generateRandomCandidates(rng, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push({
      x: Math.floor(rng() * (GRID_SIZE - 1)),
      y: 1 + Math.floor(rng() * (GRID_SIZE - 2))
    });
  }
  return results;
}

function insertCandidate(list, candidate, limit) {
  list.push(candidate);
  list.sort((a, b) => b.score - a.score);
  if (list.length > limit) list.length = limit;
}

function findTopAiWallCandidates(grid, aiWeights, limit = 1) {
  const results = [];
  const basePath = computePath(grid);
  if (!basePath.length) return results;
  const candidateKeys = new Set();
  basePath.forEach((node) => {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        candidateKeys.add(key(node.x + dx, node.y + dy));
      }
    }
  });
  const wallCandidates = Array.from(candidateKeys).map((entry) => {
    const [x, y] = entry.split(",").map(Number);
    return { x, y };
  });
  wallCandidates.forEach((cand) => {
    if (!canPlaceBlock(grid, cand.x, cand.y)) return;
    placeBlock(grid, cand.x, cand.y, CELL_PLAYER);
    ensureOpenings(grid);
    const score = evaluateGridForAi(grid, aiWeights);
    clearBlock(grid, cand.x, cand.y);
    ensureOpenings(grid);
    if (!Number.isFinite(score)) return;
    insertCandidate(results, { type: "wall", x: cand.x, y: cand.y, score }, limit);
  });
  return results;
}

function findTopAiSingleCandidates(grid, aiWeights, limit = 1) {
  const basePath = computePath(grid);
  if (!basePath.length) return [];
  const candidateKeys = new Set();
  basePath.forEach((node) => {
    candidateKeys.add(key(node.x, node.y));
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        candidateKeys.add(key(node.x + dx, node.y + dy));
      }
    }
  });
  const results = [];
  for (const entry of candidateKeys) {
    const [cx, cy] = entry.split(",").map(Number);
    if (!canPlaceSingle(grid, cx, cy)) continue;
    const prev = grid[cy][cx];
    grid[cy][cx] = CELL_SINGLE;
    ensureOpenings(grid);
    const score = evaluateGridForAi(grid, aiWeights);
    grid[cy][cx] = prev;
    ensureOpenings(grid);
    if (!Number.isFinite(score)) continue;
    insertCandidate(results, { type: "single", x: cx, y: cy, score }, limit);
  }
  return results;
}

function findBestAiPlacement(grid, aiWeights, wallsLeft, singlesLeft) {
  const wallPool = wallsLeft > 0 ? findTopAiWallCandidates(grid, aiWeights, 3) : [];
  const singlePool = singlesLeft > 0 ? findTopAiSingleCandidates(grid, aiWeights, 3) : [];
  const candidates = wallPool.concat(singlePool);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function computeSpecialHotspots(grid) {
  const path = computePath(grid);
  const seen = new Set();
  const spots = [];
  path.forEach((node) => {
    if (!isInsideGrid(node.x, node.y)) return;
    const k = key(node.x, node.y);
    if (seen.has(k)) return;
    seen.add(k);
    spots.push({ x: node.x, y: node.y });
  });
  return spots.slice(0, 5);
}

function placeAiSpecial(grid, special) {
  if (special.placed) return;
  const hotspots = computeSpecialHotspots(grid);
  const spot = hotspots[0] || { x: ENTRANCE_X, y: Math.max(1, Math.floor(GRID_SIZE / 2)) };
  if (grid[spot.y][spot.x] === CELL_EMPTY) {
    grid[spot.y][spot.x] = CELL_SPECIAL;
    special.cell = { x: spot.x, y: spot.y };
    special.placed = true;
  }
}

// ----------------------------
// AI build
// ----------------------------
function createSpecialTemplate(type) {
  return {
    type,
    placed: false,
    cell: null,
    effectTimer: 0,
    cooldown: 0,
    flashTimer: 0
  };
}

function buildAiLayout(snapshot) {
  const aiWeights = { ...AI_WEIGHT_DEFAULTS };
  const grid = cloneGrid(snapshot.baseGrid);
  const special = createSpecialTemplate(snapshot.specialTemplate?.type || "radius");
  let wallsLeft = snapshot.coinBudget | 0;
  let singlesLeft = snapshot.singleBudget | 0;
  let currentScore = evaluateGridForAi(grid, aiWeights);
  const placementOrder = [];

  const maxIterations = Math.max(1, wallsLeft + singlesLeft);
  for (let i = 0; i < maxIterations; i++) {
    if (wallsLeft <= 0 && singlesLeft <= 0) break;
    const placement = findBestAiPlacement(grid, aiWeights, wallsLeft, singlesLeft);
    if (!placement) break;
    if (placement.type === "wall" && wallsLeft > 0) {
      placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
      ensureOpenings(grid);
      wallsLeft--;
      placementOrder.push({ type: "wall", row: placement.y + 1, column: placement.x + 1 });
    } else if (placement.type === "single" && singlesLeft > 0) {
      grid[placement.y][placement.x] = CELL_SINGLE;
      ensureOpenings(grid);
      singlesLeft--;
      placementOrder.push({ type: "single", row: placement.y + 1, column: placement.x + 1 });
    } else {
      break;
    }
    currentScore = placement.score;
  }

  placeAiSpecial(grid, special);
  if (special?.cell) {
    placementOrder.push({ type: "special", row: special.cell.y + 1, column: special.cell.x + 1 });
  }

  const profile = {
    totalMs: 0,
    placementMs: 0,
    specialMs: 0,
    reclaimMs: 0,
    lookaheadUsed: 0,
    placements: placementOrder.length
  };

  return { grid, special, placementOrder, profile, lookaheadUsed: 0 };
}

// ----------------------------
// Worker messaging
// ----------------------------
self.onmessage = function (evt) {
  const { jobId, snapshot } = evt.data || {};
  if (!snapshot) {
    self.postMessage({ jobId, ok: false, error: "No snapshot provided" });
    return;
  }
  try {
    const rngSeed = snapshot.rngSeed >>> 0;
    // seed rng for any future expansions; currently deterministic choices rely on path ordering.
    snapshot.rng = mulberry32(rngSeed);
    const layout = buildAiLayout(snapshot);
    self.postMessage({
      jobId,
      ok: true,
      grid: layout.grid,
      special: layout.special,
      placementOrder: layout.placementOrder,
      profile: layout.profile,
      lookaheadUsed: layout.lookaheadUsed
    });
  } catch (err) {
    self.postMessage({ jobId, ok: false, error: err?.message || String(err) });
  }
};
