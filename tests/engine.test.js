'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../js/engine.js');

const SIZE = 6;
const CELLS = 36;

// Deterministic RNG for reproducible tests.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertValidSolution(sol, label) {
  assert.equal(sol.length, CELLS, `${label}: length`);
  for (const v of sol) assert.ok(v === 1 || v === 2, `${label}: cell values`);
  for (let r = 0; r < SIZE; r++) {
    const row = sol.slice(r * SIZE, r * SIZE + SIZE);
    assert.equal(row.filter((v) => v === 1).length, 3, `${label}: row ${r} suns`);
    for (let c = 0; c <= SIZE - 3; c++) {
      assert.ok(
        !(row[c] === row[c + 1] && row[c + 1] === row[c + 2]),
        `${label}: row ${r} triple at ${c}`
      );
    }
  }
  for (let c = 0; c < SIZE; c++) {
    const col = [0, 1, 2, 3, 4, 5].map((r) => sol[r * SIZE + c]);
    assert.equal(col.filter((v) => v === 1).length, 3, `${label}: col ${c} suns`);
    for (let r = 0; r <= SIZE - 3; r++) {
      assert.ok(
        !(col[r] === col[r + 1] && col[r + 1] === col[r + 2]),
        `${label}: col ${c} triple at ${r}`
      );
    }
  }
}

function emptyPuzzle(constraints = []) {
  // No solution on purpose: validate must never read puzzle.solution.
  return { size: SIZE, givens: new Array(CELLS).fill(0), constraints, solution: null };
}

// ---------------------------------------------------------------- solutions

test('generateSolution: 50 seeded generations produce valid full grids', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const sol = engine.generateSolution(mulberry32(seed));
    assertValidSolution(sol, `seed ${seed}`);
  }
});

test('generateSolution: seeded RNG is deterministic', () => {
  const a = engine.generateSolution(mulberry32(42));
  const b = engine.generateSolution(mulberry32(42));
  assert.deepEqual(a, b);
});

// ------------------------------------------------------------------ puzzles

test('generatePuzzle: 30 puzzles — structure, uniqueness, logic-solvability, counts', () => {
  const { MIN_GIVENS, INITIAL_GIVENS, MIN_CONSTRAINTS, INITIAL_CONSTRAINTS } = engine.TUNING;
  // The tuned ranges themselves must sit in the spec target (~4–8 givens, ~5–10 marks).
  assert.ok(MIN_GIVENS >= 4 && INITIAL_GIVENS <= 8, 'givens tuning in 4..8');
  assert.ok(MIN_CONSTRAINTS >= 5 && INITIAL_CONSTRAINTS <= 10, 'constraints tuning in 5..10');

  for (let seed = 1; seed <= 30; seed++) {
    const p = engine.generatePuzzle(mulberry32(seed * 101));
    assert.equal(p.size, SIZE);
    assertValidSolution(p.solution, `puzzle ${seed} solution`);

    // Givens consistent with solution, count within tuned range.
    let givenCount = 0;
    for (let i = 0; i < CELLS; i++) {
      if (p.givens[i] !== 0) {
        givenCount++;
        assert.equal(p.givens[i], p.solution[i], `puzzle ${seed} given ${i}`);
      }
    }
    assert.ok(
      givenCount >= MIN_GIVENS && givenCount <= INITIAL_GIVENS,
      `puzzle ${seed} given count ${givenCount}`
    );

    // Constraints: adjacent, a < b, consistent with solution, count in range.
    assert.ok(
      p.constraints.length >= MIN_CONSTRAINTS && p.constraints.length <= INITIAL_CONSTRAINTS,
      `puzzle ${seed} constraint count ${p.constraints.length}`
    );
    for (const cn of p.constraints) {
      assert.ok(cn.type === 'eq' || cn.type === 'x', `puzzle ${seed} type`);
      assert.ok(cn.a < cn.b, `puzzle ${seed} a<b`);
      const horizontal = cn.b === cn.a + 1 && cn.a % SIZE < SIZE - 1;
      const vertical = cn.b === cn.a + SIZE;
      assert.ok(horizontal || vertical, `puzzle ${seed} adjacency ${cn.a}-${cn.b}`);
      if (cn.type === 'eq') assert.equal(p.solution[cn.a], p.solution[cn.b]);
      else assert.notEqual(p.solution[cn.a], p.solution[cn.b]);
    }

    // Exactly one solution by brute force.
    assert.equal(engine._countSolutions(p), 1, `puzzle ${seed} uniqueness`);

    // Logic solver finishes from the givens and reaches the stored solution.
    const res = engine._logicSolve(p);
    assert.ok(res.solved, `puzzle ${seed} logic-solvable`);
    assert.deepEqual(res.board, p.solution, `puzzle ${seed} solver matches solution`);
    for (const d of res.deductions) {
      assert.equal(typeof d.cell, 'number');
      assert.ok(d.value === 1 || d.value === 2);
      assert.equal(typeof d.reason, 'string');
      assert.ok(d.reason.length > 0);
      assert.ok(Array.isArray(d.involved));
    }
  }
});

