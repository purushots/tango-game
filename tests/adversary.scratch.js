'use strict';
/*
 * ADVERSARIAL AUDIT SCRATCH FILE — independent checks for js/engine.js.
 * Deliberately does NOT reuse the engine's solver or its test suite.
 * Run: node tests/adversary.scratch.js
 */
const E = require('/Users/purushotsadagopan/Github_Repos/tango-game/js/engine.js');
const { performance } = require('perf_hooks');

const SIZE = 6;
const CELLS = 36;
const SUN = 1;
const MOON = 2;

let failCount = 0;
let passCount = 0;
function fail(tag, msg, extra) {
  failCount++;
  console.log(`FAIL [${tag}] ${msg}${extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''}`);
}
function ok(tag) {
  passCount++;
}
function assert(cond, tag, msg, extra) {
  if (cond) ok(tag);
  else fail(tag, msg, extra);
  return cond;
}

// ---------------------------------------------------------------------------
// Independent full-board rule checker (written from the rules, not the engine).
// ---------------------------------------------------------------------------
function checkFullBoard(board, constraints) {
  const problems = [];
  if (!Array.isArray(board) || board.length !== CELLS) {
    problems.push('board not 36 cells');
    return problems;
  }
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== SUN && board[i] !== MOON) problems.push(`cell ${i} = ${board[i]} (not filled 1/2)`);
  }
  for (let r = 0; r < SIZE; r++) {
    let suns = 0;
    for (let c = 0; c < SIZE; c++) if (board[r * SIZE + c] === SUN) suns++;
    if (suns !== 3) problems.push(`row ${r} has ${suns} suns`);
    for (let c = 0; c + 2 < SIZE; c++) {
      const a = board[r * SIZE + c], b = board[r * SIZE + c + 1], d = board[r * SIZE + c + 2];
      if (a !== 0 && a === b && b === d) problems.push(`row ${r} triple at cols ${c}..${c + 2}`);
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let suns = 0;
    for (let r = 0; r < SIZE; r++) if (board[r * SIZE + c] === SUN) suns++;
    if (suns !== 3) problems.push(`col ${c} has ${suns} suns`);
    for (let r = 0; r + 2 < SIZE; r++) {
      const a = board[r * SIZE + c], b = board[(r + 1) * SIZE + c], d = board[(r + 2) * SIZE + c];
      if (a !== 0 && a === b && b === d) problems.push(`col ${c} triple at rows ${r}..${r + 2}`);
    }
  }
  for (const cn of constraints) {
    if (cn.type === 'eq' && board[cn.a] !== board[cn.b]) problems.push(`eq mark violated ${cn.a}-${cn.b}`);
    if (cn.type === 'x' && board[cn.a] === board[cn.b]) problems.push(`x mark violated ${cn.a}-${cn.b}`);
  }
  return problems;
}

function isOrthAdjacent(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a < 0 || a >= CELLS || b < 0 || b >= CELLS) return false;
  const ra = Math.floor(a / SIZE), ca = a % SIZE;
  const rb = Math.floor(b / SIZE), cb = b % SIZE;
  return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
}

// ---------------------------------------------------------------------------
// Independent brute-force solver: row-pattern DFS (structurally different from
// the engine's cell-by-cell DFS). Enumerates ALL solutions up to `limit`.
// ---------------------------------------------------------------------------
const VALID_ROWS = (() => {
  const rows = [];
  for (let m = 0; m < 64; m++) {
    const row = [];
    let suns = 0;
    for (let k = 0; k < 6; k++) {
      const v = (m >> k) & 1 ? SUN : MOON;
      row.push(v);
      if (v === SUN) suns++;
    }
    if (suns !== 3) continue;
    let triple = false;
    for (let k = 0; k + 2 < 6; k++) if (row[k] === row[k + 1] && row[k + 1] === row[k + 2]) triple = true;
    if (!triple) rows.push(row);
  }
  return rows;
})();

