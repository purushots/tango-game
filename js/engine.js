/*
 * Tango puzzle engine — pure logic, zero DOM.
 *
 * Board: flat array of 36 ints. 0 = empty, 1 = sun, 2 = moon. Cell i = row*6+col.
 * Exposed as window.TangoEngine in browsers and module.exports under node.
 */
(function () {
  'use strict';

  const SIZE = 6;
  const CELLS = SIZE * SIZE;
  const SUN = 1;
  const MOON = 2;

  // --- Puzzle tuning -------------------------------------------------------
  // INITIAL_* = how many givens / constraint marks are randomly sampled from
  // the solution before trimming. MIN_* = floors the greedy trimmer will not
  // go below. Final puzzles therefore land in [MIN_GIVENS, INITIAL_GIVENS]
  // givens and [MIN_CONSTRAINTS, INITIAL_CONSTRAINTS] constraint marks
  // (target: ~4–8 givens, ~5–10 marks, like a typical LinkedIn daily).
  const INITIAL_GIVENS = 8;
  const INITIAL_CONSTRAINTS = 10;
  const MIN_GIVENS = 4;
  const MIN_CONSTRAINTS = 5;

  const TUNING = { INITIAL_GIVENS, INITIAL_CONSTRAINTS, MIN_GIVENS, MIN_CONSTRAINTS };

  const NAME = { [SUN]: 'sun', [MOON]: 'moon' };
  const opp = (v) => (v === SUN ? MOON : SUN);
  const rowOf = (i) => Math.floor(i / SIZE);
  const colOf = (i) => i % SIZE;

  // The 12 lines (6 rows then 6 columns), each with its 6 cell indexes.
  const LINES = [];
  for (let r = 0; r < SIZE; r++) {
    LINES.push({
      kind: 'row',
      name: `row ${r + 1}`,
      cells: Array.from({ length: SIZE }, (_, c) => r * SIZE + c),
    });
  }
  for (let c = 0; c < SIZE; c++) {
    LINES.push({
      kind: 'column',
      name: `column ${c + 1}`,
      cells: Array.from({ length: SIZE }, (_, r) => r * SIZE + c),
    });
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Solution generator ----------------------------------------------------
  // Randomized backtracking over cells 0..35. Valid grid: each row/col has
  // exactly 3 suns and 3 moons, no 3 identical adjacent in a row or column.
  function generateSolution(rng = Math.random) {
    const board = new Array(CELLS).fill(0);

    function ok(i, v) {
      const r = rowOf(i);
      const c = colOf(i);
      let rowCount = 0;
      for (let k = 0; k < c; k++) if (board[r * SIZE + k] === v) rowCount++;
      if (rowCount >= 3) return false;
      let colCount = 0;
      for (let k = 0; k < r; k++) if (board[k * SIZE + c] === v) colCount++;
      if (colCount >= 3) return false;
      if (c >= 2 && board[i - 1] === v && board[i - 2] === v) return false;
      if (r >= 2 && board[i - SIZE] === v && board[i - 2 * SIZE] === v) return false;
      return true;
    }

    (function fill(i) {
      if (i === CELLS) return true;
      for (const v of shuffle([SUN, MOON], rng)) {
        if (ok(i, v)) {
          board[i] = v;
          if (fill(i + 1)) return true;
          board[i] = 0;
        }
      }
      return false;
    })(0);

    return board;
  }

  // --- Brute-force solution counter (private) --------------------------------
  // Counts boards satisfying the givens + constraints + Tango rules, with
  // pruning, early-exiting once `limit` (default 2) solutions are found.
  function countSolutions(puzzle, limit = 2) {
    const board = puzzle.givens.slice();
    const byCell = Array.from({ length: CELLS }, () => []);
    for (const cn of puzzle.constraints) {
      byCell[cn.a].push({ other: cn.b, type: cn.type });
      byCell[cn.b].push({ other: cn.a, type: cn.type });
    }
    const empties = [];
    for (let i = 0; i < CELLS; i++) if (board[i] === 0) empties.push(i);

    function placeable(i, v) {
      const r = rowOf(i);
      const c = colOf(i);
      let rowCount = 0;
      let colCount = 0;
      for (let k = 0; k < SIZE; k++) {
        if (board[r * SIZE + k] === v) rowCount++;
        if (board[k * SIZE + c] === v) colCount++;
      }
      if (rowCount >= 3 || colCount >= 3) return false;
      // Any 3-window in the row/column containing i made all-equal by v?
      for (let s = Math.max(0, c - 2); s <= Math.min(SIZE - 3, c); s++) {
        let all = true;
        for (let k = s; k < s + 3; k++) {
          const cell = r * SIZE + k;
          if ((cell === i ? v : board[cell]) !== v) { all = false; break; }
        }
        if (all) return false;
      }
      for (let s = Math.max(0, r - 2); s <= Math.min(SIZE - 3, r); s++) {
        let all = true;
        for (let k = s; k < s + 3; k++) {
          const cell = k * SIZE + c;
          if ((cell === i ? v : board[cell]) !== v) { all = false; break; }
        }
        if (all) return false;
      }
      for (const cn of byCell[i]) {
        const o = board[cn.other];
        if (o !== 0 && (cn.type === 'eq' ? o !== v : o === v)) return false;
      }
      return true;
    }

    let count = 0;
    (function dfs(k) {
      if (count >= limit) return;
      if (k === empties.length) {
        count++;
        return;
      }
      const i = empties[k];
      for (const v of [SUN, MOON]) {
        if (placeable(i, v)) {
          board[i] = v;
          dfs(k + 1);
          board[i] = 0;
          if (count >= limit) return;
        }
      }
    })(0);
    return count;
  }

  // --- Human-style logic solver (private) -------------------------------------
  // Finds the first deduction available from the current board using only the
  // four human rules, in priority order. Returns
  // { cell, value, reason, involved } or null when stuck.
  function findDeduction(board, puzzle) {
    // Rule a: '=' / '×' propagation when one endpoint is known.
    for (const cn of puzzle.constraints) {
      for (const [from, to] of [[cn.a, cn.b], [cn.b, cn.a]]) {
        if (board[from] !== 0 && board[to] === 0) {
          const v = cn.type === 'eq' ? board[from] : opp(board[from]);
          const mark = cn.type === 'eq' ? '=' : '×';
          const rel = cn.type === 'eq' ? 'must match it' : 'must be the opposite';
          return {
            cell: to,
            value: v,
            reason: `This cell is joined by ${mark} to a ${NAME[board[from]]}, so it ${rel}: a ${NAME[v]}.`,
            involved: [from],
          };
        }
      }
    }

    // Rule b: no-triple. Any 3-window with two equal knowns forces the third
    // to the opposite (covers XX_, X_X and _XX).
    for (const line of LINES) {
      for (let s = 0; s <= SIZE - 3; s++) {
        const w = [line.cells[s], line.cells[s + 1], line.cells[s + 2]];
        const vals = w.map((c) => board[c]);
        if (vals.filter((v) => v === 0).length !== 1) continue;
        const known = vals.filter((v) => v !== 0);
        if (known[0] !== known[1]) continue;
        const gap = vals.indexOf(0);
        return {
          cell: w[gap],
          value: opp(known[0]),
          reason: `Three ${NAME[known[0]]}s can't sit together in a ${line.kind}, so this must be a ${NAME[opp(known[0])]}.`,
          involved: w.filter((_, k) => k !== gap),
        };
      }
    }

    // Rule c: row/col counting. 3 of a symbol placed => the rest are the other.
    for (const line of LINES) {
      for (const v of [SUN, MOON]) {
        const have = line.cells.filter((c) => board[c] === v);
        if (have.length !== 3) continue;
        const empty = line.cells.find((c) => board[c] === 0);
        if (empty === undefined) continue;
        return {
          cell: empty,
          value: opp(v),
          reason: `This ${line.name} already has its three ${NAME[v]}s, so the remaining cells are ${NAME[opp(v)]}s.`,
          involved: have,
        };
      }
    }

    // Rule d: constraint-pair counting. An unresolved '=' pair takes 2 of one
    // symbol; an '×' pair takes one of each. Use that against the line budget.
    for (const line of LINES) {
      const inLine = new Set(line.cells);
      const placedS = line.cells.filter((c) => board[c] === SUN);
      const placedM = line.cells.filter((c) => board[c] === MOON);
      const remS = 3 - placedS.length;
      const remM = 3 - placedM.length;
      const pairs = puzzle.constraints.filter(
        (cn) => inLine.has(cn.a) && inLine.has(cn.b) && board[cn.a] === 0 && board[cn.b] === 0
      );

      for (const cn of pairs) {
        if (cn.type !== 'eq') continue;
        if (remS < 2) {
          return {
            cell: cn.a,
            value: MOON,
            reason: `This = pair would need two suns, but this ${line.name} can't fit two more — both must be moons.`,
            involved: [cn.b, ...placedS],
          };
        }
        if (remM < 2) {
          return {
            cell: cn.a,
            value: SUN,
            reason: `This = pair would need two moons, but this ${line.name} can't fit two more — both must be suns.`,
            involved: [cn.b, ...placedM],
          };
        }
      }

      // Disjoint unresolved '×' pairs each consume one sun AND one moon.
      const used = new Set();
      const xPairs = [];
      for (const cn of pairs) {
        if (cn.type === 'x' && !used.has(cn.a) && !used.has(cn.b)) {
          xPairs.push(cn);
          used.add(cn.a);
          used.add(cn.b);
        }
      }
      if (xPairs.length > 0) {
        const others = line.cells.filter((c) => board[c] === 0 && !used.has(c));
        if (others.length > 0) {
          const involved = xPairs.flatMap((cn) => [cn.a, cn.b]);
          if (remS - xPairs.length === 0) {
            return {
              cell: others[0],
              value: MOON,
              reason: `The × pairs in this ${line.name} use up its remaining suns, so this cell must be a moon.`,
              involved,
            };
          }
          if (remM - xPairs.length === 0) {
            return {
              cell: others[0],
              value: SUN,
              reason: `The × pairs in this ${line.name} use up its remaining moons, so this cell must be a sun.`,
              involved,
            };
          }
        }
      }
    }

    return null;
  }

  // Applies deductions until solved or stuck. Returns { solved, board, deductions }.
  function logicSolve(puzzle, start) {
    const board = (start || puzzle.givens).slice();
    const deductions = [];
    for (;;) {
      if (!board.includes(0)) return { solved: true, board, deductions };
      const d = findDeduction(board, puzzle);
      if (!d) return { solved: false, board, deductions };
      board[d.cell] = d.value;
      deductions.push(d);
    }
  }

  // --- Puzzle generator --------------------------------------------------------
  function generatePuzzle(rng = Math.random) {
    for (;;) {
      const solution = generateSolution(rng);

      // Sample givens.
      const cellOrder = shuffle(Array.from({ length: CELLS }, (_, i) => i), rng);
      const givens = new Array(CELLS).fill(0);
      const givenCells = cellOrder.slice(0, INITIAL_GIVENS);
      for (const c of givenCells) givens[c] = solution[c];

      // Sample constraint marks from adjacent pairs, types read off the solution.
      const adjacent = [];
      for (let i = 0; i < CELLS; i++) {
        if (colOf(i) < SIZE - 1) adjacent.push([i, i + 1]);
        if (rowOf(i) < SIZE - 1) adjacent.push([i, i + SIZE]);
      }
      shuffle(adjacent, rng);
      const constraints = adjacent.slice(0, INITIAL_CONSTRAINTS).map(([a, b]) => ({
        type: solution[a] === solution[b] ? 'eq' : 'x',
        a,
        b,
      }));

      const puzzle = { size: SIZE, givens, constraints, solution };

      // Must be finishable by pure human logic AND have exactly one solution.
      if (!logicSolve(puzzle).solved) continue;
      if (countSolutions(puzzle) !== 1) continue;

      // Greedily drop redundant givens/constraints while staying logic-solvable,
      // never going below the tuned floors.
      const items = shuffle(
        [
          ...givenCells.map((cell) => ({ kind: 'given', cell })),
          ...constraints.map((cn) => ({ kind: 'constraint', cn })),
        ],
        rng
      );
      for (const item of items) {
        if (item.kind === 'given') {
          if (givens.filter((v) => v !== 0).length <= MIN_GIVENS) continue;
          const saved = givens[item.cell];
          givens[item.cell] = 0;
          if (!logicSolve(puzzle).solved) givens[item.cell] = saved;
        } else {
          if (puzzle.constraints.length <= MIN_CONSTRAINTS) continue;
          const idx = puzzle.constraints.indexOf(item.cn);
          puzzle.constraints.splice(idx, 1);
          if (!logicSolve(puzzle).solved) puzzle.constraints.splice(idx, 0, item.cn);
        }
      }

      return puzzle;
    }
  }

  // --- Validator -----------------------------------------------------------------
  // Pure rule violations, never compared against the stored solution.
  function validate(board, puzzle) {
    const errors = [];

    for (const line of LINES) {
      // Triples: maximal runs of 3+ identical filled cells.
      let s = 0;
      while (s < SIZE) {
        const v = board[line.cells[s]];
        if (v === 0) {
          s++;
          continue;
        }
        let e = s;
        while (e + 1 < SIZE && board[line.cells[e + 1]] === v) e++;
        if (e - s + 1 >= 3) {
          errors.push({
            cells: line.cells.slice(s, e + 1),
            rule: 'triple',
            message: `No more than two ${NAME[v]}s may touch in ${line.name}.`,
          });
        }
        s = e + 1;
      }
      // Balance: only flagged when a symbol is over the cap of 3. A complete,
      // unequal line necessarily has 4+ of one symbol, so it is covered too.
      for (const v of [SUN, MOON]) {
        const cells = line.cells.filter((c) => board[c] === v);
        if (cells.length > 3) {
          errors.push({
            cells,
            rule: line.kind === 'row' ? 'rowBalance' : 'colBalance',
            message: `${line.name[0].toUpperCase()}${line.name.slice(1)} has more than three ${NAME[v]}s.`,
          });
        }
      }
    }

    // Constraints: only judged when both endpoints are filled.
    for (const cn of puzzle.constraints) {
      const a = board[cn.a];
      const b = board[cn.b];
      if (a === 0 || b === 0) continue;
      if (cn.type === 'eq' && a !== b) {
        errors.push({ cells: [cn.a, cn.b], rule: 'eq', message: 'Cells joined by = must match.' });
      } else if (cn.type === 'x' && a === b) {
        errors.push({ cells: [cn.a, cn.b], rule: 'x', message: 'Cells joined by × must differ.' });
      }
    }

    const complete = !board.includes(0);
    return { errors, complete, won: complete && errors.length === 0 };
  }

  // --- Hint engine ------------------------------------------------------------------
  function hint(board, puzzle) {
    const { errors, complete } = validate(board, puzzle);

    if (errors.length > 0) {
      const e = errors[0];
      const wrong = e.cells.find((c) => board[c] !== puzzle.solution[c]);
      const cell = wrong === undefined ? e.cells[0] : wrong;
      return {
        cell,
        value: puzzle.solution[cell],
        reason: `Fix this cell first — ${e.message}`,
        involved: e.cells.slice(),
      };
    }

    if (complete) return null;

    // A filled cell can be wrong without breaking a rule yet; surface it so the
    // logic solver below always works from a solution-consistent state.
    for (let i = 0; i < CELLS; i++) {
      if (board[i] !== 0 && board[i] !== puzzle.solution[i]) {
        return {
          cell: i,
          value: puzzle.solution[i],
          reason: `This cell is incorrect — it should be a ${NAME[puzzle.solution[i]]}.`,
          involved: [i],
        };
      }
    }

    const d = findDeduction(board, puzzle);
    if (d) return d;

    // Unreachable in normal play (puzzles are logic-solvable), but never
    // return null on an incomplete board.
    const i = board.indexOf(0);
    return { cell: i, value: puzzle.solution[i], reason: 'Try this cell next.', involved: [] };
  }

  const TangoEngine = {
    generatePuzzle,
    validate,
    hint,
    generateSolution,
    TUNING,
    // Private helpers, exposed for the test suite.
    _countSolutions: countSolutions,
    _logicSolve: logicSolve,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TangoEngine;
  if (typeof window !== 'undefined') window.TangoEngine = TangoEngine;
})();
