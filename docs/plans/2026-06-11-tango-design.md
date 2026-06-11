# Tango — Unlimited Practice Puzzles (Design)

**Date:** 2026-06-11
**Goal:** A faithful replica of LinkedIn's Tango puzzle, playable unlimited times,
installed on iPhone as a PWA (GitHub Pages + Add to Home Screen).

## Decisions (from user)

- Delivery: GitHub Pages, installable PWA, works offline.
- Location: new repo `tango-game` (sibling of `queens-game`).
- Difficulty: single level, tuned to a typical LinkedIn daily puzzle.
- Features: timer, undo, hint, automatic error detection, clear board.
- All assets/code original — no LinkedIn branding or copied assets.

## Game rules (Tango)

- 6×6 grid; every cell must be filled with a sun or a moon.
- No more than 2 identical symbols adjacent in a row or column (no triples).
- Every row and every column contains exactly 3 suns and 3 moons.
- `=` between two cells: they must contain the same symbol.
- `×` between two cells: they must contain opposite symbols.
- Some cells are pre-filled and locked.
- Exactly one solution, reachable by pure logic (no guessing).

## Architecture

Vanilla HTML/CSS/JS, no build step (same approach as queens-game).

| File | Responsibility |
|---|---|
| `js/engine.js` | Solution generator, logic solver, puzzle generator, validator, hint engine. Pure logic, no DOM. Exposed as `window.TangoEngine` + CommonJS export for tests. |
| `js/app.js` | UI state machine, rendering, input handling, timer, undo stack. |
| `index.html`, `css/styles.css` | Single page, mobile-first. |
| `manifest.json`, `sw.js`, `icons/` | PWA: standalone display, offline cache-first. |
| `tests/engine.test.js` | `node --test` suite for the engine. |

## Engine contract

Board = flat array of 36 ints: `0` empty, `1` sun, `2` moon. Cell index `i = row*6+col`.

```js
generatePuzzle(rng?) -> {
  size: 6,
  givens: int[36],          // 0 = not given
  constraints: [{ type: 'eq'|'x', a: i, b: j }],  // a,b adjacent, a < b
  solution: int[36],
}
validate(board, puzzle) -> {
  errors: [{ cells: int[], rule: 'triple'|'rowBalance'|'colBalance'|'eq'|'x', message: string }],
  complete: boolean,        // all 36 filled
  won: boolean,             // complete && no errors && matches rules
}
hint(board, puzzle) -> { cell: i, value: 1|2, reason: string, involved: int[] } | null
```

### Puzzle generation (the "unlimited" part)

1. Backtracking fills a random complete valid solution grid.
2. Sample candidate givens + `=`/`×` constraint marks from the solution.
3. Keep only puzzles a **human-style deduction solver** finishes without guessing
   (rules: no-triple inference, row/col count caps, `=`/`×` propagation).
4. Greedily remove redundant givens/constraints while still logic-solvable.
5. Target a typical LinkedIn daily: roughly 4–8 givens, 4–10 constraint marks.

Uniqueness is verified by brute force (count solutions, must be exactly 1).

## UX (replicating LinkedIn Tango)

- Tap a cell to cycle: empty → sun → moon → empty. Givens are locked, shaded.
- Timer at top, starts on first reveal, stops on win.
- Buttons: Undo, Hint, Clear (with confirm).
- Errors: after a short delay, violating cells get red dashed markers + a message
  explaining the broken rule.
- Hint: fills/indicates the next logically deducible cell, highlights the cells
  that justify it, with a one-line explanation.
- Win: overlay with solve time and a "New puzzle" button.
- "How to play" modal with the rules.
- New puzzle is generated client-side, instantly, forever — no server.

## Verification

- Engine: `node --test tests/` — uniqueness (brute force), logic-solvability,
  validator edge cases, generation speed (< ~100 ms/puzzle).
- UI: Playwright at iPhone viewport (390×844) — tap cycle, undo, clear, error
  markers, hint, full win flow, no console errors.
- Deploy: GitHub Pages live URL loads and is installable (manifest + SW reachable).