// -------------------------------------------------------------------- hints

test('hint: replaying hints from an empty board reaches the solution', () => {
  for (const seed of [11, 22, 33, 44, 55]) {
    const p = engine.generatePuzzle(mulberry32(seed));
    const board = p.givens.slice();
    let guard = 0;
    while (board.includes(0)) {
      const h = engine.hint(board, p);
      assert.ok(h, `seed ${seed}: hint available on incomplete board`);
      assert.equal(board[h.cell], 0, `seed ${seed}: hint targets an empty cell`);
      assert.equal(h.value, p.solution[h.cell], `seed ${seed}: hint matches solution`);
      assert.equal(typeof h.reason, 'string');
      assert.ok(Array.isArray(h.involved));
      board[h.cell] = h.value;
      assert.ok(++guard <= CELLS, `seed ${seed}: hint loop terminates`);
    }
    assert.equal(engine.hint(board, p), null, `seed ${seed}: null when complete`);
    const v = engine.validate(board, p);
    assert.ok(v.won, `seed ${seed}: replayed board wins`);
  }
});

test('hint: midway (correct partial) boards always match the solution', () => {
  for (const seed of [7, 19, 31]) {
    const p = engine.generatePuzzle(mulberry32(seed));
    const rng = mulberry32(seed + 1000);
    const board = p.givens.slice();
    // Fill ~12 extra correct cells at random.
    const empties = [];
    for (let i = 0; i < CELLS; i++) if (board[i] === 0) empties.push(i);
    for (let k = 0; k < 12 && empties.length; k++) {
      const j = Math.floor(rng() * empties.length);
      const cell = empties.splice(j, 1)[0];
      board[cell] = p.solution[cell];
    }
    let guard = 0;
    while (board.includes(0)) {
      const h = engine.hint(board, p);
      assert.ok(h, `seed ${seed}: hint on midway board`);
      assert.equal(h.value, p.solution[h.cell], `seed ${seed}: midway hint matches solution`);
      board[h.cell] = h.value;
      assert.ok(++guard <= CELLS);
    }
    assert.ok(engine.validate(board, p).won);
  }
});

