/* AI core logic shared between main thread and worker.
 * DOM-free helpers and AI builder used by both main.js and ai-worker.js.
 */
(function (global) {
  "use strict";

  // RNG / hashing
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Runner simulation helpers (full fidelity, headless)
  function createRunner(label, grid, special, neutralSpecials = []) {
    const path = computePath(grid);
    return {
      label,
      grid,
      special,
      neutralSpecials: neutralSpecials.map((ns) => (ns ? { ...ns } : null)).filter(Boolean),
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
    const dir = segmentDirectionVector(path, index);
    if (!dir) return null;
    return {
      x: dir.x > 0.1 ? 1 : dir.x < -0.1 ? -1 : 0,
      y: dir.y > 0.1 ? 1 : dir.y < -0.1 ? -1 : 0
    };
  }

  function runnerWorldPosition(runner) {
    if (!runner.path.length) return { x: ENTRANCE_X + 0.5, y: GRID_SIZE - 0.5 };
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
    if (effects.neutralSlowTimer > 0) mult *= SPECIAL_SLOW_MULT;
    if (effects.fastTimer > 0) mult *= PANEL_FAST_MULT;
    runner.effects.speedMultiplier = mult;
  }

  function isPadActiveCell(value) {
    return (
      value === CELL_SPEED ||
      value === CELL_SLOW ||
      value === CELL_DETOUR ||
      value === CELL_STONE ||
      value === CELL_REWIND
    );
  }

  function padUsedVariant(value) {
    if (value === CELL_SPEED) return CELL_SPEED_USED;
    if (value === CELL_SLOW) return CELL_SLOW_USED;
    if (value === CELL_DETOUR) return CELL_DETOUR_USED;
    if (value === CELL_STONE) return CELL_STONE_USED;
    if (value === CELL_REWIND) return CELL_REWIND_USED;
    return value;
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
    const radius = 0.35;
    const minX = Math.max(0, Math.floor(pos.x - radius));
    const maxX = Math.min(GRID_SIZE - 1, Math.floor(pos.x + radius));
    const minY = Math.max(0, Math.floor(pos.y - radius));
    const maxY = Math.min(GRID_SIZE - 1, Math.floor(pos.y + radius));
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const value = runner.grid[gy][gx];
        if (isPadActiveCell(value)) applyPanelEffect(runner, gx, gy, value);
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
        const dot = runner.effects.medusaDir
          ? runner.effects.medusaDir.x * dir.x + runner.effects.medusaDir.y * dir.y
          : 1;
        if (dot < 0.98) {
          runner.effects.medusaActive = false;
          runner.effects.medusaDir = null;
        }
      }
    }
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

  function triggerDetourPad(runner, x, y) {
    const lastStep = runner.effects.lastStep || segmentStep(runner.path, runner.segmentIndex);
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
    runner.effects.neutralSlowTimer = 0;
    runner.effects.areaTimer = 0;
    runner.effects.medusaActive = false;
    runner.effects.medusaDir = null;
  }

  function updateSpecialArea(runner, delta) {
    const special = runner.special;
    if (!special?.placed || !special.cell) {
      runner.effects.areaTimer = 0;
      runner.effects.gravityActive = false;
      runner.effects.gravityPull = null;
      runner.effects.gravityOffset = null;
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
        runner.effects.gravityOffset = null;
      }
      runner.effects.areaTimer = 0;
      return;
    }
    runner.effects.gravityActive = false;
    runner.effects.gravityPull = null;
    runner.effects.gravityOffset = null;
    if (special.type === "radius") {
      if (isPointInsideSpecial(pos, special)) {
        runner.effects.areaTimer = Math.min(FREEZING_BUILDUP, runner.effects.areaTimer + delta);
      } else {
        const decayRate = FREEZING_BUILDUP / SPECIAL_EFFECT_DURATION;
        runner.effects.areaTimer = Math.max(0, runner.effects.areaTimer - decayRate * delta);
      }
      return;
    }
    if (special.type === "lightning") {
      special.cooldown = Math.max(0, (special.cooldown || 0) - delta);
      const centerX = special.cell.x + 0.5;
      const centerY = special.cell.y + 0.5;
      const dist = Math.hypot(centerX - pos.x, centerY - pos.y);
      if (dist <= LIGHTNING_EFFECT_RADIUS + 0.35 && special.cooldown <= 0 && runner.effects.stunTimer <= 0) {
        runner.effects.stunTimer = LIGHTNING_STUN;
        special.cooldown = LIGHTNING_COOLDOWN;
      }
      runner.effects.areaTimer = 0;
      return;
    }
    if (isPointInsideSpecial(pos, special)) {
      special.effectTimer = SPECIAL_EFFECT_DURATION;
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
      if (special.effectTimer > 0) special.effectTimer = Math.max(0, special.effectTimer - delta);
      if (!special.cell) return;
      if (special.type === "lightning") {
        if (special.cooldown <= 0 && isPointInsideSpecial(pos, special) && runner.effects.stunTimer <= 0) {
          runner.effects.stunTimer = LIGHTNING_STUN;
          special.cooldown = LIGHTNING_COOLDOWN;
        }
        return;
      }
      if (special.type === "row" || special.type === "column") {
        if (isPointInsideSpecial(pos, special)) {
          runner.effects.neutralSlowTimer = PANEL_EFFECT_DURATION;
        }
      }
    });
  }

  function isPointInsideSpecial(pos, special) {
    if (!special?.placed || !special.cell) return false;
    const { x, y } = special.cell;
    if (special.type === "radius" || special.type === "gravity" || special.type === "lightning") {
      const dx = pos.x - (x + 0.5);
      const dy = pos.y - (y + 0.5);
      return Math.hypot(dx, dy) <= SPECIAL_RADIUS;
    }
    if (special.type === "row") return pos.y >= y && pos.y <= y + 1;
    if (special.type === "column") return pos.x >= x && pos.x <= x + 1;
    return false;
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

  function computePathFromCell(grid, startCell) {
    if (!startCell) return [];
    const goal = { x: ENTRANCE_X, y: 0 };
    const path = findPath(grid, { x: startCell.x, y: startCell.y }, goal);
    if (!path.length) return [];
    path.push({ x: ENTRANCE_X, y: -1 });
    return path;
  }

  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  // Constants
  const GRID_SIZE = 21;
  const ENTRANCE_X = Math.floor(GRID_SIZE / 2);
  const NPC_SPEED = 3;
  const NPC_RADIUS = 0.35;
  const FIXED_TIMESTEP = 1 / 120;
  const PANEL_EFFECT_DURATION = 5;
  const PANEL_SLOW_MULT = 0.55;
  const PANEL_FAST_MULT = 1.5;
  const MEDUSA_SLOW_MULT = 0.3;
  const SPECIAL_RADIUS = 4;
  const SPECIAL_LINGER = 3;
  const SPECIAL_SLOW_MULT = 0.7;
  const FREEZING_BUILDUP = 10;
  const FREEZING_MIN_MULT = 0.3;
  const LIGHTNING_STUN = 1.5;
  const LIGHTNING_COOLDOWN = 3.25;
  const LIGHTNING_EFFECT_RADIUS = 4;
  const GRAVITY_MIN_MULT = 0.4;
  const GRAVITY_MAX_MULT = 0.7;
  const AI_PATH_WEIGHT = 12;
  const PAD_SLOW_EXTRA_TIME = PANEL_EFFECT_DURATION * (1 / PANEL_SLOW_MULT - 1);
  const PAD_SPEED_TIME_DELTA = PANEL_EFFECT_DURATION * (1 - 1 / PANEL_FAST_MULT);
  const PAD_STONE_EXTRA_TIME = 2 * (1 / MEDUSA_SLOW_MULT - 1);
  const PREDICT_SLOW_SCALE = 0.82;
  const SPECIAL_PAD_SYNERGY_TIME = PANEL_EFFECT_DURATION * (1 / PANEL_SLOW_MULT - 1);
  const SPECIAL_PAD_SYNERGY_STRONG_TIME = SPECIAL_PAD_SYNERGY_TIME * 1.25;
  const SPECIAL_NEUTRAL_OVERLAP_TIME = SPECIAL_LINGER * (1 / SPECIAL_SLOW_MULT - 1) * 0.75;
  const SPECIAL_EFFECT_DURATION = SPECIAL_LINGER;
  const BEAM_LINGER_CAP = 1.5;
  const MIN_BLOCK_RECLAIM_DELTA = 0.4;
  const RECLAIM_RUNTIME_THRESHOLD = 0.4;
  const RECLAIM_MAX_PASSES = 1;
  const COMBO_POOL_LIMIT = 3;
  const COMBO_LOOKAHEAD_DEPTH = 2;
  const SPECIAL_HOTSPOT_LIMIT = 5;
  const SPECIAL_HOTSPOT_TOLERANCE = 35;
  const SPECIAL_PATH_GAIN_THRESHOLD = 10;
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

  // Utility helpers
  const CARDINAL_NEIGHBORS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  function key(x, y) {
    return `${x},${y}`;
  }

  function keyFor(x, y) {
    return `${x},${y}`;
  }

  function cloneGrid(grid) {
    return grid.map((row) => row.slice());
  }

  function randomInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
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
        open.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + heuristic(nx, ny, goal.x, goal.y) });
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
      if (padType && PAD_AI_SCORES[padType]) score += PAD_AI_SCORES[padType];
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

  function evaluateGridForAi(
    grid,
    special = null,
    neutralSpecials = [],
    pathInfoOverride = null,
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGridForUsage = null
  ) {
    const info = pathInfoOverride || analyzePath(grid);
    if (!info) return -Infinity;
    const predicted = estimatePredictedRunTime(grid, info, special, neutralSpecials);
    const components = predicted.components || {
      slowTime: 0,
      slowStackTime: 0,
      specialOwnedTime: 0,
      specialNeutralTime: 0
    };
    const pathContribution = (info.totalDistance / NPC_SPEED) * aiWeights.pathTime;
    const turnContribution = computePathTurnCount(info.path) * aiWeights.pathTurns;
    const slowContribution = (components.slowTime || 0) * aiWeights.slowTime;
    const slowStackContribution = (components.slowStackTime || 0) * aiWeights.slowStack;
    const specialContribution = (components.specialOwnedTime || 0) * aiWeights.specialTime;
    const neutralSpecialContribution = (components.specialNeutralTime || 0) * aiWeights.neutralSpecialTime;
    const lightningPenalty = (predicted.lightningPenalty || 0) * aiWeights.lightningPadPenalty;
    const beamCross = computeBeamCrossings(info.path, special) * aiWeights.beamCrossings;
    const blockUsage = computeBlockUsageScore(grid, info.path, baseGridForUsage) * aiWeights.blockUsage;
    const detourDistance = computeDetourDistance(grid, info) * aiWeights.slowInteraction;

    return (
      info.totalDistance * AI_PATH_WEIGHT +
      info.padScore +
      pathContribution +
      turnContribution +
      slowContribution +
      slowStackContribution +
      specialContribution +
      neutralSpecialContribution +
      lightningPenalty +
      beamCross +
      blockUsage +
      detourDistance
    );
  }

  // Placement helpers
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

  function clearBlockingAt(grid, x, y) {
    const val = grid[y]?.[x];
    if (val === CELL_PLAYER) {
      const anchorX = grid[y][x - 1] === CELL_PLAYER ? x - 1 : x;
      const anchorY = grid[y - 1]?.[x] === CELL_PLAYER ? y - 1 : y;
      clearBlock(grid, anchorX, anchorY);
    } else if (val === CELL_SINGLE) {
      grid[y][x] = CELL_EMPTY;
    }
  }

  function restoreBlock(grid, entry) {
    const x = entry.column != null ? entry.column - 1 : entry.x;
    const y = entry.row != null ? entry.row - 1 : entry.y;
    if (entry.type === "wall") {
      placeBlock(grid, x, y, CELL_PLAYER);
    } else if (entry.type === "single") {
      grid[y][x] = CELL_SINGLE;
    } else if (entry.type === "special" && entry.specialCell) {
      grid[entry.specialCell.y][entry.specialCell.x] = CELL_SPECIAL;
    }
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

  function canPlaceSingle(grid, gx, gy) {
    if (!isInsideGrid(gx, gy)) return false;
    const v = grid[gy][gx];
    if (v !== CELL_EMPTY) return false;
    if ((gy === 0 || gy === GRID_SIZE - 1) && gx === ENTRANCE_X) return false;
    return true;
  }

  function isCellAvailableForSpecial(grid, gx, gy) {
    if (!isInsideGrid(gx, gy)) return false;
    if ((gy === 0 || gy === GRID_SIZE - 1) && gx === ENTRANCE_X) return false;
    const value = grid[gy][gx];
    if (
      value === CELL_STATIC ||
      value === CELL_STATIC_SPECIAL ||
      value === CELL_PLAYER ||
      value === CELL_SPECIAL ||
      value === CELL_SINGLE
    ) {
      return false;
    }
    return !isPadCell(value);
  }

  function applyPlacementCandidate(grid, candidate) {
    if (!candidate) return;
    if (candidate.type === "wall") {
      placeBlock(grid, candidate.x, candidate.y, CELL_PLAYER);
    } else if (candidate.type === "single") {
      candidate.previous = grid[candidate.y][candidate.x];
      grid[candidate.y][candidate.x] = CELL_SINGLE;
    }
    ensureOpenings(grid);
  }

  function revertPlacementCandidate(grid, candidate) {
    if (!candidate) return;
    if (candidate.type === "wall") {
      clearBlock(grid, candidate.x, candidate.y);
    } else if (candidate.type === "single") {
      const prev = candidate.previous != null ? candidate.previous : CELL_EMPTY;
      grid[candidate.y][candidate.x] = prev;
      candidate.previous = null;
    }
    ensureOpenings(grid);
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

  // Speed pad handling
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
      const k = keyFor(node.x, node.y);
      if (checked.has(k)) return;
      checked.add(k);
      const value = grid[node.y]?.[node.x];
      if (padTypeFromCell(value) === "speed" && padIsMandatory(grid, node.x, node.y)) {
        count++;
      }
    });
    return count;
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

  function getDiversionCandidates(grid, px, py) {
    const cells = [];
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (!isInsideGrid(x, y)) continue;
        if (Math.abs(dx) + Math.abs(dy) === 0) continue;
        if (grid[y][x] === CELL_EMPTY) cells.push({ x, y });
      }
    }
    return cells;
  }

  function tryDivertSpeedPad(
    grid,
    special,
    neutralSpecials,
    currentScore,
    pad,
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null
  ) {
    const forcedCells = getDiversionCandidates(grid, pad.x, pad.y);
    if (!forcedCells.length) return { changed: false, score: currentScore };
    const singles = findTopAiSingleCandidates(grid, special, neutralSpecials, forcedCells, 3, aiWeights, baseGrid);
    if (!singles.length) return { changed: false, score: currentScore };
    const best = singles[0];
    if (best.score > currentScore) {
      grid[best.y][best.x] = CELL_SINGLE;
      ensureOpenings(grid);
      return { changed: true, score: best.score };
    }
    return { changed: false, score: currentScore };
  }

  function reduceMandatorySpeedPads(
    grid,
    special,
    neutralSpecials,
    currentScore,
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null
  ) {
    let score = currentScore;
    const mandatoryPads = collectMandatorySpeedPads(grid);
    mandatoryPads.forEach((pad) => {
      const result = tryDivertSpeedPad(grid, special, neutralSpecials, score, pad, aiWeights, baseGrid);
      if (result.changed) score = result.score;
    });
    return score;
  }

  // Candidate search
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

  function findTopAiWallCandidates(
    grid,
    special,
    neutralSpecials,
    limit = COMBO_POOL_LIMIT,
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null,
    rng = null
  ) {
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
    const targeted = Array.from(candidateKeys).map((entry) => {
      const [x, y] = entry.split(",").map(Number);
      return { x, y };
    });
    const wallCandidates = targeted.length
      ? targeted
      : generateRandomCandidates(rng || mulberry32(hashSeed("wall")), 80);
    wallCandidates.forEach((cand) => {
      if (!canPlaceBlock(grid, cand.x, cand.y)) return;
      placeBlock(grid, cand.x, cand.y, CELL_PLAYER);
      ensureOpenings(grid);
      const score = evaluateGridForAi(grid, special, neutralSpecials, null, aiWeights, baseGrid);
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
    limit = COMBO_POOL_LIMIT,
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null
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
    if (forcedCells?.length) {
      forcedCells.forEach((cell) => {
        if (cell && isInsideGrid(cell.x, cell.y)) singleCandidates.add(key(cell.x, cell.y));
      });
    }
    const results = [];
    for (const entry of singleCandidates) {
      const [cx, cy] = entry.split(",").map(Number);
      if (!canPlaceSingle(grid, cx, cy)) continue;
      const previous = grid[cy][cx];
      grid[cy][cx] = CELL_SINGLE;
      ensureOpenings(grid);
      const score = evaluateGridForAi(grid, special, neutralSpecials, null, aiWeights, baseGrid);
      grid[cy][cx] = previous;
      ensureOpenings(grid);
      if (!Number.isFinite(score)) continue;
      insertCandidate(results, { type: "single", x: cx, y: cy, score }, limit);
    }
    return results;
  }

  function generateRandomSingleCandidates(count, rng = mulberry32(1)) {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        x: Math.floor(rng() * (GRID_SIZE - 1)),
        y: 1 + Math.floor(rng() * (GRID_SIZE - 2))
      });
    }
    return out;
  }

  function evaluatePlacementSequences(
    grid,
    special,
    neutralSpecials,
    wallPool,
    singlePool,
    budgetInfo,
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null
  ) {
    if (!budgetInfo) return null;
    const wallsLeft = budgetInfo.wallsLeft || 0;
    const singlesLeft = budgetInfo.singlesLeft || 0;
    const specialHotspots = budgetInfo.specialHotspots || [];
    const pools = {
      walls: wallPool.slice(0, COMBO_POOL_LIMIT),
      singles: singlePool.slice(0, COMBO_POOL_LIMIT),
      specials: !special?.placed ? specialHotspots.slice(0, COMBO_POOL_LIMIT) : []
    };
    if (!pools.walls.length && !pools.singles.length && !pools.specials.length) return null;

    let best = null;
    const maxDepth = Math.max(
      1,
      Math.min(COMBO_LOOKAHEAD_DEPTH, wallsLeft + singlesLeft + (special?.placed ? 0 : 1))
    );

    function dfs(currentGrid, currentSpecial, wLeft, sLeft, depth, firstMoveUsed, usedSpecial) {
      const score = evaluateGridForAi(currentGrid, currentSpecial, neutralSpecials, null, aiWeights, baseGrid);
      if (depth === 0 || (!wLeft && !sLeft && (usedSpecial || currentSpecial?.placed))) {
        if (!best || score > best.score) {
          best = { score, candidate: firstMoveUsed };
        }
        return;
      }
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
      if (!usedSpecial && pools.specials.length && currentSpecial && !currentSpecial.placed) {
        pools.specials.forEach((spot) => {
          const sx = spot.x;
          const sy = spot.y;
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

  function findFallbackAiCandidates(
    grid,
    special,
    neutralSpecials,
    allowWalls,
    allowSingles,
    rng = mulberry32(1),
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null
  ) {
    const pool = [];
    const tries = 140;
    if (allowWalls) {
      for (let i = 0; i < tries; i++) {
        const x = Math.floor(rng() * (GRID_SIZE - 2));
        const y = 1 + Math.floor(rng() * (GRID_SIZE - 3));
        if (!canPlaceBlock(grid, x, y)) continue;
        placeBlock(grid, x, y, CELL_PLAYER);
        ensureOpenings(grid);
        const score = evaluateGridForAi(grid, special, neutralSpecials, null, aiWeights, baseGrid);
        clearBlock(grid, x, y);
        ensureOpenings(grid);
        if (!Number.isFinite(score)) continue;
        insertCandidate(pool, { type: "wall", x, y, score }, 3);
      }
    }
    if (allowSingles) {
      for (let i = 0; i < tries; i++) {
        const x = Math.floor(rng() * (GRID_SIZE - 1));
        const y = 1 + Math.floor(rng() * (GRID_SIZE - 2));
        if (!canPlaceSingle(grid, x, y)) continue;
        const prev = grid[y][x];
        grid[y][x] = CELL_SINGLE;
        ensureOpenings(grid);
        const score = evaluateGridForAi(grid, special, neutralSpecials, null, aiWeights, baseGrid);
        grid[y][x] = prev;
        ensureOpenings(grid);
        if (!Number.isFinite(score)) continue;
        insertCandidate(pool, { type: "single", x, y, score }, 3);
      }
    }
    return pool;
  }

  function findBestAiPlacement(
    grid,
    currentScore,
    special,
    neutralSpecials,
    pathInfoOverride = null,
    budgetInfo = null,
    allowWalls = true,
    allowSingles = true,
    forcedSingleCells = null,
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null,
    fallbackRng = null
  ) {
    const candidateLimit = COMBO_POOL_LIMIT;
    const wallPool = allowWalls
      ? findTopAiWallCandidates(grid, special, neutralSpecials, candidateLimit, aiWeights, baseGrid, fallbackRng)
      : [];
    const steerCells = collectSpeedPadSteerCells(grid);
    const forced = forcedSingleCells && forcedSingleCells.length ? forcedSingleCells.concat(steerCells) : steerCells;
    const singlePool = allowSingles
      ? findTopAiSingleCandidates(grid, special, neutralSpecials, forced, candidateLimit, aiWeights, baseGrid)
      : [];
    let candidates = wallPool.concat(singlePool);
    if (!candidates.length) {
      const fallbackRandom = fallbackRng || mulberry32(hashSeed("fallback"));
      candidates = findFallbackAiCandidates(
        grid,
        special,
        neutralSpecials,
        allowWalls,
        allowSingles,
        fallbackRandom,
        aiWeights,
        baseGrid
      );
      if (!candidates.length) return null;
    }
    candidates.sort((a, b) => b.score - a.score);
    const effectiveBudget = budgetInfo || {
      wallsLeft: allowWalls ? 1 : 0,
      singlesLeft: allowSingles ? 1 : 0,
      specialHotspots: []
    };
    const seq = evaluatePlacementSequences(
      grid,
      special,
      neutralSpecials,
      wallPool,
      singlePool,
      effectiveBudget,
      aiWeights,
      baseGrid
    );
    if (seq?.candidate) return seq.candidate;
    return candidates[0] || null;
  }

  // Special handling
  function computeSpecialHotspots(grid, special, neutralSpecials, limit = SPECIAL_HOTSPOT_LIMIT, rng = Math.random) {
    const basePath = computePath(grid);
    if (!basePath.length) return [];
    const baselineInfo = analyzePath(grid);
    const baselineMandatory = countMandatorySpeedPads(grid, baselineInfo?.path);
    const candidates = new Set();
    basePath.forEach((node) => {
      if (isInsideGrid(node.x, node.y)) {
        candidates.add(key(node.x, node.y));
      }
      MOVES.forEach((move) => {
        const nx = node.x + move.dx;
        const ny = node.y + move.dy;
        if (isInsideGrid(nx, ny)) {
          candidates.add(key(nx, ny));
        }
      });
    });
    for (let i = 0; i < 120; i++) {
      const gx = randomInt(rng, 0, GRID_SIZE - 1);
      const gy = randomInt(rng, 1, GRID_SIZE - 2);
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
    const candidateSpecial = { ...special, cell: { x, y }, placed: true };
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
      typeof baselineMandatorySpeedCount === "number" && mandatorySpeedCount < baselineMandatorySpeedCount;
    grid[y][x] = original;
    ensureOpenings(grid);
    if (!Number.isFinite(score)) return null;
    return { x, y, score, pathGain, avoidsSpeedPad };
  }

  function placeAiSpecial(grid, special, neutralSpecials, preferredCells = [], rng = Math.random) {
    if (special.placed) return;
    const basePath = computePath(grid);
    if (!basePath.length) return;
    const baselineInfo = analyzePath(grid);
    if (!baselineInfo) return;
    const baselineMandatory = countMandatorySpeedPads(grid, baselineInfo.path);
    const candidates = new Set();
    basePath.forEach((node) => {
      if (isInsideGrid(node.x, node.y)) candidates.add(key(node.x, node.y));
      MOVES.forEach((move) => {
        const nx = node.x + move.dx;
        const ny = node.y + move.dy;
        if (isInsideGrid(nx, ny)) {
          candidates.add(key(nx, ny));
        }
      });
    });
    for (let i = 0; i < 120; i++) {
      const gx = randomInt(rng, 0, GRID_SIZE - 1);
      const gy = randomInt(rng, 1, GRID_SIZE - 2);
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
        bestGeneral && (bestGeneral.pathGain >= SPECIAL_PATH_GAIN_THRESHOLD || bestGeneral.avoidsSpeedPad);
      best = generalException ? bestGeneral : bestPreferred;
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

  // AI build (simplified)
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

  function buildAiLayoutFromSnapshot(snapshot) {
    const aiWeights = { ...AI_WEIGHT_DEFAULTS, ...(snapshot.aiWeights || {}) };
    const rng = snapshot.rng || mulberry32(snapshot.rngSeed >>> 0);
    const baseState = {
      grid: cloneGrid(snapshot.baseGrid),
      special: createSpecialTemplate(snapshot.specialTemplate?.type || "radius"),
      neutralSpecials: snapshot.baseNeutralSpecials || [],
      wallsLeft: snapshot.coinBudget | 0,
      singlesLeft: snapshot.singleBudget | 0,
      initialPlacements: (snapshot.coinBudget | 0) + (snapshot.singleBudget | 0),
      placementsMade: 0,
      aiWeights,
      baseGrid: snapshot.baseGrid,
      rng,
      placementOrder: [],
      specialsOverride: snapshot.specialHotspotsOverride || null,
      branchPlacementIndex: null,
      branchCounter: { value: 0 }
    };
    const layouts = branchBuild(baseState);
    const best = layouts
      .filter(Boolean)
      .sort((a, b) => (b.simulatedTime ?? -Infinity) - (a.simulatedTime ?? -Infinity))[0];
    return best || finalizeLayout(baseState);
  }

  function computeBranchPlacementIndex(state) {
    if (!state) return null;
    const placementsMade = state.placementsMade || 0;
    if (placementsMade > 0 && placementsMade <= 3) {
      return placementsMade;
    }
    const totalPlacements = state.initialPlacements || 0;
    const placementsRemaining = Math.max(0, totalPlacements - placementsMade);
    if (placementsRemaining >= 1 && placementsRemaining <= 3) {
      return -placementsRemaining;
    }
    return null;
  }

  function branchBuild(state) {
    if (!state) return [];
    if (state.wallsLeft <= 0 && state.singlesLeft <= 0) {
      return [finalizeLayout(state)];
    }
    const pathInfo = analyzePath(state.grid);
    if (!pathInfo) {
      return [finalizeLayout(state)];
    }
    const chosen = chooseBlockPlacement(state, pathInfo);
    if (!chosen) {
      return [finalizeLayout(state)];
    }
    const nextState = cloneState(state);
    applyBlockPlacement(nextState, chosen);
    const specialHotspots =
      !nextState.special?.placed && nextState.specialsOverride
        ? nextState.specialsOverride
        : !nextState.special?.placed
        ? computeSpecialHotspots(nextState.grid, nextState.special, nextState.neutralSpecials, SPECIAL_HOTSPOT_LIMIT, nextState.rng)
        : [];
    const hotspotSnapshot = specialHotspots.map((spot) => ({
      x: spot.x,
      y: spot.y,
      score: spot.score
    }));
    const lastEntry = nextState.placementOrder[nextState.placementOrder.length - 1];
    if (lastEntry) {
      lastEntry.specialHotspots = hotspotSnapshot;
    }
    const branchPlacementIndex = computeBranchPlacementIndex(nextState);
    const results = [];
    const placementsRemaining = (nextState.initialPlacements || 0) - (nextState.placementsMade || 0);
    const shouldBranch =
      (!nextState.special?.placed &&
        specialHotspots.length &&
        ((nextState.placementsMade || 0) <= 3 || placementsRemaining <= 3));
    if (shouldBranch) {
      const specialState = cloneState(nextState);
      if (branchPlacementIndex != null) {
        specialState.branchPlacementIndex = branchPlacementIndex;
      }
      applySpecialBranch(specialState, specialHotspots[0], hotspotSnapshot);
      results.push(...branchBuild(specialState));
    }
    results.push(...branchBuild(nextState));
    return results;
  }

  function chooseBlockPlacement(state, pathInfo) {
    const placement = findBestAiPlacement(
      state.grid,
      evaluateGridForAi(state.grid, state.special, state.neutralSpecials),
      state.special,
      state.neutralSpecials,
      pathInfo,
      { wallsLeft: state.wallsLeft, singlesLeft: state.singlesLeft, specialHotspots: [] },
      state.wallsLeft > 0,
      state.singlesLeft > 0,
      null,
      state.aiWeights,
      state.baseGrid,
      state.rng
    );
    if (placement) return placement;
    return fallbackPlacement(state);
  }

  function fallbackPlacement(state) {
    const tries = 200;
    for (let t = 0; t < tries; t++) {
      const wallTry = state.wallsLeft > 0;
      const singleTry = state.singlesLeft > 0;
      if (!wallTry && !singleTry) break;
      const isWall = wallTry && (!singleTry || state.rng() > 0.5);
      if (isWall) {
        const x = Math.floor(state.rng() * (GRID_SIZE - 1));
        const y = 1 + Math.floor(state.rng() * (GRID_SIZE - 2));
        if (!canPlaceBlock(state.grid, x, y)) continue;
        placeBlock(state.grid, x, y, CELL_PLAYER);
        ensureOpenings(state.grid);
        if (hasPath(state.grid)) {
          const score = evaluateGridForAi(state.grid, state.special, state.neutralSpecials, null, state.aiWeights, state.baseGrid);
          clearBlock(state.grid, x, y);
          ensureOpenings(state.grid);
          return { type: "wall", x, y, score };
        }
        clearBlock(state.grid, x, y);
        ensureOpenings(state.grid);
      } else {
        const x = Math.floor(state.rng() * GRID_SIZE);
        const y = 1 + Math.floor(state.rng() * (GRID_SIZE - 2));
        if (!canPlaceSingle(state.grid, x, y)) continue;
        const prev = state.grid[y][x];
        state.grid[y][x] = CELL_SINGLE;
        ensureOpenings(state.grid);
        if (hasPath(state.grid)) {
          const score = evaluateGridForAi(state.grid, state.special, state.neutralSpecials, null, state.aiWeights, state.baseGrid);
          state.grid[y][x] = prev;
          ensureOpenings(state.grid);
          return { type: "single", x, y, score };
        }
        state.grid[y][x] = prev;
        ensureOpenings(state.grid);
      }
    }
    return null;
  }

  function applyBlockPlacement(state, chosen) {
    const { x, y } = chosen;
    if (chosen.type === "wall") {
      placeBlock(state.grid, x, y, CELL_PLAYER);
      state.wallsLeft = Math.max(0, state.wallsLeft - 1);
    } else if (chosen.type === "single") {
      state.grid[y][x] = CELL_SINGLE;
      state.singlesLeft = Math.max(0, state.singlesLeft - 1);
    }
    ensureOpenings(state.grid);
    state.placementOrder.push({
      type: chosen.type,
      row: y + 1,
      column: x + 1,
      specialHotspots: []
    });
    state.placementsMade = (state.placementsMade || 0) + 1;
  }

  function applySpecialBranch(state, hotspot, hotspotSnapshot) {
    const { x, y } = hotspot;
    state.grid[y][x] = CELL_SPECIAL;
    ensureOpenings(state.grid);
    state.special.cell = { x, y };
    state.special.placed = true;
    state.special.effectTimer = 0;
    state.special.cooldown = 0;
    state.special.flashTimer = 0;
    state.placementOrder.push({
      type: "special",
      row: y + 1,
      column: x + 1,
      specialHotspots: hotspotSnapshot
    });
    return state;
  }

  let branchCounter = 0;

  function finalizeLayout(state) {
    if (!state) return null;
    ensureOpenings(state.grid);
    reduceMandatorySpeedPads(state.grid, state.special, state.neutralSpecials, 0, state.aiWeights, state.baseGrid);
    const reclaimStats = reclaimAndReallocateBlocks(state.grid, state.special, state.neutralSpecials, state.placementOrder, state.aiWeights, state.baseGrid, state.rng);
    state.placementOrder.reallocations = reclaimStats.reallocated || 0;
    state.placementOrder.reallocationPasses = reclaimStats.passes || 0;
    annotatePlacementImpacts(state.grid, state.special, state.neutralSpecials, state.placementOrder);
    const counter = state.branchCounter || { value: 0 };
    const branchId = ++counter.value;
    state.branchCounter = counter;
    const branchPlacementIndex = state.branchPlacementIndex ?? null;
    const profile = {
      totalMs: 0,
      placementMs: 0,
      specialMs: 0,
      reclaimMs: 0,
      lookaheadUsed: 0,
      branch: branchPlacementIndex ?? null,
      placements: state.placementOrder.length,
      source: "ai-core"
    };
    const simulatedTime = simulateRunnerTime(state.grid, state.special, state.neutralSpecials);
    const lookaheadUsed = profile.lookaheadUsed || 0;
    return {
      grid: state.grid,
      special: state.special,
      placementOrder: state.placementOrder,
      profile,
      simulatedTime,
      branchId,
      branch: branchPlacementIndex ?? null,
      branchPlacementIndex,
      branchTotal: counter.value,
      lookaheadUsed
    };
  }

  function cloneState(state) {
    if (!state) return null;
    return {
      grid: cloneGrid(state.grid),
      special: cloneSpecial(state.special),
      neutralSpecials: cloneNeutralSpecials(state.neutralSpecials),
      wallsLeft: state.wallsLeft,
      singlesLeft: state.singlesLeft,
      aiWeights: state.aiWeights,
      baseGrid: state.baseGrid,
      rng: state.rng,
      placementOrder: state.placementOrder.map((entry) => ({ ...entry })),
      specialsOverride: state.specialsOverride,
      branchPlacementIndex: state.branchPlacementIndex,
      branchCounter: state.branchCounter
      ,
      initialPlacements: state.initialPlacements,
      placementsMade: state.placementsMade
    };
  }

  // Timing / prediction
  function iteratePathSegments(pathInfo, callback) {
    const path = pathInfo?.path;
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
        if (forced > 0) total += forced / NPC_SPEED;
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
        if (grid[y][x] === CELL_SLOW) slowPads.push({ x, y });
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
      const reward = 1 / (1 + minDist);
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
        if (val === CELL_PLAYER || val === CELL_SINGLE) placed++;
      }
    }
    const seen = new Set();
    path.forEach((node) => {
      if (!isInsideGrid(node.x, node.y)) return;
      const k = keyFor(node.x, node.y);
      if (seen.has(k)) return;
      seen.add(k);
      const val = grid[node.y]?.[node.x];
      if (val === CELL_PLAYER || val === CELL_SINGLE) onPath++;
    });
    if (!placed) return 0;
    return onPath / placed;
  }

  function computeBlockUsageScore(grid, path, baseGrid) {
    if (!path?.length || !baseGrid) return 0;
    let totalStatic = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (baseGrid[y]?.[x] === CELL_STATIC) totalStatic++;
      }
    }
    if (!totalStatic) return 0;
    let used = 0;
    const seen = new Set();
    path.forEach((node) => {
      if (!isInsideGrid(node.x, node.y)) return;
      const k = keyFor(node.x, node.y);
      if (seen.has(k)) return;
      seen.add(k);
      if (baseGrid[node.y]?.[node.x] === CELL_STATIC) used++;
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
      const dist = Math.hypot(special.cell.x + 0.5 - center.x, special.cell.y + 0.5 - center.y);
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
      const posInside = special.type === "row" ? node.y === special.cell.y : node.x === special.cell.x;
      if (posInside && !inside) crossings++;
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
      const dist = Math.hypot(special.cell.x + 0.5 - center.x, special.cell.y + 0.5 - center.y);
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
    const overlap = special?.placed ? estimateSpecialOverlapTime(pathInfo.path, special, neutralSpecials) : 0;
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
        const auraMult = SPECIAL_SLOW_MULT - (SPECIAL_SLOW_MULT - FREEZING_MIN_MULT) * ratio;
        total += baseTime * (1 / auraMult - 1);
      }
    });
    return total;
  }

  function estimateBeamSlowTime(pathInfo, special, orientation) {
    let linger = 0;
    let total = 0;
    iteratePathSegments(pathInfo, (cell, baseTime) => {
      const inside = orientation === "row" ? cell.y === special.cell.y : cell.x === special.cell.x;
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
        const target = GRAVITY_MIN_MULT + (GRAVITY_MAX_MULT - GRAVITY_MIN_MULT) * ratio;
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
      const dist = Math.hypot(special.cell.x + 0.5 - center.x, special.cell.y + 0.5 - center.y);
      const inside = dist <= LIGHTNING_EFFECT_RADIUS + NPC_RADIUS;
      if (inside && cooldown <= 0) {
        total += LIGHTNING_STUN;
        cooldown = LIGHTNING_COOLDOWN;
      }
      cooldown = Math.max(0, cooldown - baseTime);
    });
    return total;
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

  function simulateRunnerTime(grid, special, neutralSpecials = []) {
    if (!grid) return null;
    const simGrid = cloneGrid(grid);
    ensureOpenings(simGrid);
    const runner = createRunner(
      "AI",
      simGrid,
      special ? cloneSpecial(special) : null,
      cloneNeutralSpecials(neutralSpecials)
    );
    if (!runner.path.length) return null;
    const dt = FIXED_TIMESTEP;
    const maxTime = 600;
    const maxSteps = Math.ceil(maxTime / dt) + 100;
    let steps = 0;
    while (!runner.finished && steps < maxSteps) {
      advanceRunnerSimulation(runner, dt);
      steps++;
    }
    if (!runner.finished) return null;
    return runner.resultTime ?? runner.elapsedTime ?? steps * dt;
  }

  // Reclaim/annotate helpers (simplified)
  function reclaimAndReallocateBlocks(grid, special, neutralSpecials, placementOrder = []) {
    if (!grid || !placementOrder || !placementOrder.length) return { reallocated: 0, passes: 0 };
    let reallocated = 0;
    let passes = 0;
    for (let pass = 0; pass < 1; pass++) {
      passes++;
      const baseline = evaluateGridForAi(grid, special, neutralSpecials, null, aiWeights, baseGrid);
      if (baseline == null) break;
      const remaining = [];
      let reclaimedAny = false;
      for (const entry of placementOrder) {
        const x = entry.column != null ? entry.column - 1 : entry.x;
        const y = entry.row != null ? entry.row - 1 : entry.y;
        if (entry.type === "wall") {
          const prev = {
            tl: grid[y][x],
            tr: grid[y][x + 1],
            bl: grid[y + 1][x],
            br: grid[y + 1][x + 1]
          };
          clearBlock(grid, x, y);
          ensureOpenings(grid);
          if (!hasPath(grid)) {
            grid[y][x] = prev.tl;
            grid[y][x + 1] = prev.tr;
            grid[y + 1][x] = prev.bl;
            grid[y + 1][x + 1] = prev.br;
            ensureOpenings(grid);
            remaining.push(entry);
            continue;
          }
          const score = simulateRunnerTime(grid, special, neutralSpecials);
          if (score <= baseline) {
            placeBlock(grid, x, y, CELL_PLAYER);
            ensureOpenings(grid);
            remaining.push(entry);
          } else {
            reclaimedAny = true;
            reallocated++;
          }
        } else if (entry.type === "single") {
          const prev = grid[y][x];
          grid[y][x] = CELL_EMPTY;
          ensureOpenings(grid);
          if (!hasPath(grid)) {
            grid[y][x] = prev;
            ensureOpenings(grid);
            remaining.push(entry);
            continue;
          }
          const score = simulateRunnerTime(grid, special, neutralSpecials);
          if (score <= baseline) {
            grid[y][x] = prev;
            ensureOpenings(grid);
            remaining.push(entry);
          } else {
            reclaimedAny = true;
            reallocated++;
          }
        } else if (entry.type === "special" && special?.cell) {
          const sx = special.cell.x;
          const sy = special.cell.y;
          grid[sy][sx] = CELL_EMPTY;
          ensureOpenings(grid);
          if (!hasPath(grid)) {
            grid[sy][sx] = CELL_SPECIAL;
            remaining.push(entry);
            continue;
          }
          const score = simulateRunnerTime(grid, special, neutralSpecials);
          if (score <= baseline) {
            grid[sy][sx] = CELL_SPECIAL;
            remaining.push(entry);
            ensureOpenings(grid);
          } else {
            special.placed = false;
            special.cell = null;
            reclaimedAny = true;
          }
        }
      }
      placementOrder.length = 0;
      placementOrder.push(...remaining);
      if (!reclaimedAny) break;
    }
    return { reallocated, passes };
  }

  function annotatePlacementImpacts(grid, special, neutralSpecials, placementOrder = []) {
    if (!grid || !placementOrder?.length) return placementOrder;
    const baseline = simulateRunnerTime(grid, special, neutralSpecials);
    if (baseline == null) return placementOrder;
    placementOrder.forEach((entry) => {
      const x = entry.column != null ? entry.column - 1 : entry.x;
      const y = entry.row != null ? entry.row - 1 : entry.y;
      let sim = baseline;
      if (entry.type === "wall") {
        const testGrid = cloneGrid(grid);
        clearBlock(testGrid, x, y);
        ensureOpenings(testGrid);
        if (hasPath(testGrid)) sim = simulateRunnerTime(testGrid, special, neutralSpecials);
      } else if (entry.type === "single") {
        const testGrid = cloneGrid(grid);
        testGrid[y][x] = CELL_EMPTY;
        ensureOpenings(testGrid);
        if (hasPath(testGrid)) sim = simulateRunnerTime(testGrid, special, neutralSpecials);
      } else if (entry.type === "special" && special?.cell) {
        const testGrid = cloneGrid(grid);
        testGrid[special.cell.y][special.cell.x] = CELL_EMPTY;
        ensureOpenings(testGrid);
        if (hasPath(testGrid)) sim = simulateRunnerTime(testGrid, special, neutralSpecials);
      }
      entry.impactDelta = baseline - (sim || baseline);
    });
    return placementOrder;
  }

  // Reclaim/annotate helpers (full logic, overrides simplified versions)
  function reclaimAndReallocateBlocks(
    grid,
    special,
    neutralSpecials,
    placementOrder = [],
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null,
    rng = null
  ) {
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

      let currentSim = simulateRunnerTime(grid, special, neutralSpecials);
      const rejectedWalls = new Set();
      const rejectedSingles = new Set();
      let attempts = reclaimedWalls + reclaimedSingles + 10;
      while ((reclaimedWalls > 0 || reclaimedSingles > 0) && attempts-- > 0) {
        const comboBudget = {
          wallsLeft: reclaimedWalls,
          singlesLeft: reclaimedSingles,
          specialHotspots: []
        };
        const placement = findBestAiPlacement(
          grid,
          evaluateGridForAi(grid, special, neutralSpecials, null, aiWeights, baseGrid),
          special,
          neutralSpecials,
          null,
          comboBudget,
          reclaimedWalls > 0,
          reclaimedSingles > 0,
          null,
          aiWeights,
          baseGrid,
          rng
        );
        if (!placement) break;
        const keyCell = keyFor(placement.x, placement.y);
        if (placement.type === "wall" && rejectedWalls.has(keyCell)) {
          attempts--;
          continue;
        }
        if (placement.type === "single" && rejectedSingles.has(keyCell)) {
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
            rejectedWalls.add(keyCell);
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
            rejectedSingles.add(keyCell);
          }
        } else {
          break;
        }
        if (!accepted) continue;
      }

      let fallbackAttempts = reclaimedWalls + reclaimedSingles + 20;
      while ((reclaimedWalls > 0 || reclaimedSingles > 0) && fallbackAttempts-- > 0) {
        const comboBudget = {
          wallsLeft: reclaimedWalls,
          singlesLeft: reclaimedSingles,
          specialHotspots: []
        };
        const placement = findBestAiPlacement(
          grid,
          evaluateGridForAi(grid, special, neutralSpecials, null, aiWeights, baseGrid),
          special,
          neutralSpecials,
          null,
          comboBudget,
          reclaimedWalls > 0,
          reclaimedSingles > 0,
          null,
          aiWeights,
          baseGrid,
          rng
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
        const hotspots = computeSpecialHotspots(grid, special, neutralSpecials, SPECIAL_HOTSPOT_LIMIT, rng || Math.random);
        placeAiSpecial(grid, special, neutralSpecials, hotspots, rng || Math.random);
        if (special?.cell) {
          placementOrder.push({
            type: "special",
            row: special.cell.y + 1,
            column: special.cell.x + 1,
            specialCell: { ...special.cell }
          });
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
        const testSpecial = { ...special, cell: special.cell ? { ...special.cell } : null, placed: false };
        const sx = special.cell.x;
        const sy = special.cell.y;
        testGrid[sy][sx] = CELL_EMPTY;
        ensureOpenings(testGrid);
        if (hasPath(testGrid)) {
          sim = simulateRunnerTime(testGrid, testSpecial, neutralSpecials);
        }
      }
      entry.impactDelta = baseline - (sim ?? baseline);
    });
    return placementOrder;
  }

  function optimizeBlockReallocation(
    grid,
    special,
    neutralSpecials,
    specialHotspots = [],
    aiWeights = AI_WEIGHT_DEFAULTS,
    baseGrid = null,
    rng = null
  ) {
    void specialHotspots;
    const baselineScore = simulateRunnerTime(grid, special, neutralSpecials);
    let weakest = null;

    const walls = listAiWallOrigins(grid);
    walls.forEach(({ x, y }) => {
      clearBlock(grid, x, y);
      ensureOpenings(grid);
      if (!hasPath(grid)) {
        placeBlock(grid, x, y, CELL_PLAYER);
        ensureOpenings(grid);
        return;
      }
      const score = simulateRunnerTime(grid, special, neutralSpecials);
      const contribution = baselineScore - score;
      if (!weakest || contribution < weakest.contribution) {
        weakest = { type: "wall", x, y, contribution };
      }
      placeBlock(grid, x, y, CELL_PLAYER);
      ensureOpenings(grid);
    });

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
      const score = simulateRunnerTime(grid, special, neutralSpecials);
      const contribution = baselineScore - score;
      if (!weakest || contribution < weakest.contribution) {
        weakest = { type: "single", x, y, contribution, prev };
      }
      grid[y][x] = prev;
      ensureOpenings(grid);
    });

    if (!weakest || weakest.contribution >= MIN_BLOCK_RECLAIM_DELTA) {
      return { changed: false, score: baselineScore };
    }

    if (weakest.type === "wall") clearBlock(grid, weakest.x, weakest.y);
    else grid[weakest.y][weakest.x] = CELL_EMPTY;
    ensureOpenings(grid);
    if (!hasPath(grid)) {
      if (weakest.type === "wall") placeBlock(grid, weakest.x, weakest.y, CELL_PLAYER);
      else grid[weakest.y][weakest.x] = weakest.prev;
      ensureOpenings(grid);
      return { changed: false, score: baselineScore };
    }

    const wallsLeft = weakest.type === "wall" ? 1 : 0;
    const singlesLeft = weakest.type === "single" ? 1 : 0;
    const placement = findBestAiPlacement(
      grid,
      baselineScore,
      special,
      neutralSpecials,
      null,
      { wallsLeft, singlesLeft, specialHotspots: [] },
      wallsLeft > 0,
      singlesLeft > 0,
      null,
      aiWeights,
      baseGrid,
      rng
    );
    if (!placement) {
      if (weakest.type === "wall") placeBlock(grid, weakest.x, weakest.y, CELL_PLAYER);
      else grid[weakest.y][weakest.x] = weakest.prev;
      ensureOpenings(grid);
      return { changed: false, score: baselineScore };
    }
    if (placement.type === "wall") placeBlock(grid, placement.x, placement.y, CELL_PLAYER);
    else grid[placement.y][placement.x] = CELL_SINGLE;
    ensureOpenings(grid);
    const newScore = simulateRunnerTime(grid, special, neutralSpecials);
    if (newScore > baselineScore) {
      return { changed: true, score: newScore };
    }
    if (placement.type === "wall") clearBlock(grid, placement.x, placement.y);
    else grid[placement.y][placement.x] = CELL_EMPTY;
    if (weakest.type === "wall") placeBlock(grid, weakest.x, weakest.y, CELL_PLAYER);
    else grid[weakest.y][weakest.x] = weakest.prev;
    ensureOpenings(grid);
    return { changed: false, score: baselineScore };
  }

  // Export
  global.AICore = {
    buildAiLayoutFromSnapshot,
    mulberry32,
    hashSeed,
    randomInt,
    padIsMandatory,
    countMandatorySpeedPads,
    keyFor,
    evaluateGridForAi,
    evaluateSpecialCandidate,
    findTopAiWallCandidates,
    findTopAiSingleCandidates,
    findBestAiPlacement,
    collectSpeedPadSteerCells,
    findFallbackAiCandidates,
    generateRandomSingleCandidates,
    reduceMandatorySpeedPads,
    collectMandatorySpeedPads,
    getDiversionCandidates,
    tryDivertSpeedPad,
    listAiWallOrigins,
    listAiSingleCells,
    estimatePredictedRunTime,
    collectAiTimeComponents,
    computeSpecialUsageTimes,
    computePadSlowTime,
    computeSlowStackTime,
    computeDetourDistance,
    computeSlowPadProximityReward,
    computePathCoverage,
    computeBlockUsageScore,
    computeLightningPadPenalty,
    computeBeamCrossings,
    computeLightningHits,
    estimateSpecialPadSynergyTime,
    estimateSpecialOverlapTime,
    simulateRunnerTime,
    reclaimAndReallocateBlocks,
    annotatePlacementImpacts,
    optimizeBlockReallocation
  };
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);