function bruteSolve(puzzle, limit = 3) {
  const horiz = Array.from({ length: SIZE }, () => []); // [row] -> {c, type} between (r,c)-(r,c+1)
  const vert = Array.from({ length: SIZE }, () => []);  // [r] -> {c, type} between (r-1,c)-(r,c)
  for (const cn of puzzle.constraints) {
    const lo = Math.min(cn.a, cn.b), hi = Math.max(cn.a, cn.b);
    if (hi - lo === 1 && Math.floor(lo / SIZE) === Math.floor(hi / SIZE)) {
      horiz[Math.floor(lo / SIZE)].push({ c: lo % SIZE, type: cn.type });
    } else if (hi - lo === SIZE) {
      vert[Math.floor(hi / SIZE)].push({ c: lo % SIZE, type: cn.type });
    } else {
      return { count: -1, solutions: [], badConstraint: cn };
    }
  }
  const grid = [];
  const colS = new Array(SIZE).fill(0);
  const colM = new Array(SIZE).fill(0);
  const solutions = [];
  let count = 0;
  (function rec(r) {
    if (count >= limit) return;
    if (r === SIZE) {
      count++;
      if (solutions.length < limit) solutions.push([].concat(...grid));
      return;
    }
    outer:
    for (const row of VALID_ROWS) {
      for (let c = 0; c < SIZE; c++) {
        const g = puzzle.givens[r * SIZE + c];
        if (g !== 0 && g !== row[c]) continue outer;
      }
      for (const h of horiz[r]) {
        const same = row[h.c] === row[h.c + 1];
        if (h.type === 'eq' ? !same : same) continue outer;
      }
      for (const v of vert[r]) {
        const same = grid[r - 1][v.c] === row[v.c];
        if (v.type === 'eq' ? !same : same) continue outer;
      }
      for (let c = 0; c < SIZE; c++) {
        if (r >= 2 && grid[r - 1][c] === row[c] && grid[r - 2][c] === row[c]) continue outer;
        const ns = colS[c] + (row[c] === SUN ? 1 : 0);
        const nm = colM[c] + (row[c] === MOON ? 1 : 0);
        const rowsLeft = SIZE - 1 - r;
        if (ns > 3 || nm > 3 || ns + rowsLeft < 3 || nm + rowsLeft < 3) continue outer;
      }
      for (let c = 0; c < SIZE; c++) (row[c] === SUN ? colS : colM)[c]++;
      grid.push(row);
      rec(r + 1);
      grid.pop();
      for (let c = 0; c < SIZE; c++) (row[c] === SUN ? colS : colM)[c]--;
      if (count >= limit) return;
    }
  })(0);
  return { count, solutions };
}

// Self-test the independent solver: with no givens/constraints it must count
// many solutions, and a fully-given puzzle must count exactly 1.
{
  const open = bruteSolve({ givens: new Array(CELLS).fill(0), constraints: [] }, 5);
  assert(open.count === 5, 'self', `open board should hit limit 5, got ${open.count}`);
  const sol = E.generateSolution();
  const closed = bruteSolve({ givens: sol.slice(), constraints: [] }, 3);
  assert(closed.count === 1, 'self', `fully-given board should count 1, got ${closed.count}`);
}

// ---------------------------------------------------------------------------
// (e) hint-loop runner with stall + non-termination + wrong-value detection.
// ---------------------------------------------------------------------------
function runHintLoop(p, startBoard, tag, idx) {
  const board = startBoard.slice();
  let steps = 0;
  while (board.includes(0) || board.some((v, i) => v !== p.solution[i])) {
    if (steps++ > 120) {
      fail(tag, `puzzle ${idx}: hint loop exceeded 120 steps (non-termination)`);
      return;
    }
    const h = E.hint(board, p);
    if (!h) { fail(tag, `puzzle ${idx}: hint() returned null on unfinished board`); return; }
    if (!(Number.isInteger(h.cell) && h.cell >= 0 && h.cell < CELLS)) {
      fail(tag, `puzzle ${idx}: hint cell out of range`, h.cell);
      return;
    }
    if (h.value !== p.solution[h.cell]) {
      fail(tag, `puzzle ${idx}: hint proposed ${h.value} at cell ${h.cell}, solution says ${p.solution[h.cell]}`);
      return;
    }
    if (board[h.cell] === h.value) {
      fail(tag, `puzzle ${idx}: hint proposed a no-op at cell ${h.cell} (stall)`);
      return;
    }
    board[h.cell] = h.value;
  }
  const v = E.validate(board, p);
  if (!v.won) fail(tag, `puzzle ${idx}: hint-completed board not reported as won`);
  else ok(tag);
}

// ---------------------------------------------------------------------------
// Generate >= 200 puzzles, timing each. Then run checks (a)-(e) per puzzle.
// ---------------------------------------------------------------------------
const N = 200;
const times = [];
const puzzles = [];
for (let t = 0; t < N; t++) {
  const t0 = performance.now();
  puzzles.push(E.generatePuzzle());
  times.push(performance.now() - t0);
}

let givensMin = Infinity, givensMax = -Infinity, consMin = Infinity, consMax = -Infinity;