test('hint: errored board returns an errored cell with the solution value', () => {
  const p = engine.generatePuzzle(mulberry32(7));
  const board = new Array(CELLS).fill(0);
  board[0] = board[1] = board[2] = 1; // triple in row 1
  const h = engine.hint(board, p);
  assert.ok(h);
  assert.ok([0, 1, 2].includes(h.cell));
  assert.equal(h.value, p.solution[h.cell]);
  assert.notEqual(board[h.cell], p.solution[h.cell], 'hint picks a cell that actually changes');
  assert.deepEqual([...h.involved].sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(typeof h.reason, 'string');
});

test('hint: null only on a complete board', () => {
  const p = engine.generatePuzzle(mulberry32(3));
  assert.equal(engine.hint(p.solution.slice(), p), null);
  const oneShort = p.solution.slice();
  oneShort[35] = 0;
  assert.notEqual(engine.hint(oneShort, p), null);
});

// ----------------------------------------------------------------- validate

test('validate: detects a horizontal triple (cells = the run)', () => {
  const p = emptyPuzzle();
  const board = new Array(CELLS).fill(0);
  board[0] = board[1] = board[2] = 1;
  const v = engine.validate(board, p);
  const e = v.errors.find((x) => x.rule === 'triple');
  assert.ok(e);
  assert.deepEqual(e.cells, [0, 1, 2]);
  assert.equal(v.complete, false);
  assert.equal(v.won, false);
});

test('validate: detects a vertical triple', () => {
  const p = emptyPuzzle();
  const board = new Array(CELLS).fill(0);
  board[0] = board[6] = board[12] = 2;
  const e = engine.validate(board, p).errors.find((x) => x.rule === 'triple');
  assert.ok(e);
  assert.deepEqual(e.cells, [0, 6, 12]);
});

test('validate: a 4-run is reported as one triple error covering the whole run', () => {
  const p = emptyPuzzle();
  const board = new Array(CELLS).fill(0);
  board[0] = board[1] = board[2] = board[3] = 1;
  const triples = engine.validate(board, p).errors.filter((x) => x.rule === 'triple');
  assert.equal(triples.length, 1);
  assert.deepEqual(triples[0].cells, [0, 1, 2, 3]);
});

test('validate: rowBalance only when over the cap', () => {
  const p = emptyPuzzle();
  // 3 suns in an incomplete row: NOT an error.
  let board = new Array(CELLS).fill(0);
  board[0] = 1; board[1] = 1; board[2] = 2; board[3] = 1;
  assert.equal(engine.validate(board, p).errors.length, 0);
  // 4 suns (no triple): rowBalance error on the sun cells.
  board = new Array(CELLS).fill(0);
  board[0] = 1; board[1] = 1; board[2] = 2; board[3] = 1; board[4] = 1;
  const e = engine.validate(board, p).errors.find((x) => x.rule === 'rowBalance');
  assert.ok(e);
  assert.deepEqual(e.cells, [0, 1, 3, 4]);
});

test('validate: complete unbalanced row is a rowBalance error', () => {
  const p = emptyPuzzle();
  const board = new Array(CELLS).fill(0);
  // Row 1 complete: 4 suns / 2 moons, no triple.
  [1, 1, 2, 1, 1, 2].forEach((v, c) => (board[c] = v));
  const e = engine.validate(board, p).errors.find((x) => x.rule === 'rowBalance');
  assert.ok(e);
});

test('validate: colBalance when a column has 4 of a symbol', () => {
  const p = emptyPuzzle();
  const board = new Array(CELLS).fill(0);
  board[0] = 2; board[6] = 2; board[12] = 1; board[18] = 2; board[24] = 2;
  const e = engine.validate(board, p).errors.find((x) => x.rule === 'colBalance');
  assert.ok(e);
  assert.deepEqual(e.cells, [0, 6, 18, 24]);
  assert.equal(engine.validate(board, p).errors.filter((x) => x.rule === 'triple').length, 0);
});

test('validate: eq violated only when both endpoints are filled', () => {
  const p = emptyPuzzle([{ type: 'eq', a: 0, b: 1 }]);
  const board = new Array(CELLS).fill(0);
  board[0] = 1;
  assert.equal(engine.validate(board, p).errors.length, 0);
  board[1] = 2;
  const e = engine.validate(board, p).errors.find((x) => x.rule === 'eq');
  assert.ok(e);
  assert.deepEqual(e.cells, [0, 1]);
});

test('validate: x violated only when both endpoints are filled', () => {
  const p = emptyPuzzle([{ type: 'x', a: 0, b: 6 }]);
  const board = new Array(CELLS).fill(0);
  board[0] = 1;
  assert.equal(engine.validate(board, p).errors.length, 0);
  board[6] = 1;
  const e = engine.validate(board, p).errors.find((x) => x.rule === 'x');
  assert.ok(e);
  assert.deepEqual(e.cells, [0, 6]);
});

test('validate: satisfied constraints produce no errors', () => {
  const p = emptyPuzzle([
    { type: 'eq', a: 0, b: 1 },
    { type: 'x', a: 2, b: 8 },
  ]);
  const board = new Array(CELLS).fill(0);
  board[0] = 1; board[1] = 1; board[2] = 2; board[8] = 1;
  assert.equal(engine.validate(board, p).errors.length, 0);
});

test('validate: solved board is complete and won', () => {
  const p = engine.generatePuzzle(mulberry32(5));
  const v = engine.validate(p.solution.slice(), p);
  assert.equal(v.complete, true);
  assert.deepEqual(v.errors, []);
  assert.equal(v.won, true);
});

test('validate: complete board with an error is not won', () => {
  const p = engine.generatePuzzle(mulberry32(5));
  const board = p.solution.slice();
  board[0] = board[0] === 1 ? 2 : 1; // breaks row/col balance
  const v = engine.validate(board, p);
  assert.equal(v.complete, true);
  assert.ok(v.errors.length > 0);
  assert.equal(v.won, false);
});

test('validate: incomplete, error-free board is neither complete nor won', () => {
  const p = engine.generatePuzzle(mulberry32(9));
  const v = engine.validate(p.givens.slice(), p);
  assert.equal(v.complete, false);
  assert.equal(v.won, false);
  assert.equal(v.errors.length, 0);
});

// -------------------------------------------------------------------- speed

test('speed: average generation well under 100ms over 30 puzzles', () => {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 30; i++) engine.generatePuzzle();
  const avgMs = Number(process.hrtime.bigint() - t0) / 1e6 / 30;
  assert.ok(avgMs < 100, `average ${avgMs.toFixed(2)}ms per puzzle`);
});