puzzles.forEach((p, idx) => {
  // (a) stored solution satisfies all rules AND all constraint marks
  const probs = checkFullBoard(p.solution, p.constraints);
  assert(probs.length === 0, 'a', `puzzle ${idx}: stored solution invalid`, probs.slice(0, 4));

  // (c) givens consistent with solution, sane values
  let givenCount = 0;
  let givensOk = true;
  for (let i = 0; i < CELLS; i++) {
    const g = p.givens[i];
    if (g !== 0 && g !== SUN && g !== MOON) { givensOk = false; fail('c', `puzzle ${idx}: given ${i} bad value ${g}`); }
    if (g !== 0) {
      givenCount++;
      if (g !== p.solution[i]) { givensOk = false; fail('c', `puzzle ${idx}: given ${i}=${g} contradicts solution ${p.solution[i]}`); }
    }
  }
  if (givensOk) ok('c');
  givensMin = Math.min(givensMin, givenCount);
  givensMax = Math.max(givensMax, givenCount);
  consMin = Math.min(consMin, p.constraints.length);
  consMax = Math.max(consMax, p.constraints.length);

  // (d) constraint marks only between orthogonally adjacent cells, valid types
  let adjOk = true;
  for (const cn of p.constraints) {
    if (cn.type !== 'eq' && cn.type !== 'x') { adjOk = false; fail('d', `puzzle ${idx}: bad constraint type`, cn); }
    if (!isOrthAdjacent(cn.a, cn.b)) { adjOk = false; fail('d', `puzzle ${idx}: non-adjacent constraint`, cn); }
  }
  if (adjOk) ok('d');

  // (b) exactly one solution per my independent solver, and it matches stored
  const res = bruteSolve(p, 3);
  if (!assert(res.count === 1, 'b', `puzzle ${idx}: independent solver found ${res.count} solutions`)) return;
  assert(
    res.solutions[0].every((v, i) => v === p.solution[i]),
    'b',
    `puzzle ${idx}: independent unique solution differs from stored solution`
  );

  // (e) hint loops: from the givens board, from a totally empty board, and
  // from a sabotaged board (3 deliberately wrong cells).
  runHintLoop(p, p.givens, 'e-givens', idx);
  runHintLoop(p, new Array(CELLS).fill(0), 'e-empty', idx);
  const sab = p.givens.slice();
  let flipped = 0;
  for (let i = 0; i < CELLS && flipped < 3; i++) {
    if (sab[i] === 0) { sab[i] = p.solution[i] === SUN ? MOON : SUN; flipped++; }
  }
  runHintLoop(p, sab, 'e-sabotage', idx);

  // (e+) soundness on arbitrary consistent partial boards (off the natural
  // solve path) — hint must never contradict the stored solution.
  for (let k = 0; k < 3; k++) {
    const board = p.givens.slice();
    for (let i = 0; i < CELLS; i++) if (board[i] === 0 && Math.random() < 0.35) board[i] = p.solution[i];
    if (!board.includes(0)) continue;
    const h = E.hint(board, p);
    assert(
      h && h.value === p.solution[h.cell] && board[h.cell] !== h.value,
      'e-random',
      `puzzle ${idx}: hint unsound on random consistent partial board`,
      h
    );
  }
});

// ---------------------------------------------------------------------------
// (f) validate() on 10 hand-crafted boards.
// ---------------------------------------------------------------------------
const NO_CONS = { constraints: [] };
const emptyBoard = () => new Array(CELLS).fill(0);

// f1: triple in a row
{
  const b = emptyBoard();
  b[0] = b[1] = b[2] = SUN;
  const r = E.validate(b, NO_CONS);
  assert(
    r.errors.some((e) => e.rule === 'triple' && JSON.stringify(e.cells) === '[0,1,2]') && !r.complete && !r.won,
    'f1', 'row triple [0,1,2] not flagged', r.errors
  );
}

// f2: triple in a column
{
  const b = emptyBoard();
  b[0] = b[6] = b[12] = MOON;
  const r = E.validate(b, NO_CONS);
  assert(
    r.errors.some((e) => e.rule === 'triple' && JSON.stringify(e.cells) === '[0,6,12]'),
    'f2', 'column triple [0,6,12] not flagged', r.errors
  );
}

// f3: 4 suns in a row (no triple: cells 0,1,3,4)
{
  const b = emptyBoard();
  b[0] = b[1] = b[3] = b[4] = SUN;
  const r = E.validate(b, NO_CONS);
  assert(
    r.errors.some((e) => e.rule === 'rowBalance' && e.cells.length === 4) &&
      !r.errors.some((e) => e.rule === 'triple'),
    'f3', '4 suns in row not flagged as rowBalance (or spurious triple)', r.errors
  );
}

// f4: complete board with unbalanced column 0 (4 suns), every row balanced
{
  const b = [
    1, 2, 2, 1, 1, 2,
    1, 2, 1, 2, 2, 1,
    2, 1, 1, 2, 1, 2,
    1, 2, 2, 1, 2, 1,
    1, 1, 2, 2, 1, 2,
    2, 1, 1, 2, 2, 1,
  ];
  const r = E.validate(b, NO_CONS);
  assert(
    r.complete === true && r.won === false &&
      r.errors.some((e) => e.rule === 'colBalance' && e.cells.length === 4 && e.cells.every((c) => c % 6 === 0)),
    'f4', 'complete unbalanced column 0 not flagged as colBalance', r.errors
  );
}

// f5: violated '='
{
  const b = emptyBoard();
  b[0] = SUN; b[1] = MOON;
  const r = E.validate(b, { constraints: [{ type: 'eq', a: 0, b: 1 }] });
  assert(r.errors.some((e) => e.rule === 'eq'), 'f5', 'violated = not flagged', r.errors);
}

// f6: violated '×'
{
  const b = emptyBoard();
  b[0] = SUN; b[6] = SUN;
  const r = E.validate(b, { constraints: [{ type: 'x', a: 0, b: 6 }] });
  assert(r.errors.some((e) => e.rule === 'x'), 'f6', 'violated x not flagged', r.errors);
}

// f6b: half-filled constraint pairs must NOT be flagged
{
  const b = emptyBoard();
  b[0] = SUN;
  const r = E.validate(b, { constraints: [{ type: 'eq', a: 0, b: 1 }, { type: 'x', a: 0, b: 6 }] });
  assert(r.errors.length === 0, 'f6b', 'half-filled constraint pair wrongly flagged', r.errors);
}

// f7: correct complete board => won === true (with satisfied constraints)
{
  const A = [1, 2, 1, 2, 1, 2];
  const B = [2, 1, 2, 1, 2, 1];
  const b = [].concat(A, B, A, B, A, B);
  const cons = [{ type: 'x', a: 0, b: 1 }, { type: 'x', a: 0, b: 6 }];
  const r = E.validate(b, { constraints: cons });
  assert(r.won === true && r.complete === true && r.errors.length === 0, 'f7', 'valid complete board not won', r.errors);
}

// f8: empty board => no errors, not complete, not won
{
  const r = E.validate(emptyBoard(), { constraints: [{ type: 'eq', a: 0, b: 1 }] });
  assert(r.errors.length === 0 && !r.complete && !r.won, 'f8', 'empty board produced errors', r.errors);
}

// f9: wrap-around — flat indexes 4,5,6 all suns is NOT a triple (5 ends row 0,
// 6 starts row 1); also 3,4,5 sun + 6 sun must flag exactly [3,4,5].
{
  const b1 = emptyBoard();
  b1[4] = b1[5] = b1[6] = SUN;
  const r1 = E.validate(b1, NO_CONS);
  assert(r1.errors.length === 0, 'f9', 'wrap-around cells 4,5,6 wrongly flagged', r1.errors);

  const b2 = emptyBoard();
  b2[3] = b2[4] = b2[5] = b2[6] = SUN;
  const r2 = E.validate(b2, NO_CONS);
  const triples = r2.errors.filter((e) => e.rule === 'triple');
  assert(
    triples.length === 1 && JSON.stringify(triples[0].cells) === '[3,4,5]',
    'f9', 'triple across row boundary mis-detected (should be exactly [3,4,5])', r2.errors
  );
}

// f10: givens included in triples are still flagged
{
  const givens = emptyBoard();
  givens[0] = SUN; // pretend cell 0 is a given
  const b = givens.slice();
  b[1] = SUN; b[2] = SUN;
  const r = E.validate(b, NO_CONS);
  assert(
    r.errors.some((e) => e.rule === 'triple' && e.cells.includes(0)),
    'f10', 'triple containing a given not flagged', r.errors
  );
}

// ---------------------------------------------------------------------------
// (g) generation timing report
// ---------------------------------------------------------------------------
const sorted = times.slice().sort((x, y) => x - y);
const mean = times.reduce((s, t) => s + t, 0) / times.length;
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
const max = sorted[sorted.length - 1];
console.log(`\n--- generation timing over ${N} puzzles ---`);
console.log(`mean ${mean.toFixed(2)} ms | p50 ${sorted[Math.floor(N / 2)].toFixed(2)} ms | p95 ${p95.toFixed(2)} ms | max ${max.toFixed(2)} ms`);
console.log(`givens per puzzle: ${givensMin}..${givensMax} | constraints per puzzle: ${consMin}..${consMax}`);

console.log(`\n=== RESULT: ${failCount} failures, ${passCount} assertion groups passed ===`);
process.exit(failCount === 0 ? 0 : 1);
