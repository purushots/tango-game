# Tango-style Puzzle Game — UI/UX Specification

Goal: faithfully replicate the look, feel, and behavior of LinkedIn's "Tango" daily
logic puzzle, using entirely original code, artwork, and wording (no LinkedIn branding,
no copied assets or text).

All px values are for a 390px-wide mobile viewport. Values marked **approximation**
were inferred from screenshots, reviews, and clones rather than measured from the
original; treat them as tunable defaults.

---

## 1. Layout (top to bottom, 390px viewport)

```
+--------------------------------------------------+
| Header bar (h 48px)                              |
|  [back/menu]   Tango #123        [?] [gear]      |
+--------------------------------------------------+
|  Toolbar row (h 36px)                            |
|  (clock icon) 0:42                               |
+--------------------------------------------------+
|                                                  |
|              6 x 6 BOARD (348 x 348)             |
|                                                  |
+--------------------------------------------------+
|  Button row (h 56px incl. margin)                |
|   [ ⟲ Undo ]              [ 💡 Hint ]            |
+--------------------------------------------------+
|  (contextual message area, e.g. hint text)       |
+--------------------------------------------------+
```

### Header
- Bar height 48px, white background `#FFFFFF`, bottom hairline `1px solid #E0E0E0`.
- Title: game name + puzzle number, e.g. `Tango #123` — 16px, weight 600,
  color `#1A1A1A`. LinkedIn shows the game wordmark + "No. 123"; we render
  `Tango #123` (number increments daily).
- Right side: circular icon buttons (32px tap target): Help `?` (opens how-to-play)
  and Settings gear. **approximation** on exact icon set; original also has a
  three-dot overflow menu containing "Clear board".
- Timer sits on its own row directly under the header (LinkedIn places the clock +
  elapsed time above the board, left-aligned — **approximation**: some layouts center
  it): 14px text `#666666`, preceded by a 16px outline clock icon, format `m:ss`
  (e.g. `0:42`, `12:05` once over 10 min). No leading zero on minutes.

### Button row (below board)
- Two pill buttons side by side, centered, 12px gap, 16px top margin.
- Confirmed buttons in the original: **Undo** (left) and **Hint** (right).
  "Clear" is NOT a third inline button; board-clearing lives in the overflow/settings
  menu as "Clear board" (**approximation** on exact placement — safe to also expose a
  small `Clear` text link if desired, but the canonical row is Undo + Hint).
- Pill style: height 40px, padding 0 20px, border-radius 20px (fully rounded),
  background `#FFFFFF`, border `1px solid #B6B6B6`, label 14px weight 600 `#3B3B3B`.
  Leading 16px icon: counterclockwise arrow for Undo, lightbulb for Hint.
- Undo is disabled (text/border `#C9C9C9`, no pointer) when the move stack is empty.
  Undo never removes givens; it pops the last user action (including a cycle step).

### Footer
- The original is embedded in LinkedIn's games hub (links to its other daily games,
  "share" affordances). For a standalone clone: a slim footer with
  `How to play · Clear board · About` text links, 13px `#666666`. **approximation**
  (original footer content is LinkedIn-specific and should not be replicated).

---

## 2. Board (6×6 grid)

- Board size 348×348px (390 − 2×16 side padding − 2×2 outer border ≈ 348),
  i.e. **cell size 58×58px**.
- Cell background: white `#FFFFFF`.
- **Given (pre-filled, locked) cells**: light gray fill `#EDEDED`
  (**approximation**: anywhere `#E9EBED`–`#F0F0F0` reads correctly). The symbol in a
  given cell is identical to player-placed symbols; only the cell fill differs.
- Inner grid lines: `1px solid #D9D9D9` (**approximation** `#D0D0D0`–`#E0E0E0`).
- Outer border: `2px solid #D9D9D9` (slightly heavier than inner lines),
  **border-radius 8px** on the board container (**approximation**: 6–10px).
- No alternating/checker shading; all non-given cells are uniform white.
- Page background behind the board: white (the whole game card is white).

---

## 3. Symbols (author original SVGs — flat, rounded, friendly)

Both icons are flat single-color marks, drawn at ~60–65% of cell width
(≈ 36–38px inside a 58px cell), centered, no gradients, no outlines.

### Sun
- Color: warm orange `#FFA500` (**approximation**: original reads as
  `#F8A300`–`#FFB02E`; pick `#FFA600` as default).
- Shape: solid central disc (radius ≈ 38% of icon box) with **8 short, rounded
  rays** evenly spaced at 45° intervals. Rays are stubby rounded-rectangle/petal
  shapes (length ≈ 18% of icon box, width ≈ 14%, fully rounded ends), with a small
  visible gap (≈ 6% of box) between disc edge and ray inner end.
- SVG recipe: 36×36 viewBox; `<circle cx=18 cy=18 r=8 fill="#FFA600"/>` plus 8
  `<rect x=16.2 y=2.5 width=3.6 height=6.5 rx=1.8 fill="#FFA600"/>` rotated
  n×45° about (18,18).

### Moon
- Color: medium blue `#4D8FE0` (**approximation**: original reads as a friendly
  mid-blue, `#478FE0`–`#62A8F5`).
- Shape: solid crescent occupying the same visual weight as the sun. Crescent
  opening (concave side) faces the **upper-right**, like a waning "C" tilted ~30°
  clockwise (**approximation** on exact tilt; the original is clearly a tilted
  crescent, not an upright "C").
- SVG recipe: subtract a circle from a circle —
  outer `r=13` at (18,18); cutout `r=11` centered offset ~(+7,−5);
  via `fill-rule="evenodd"` path or a `<mask>`. Tips of the crescent should be
  rounded by the geometry (the two-circle boolean gives naturally tapered tips).

Accessibility: cells get `aria-label` "Sun", "Moon", or "Empty"; never rely on
color alone (shapes already differ).

---

## 4. Constraint marks (= and ×)

- Rendered as a small badge **centered on the shared edge** between the two
  constrained cells (straddling the grid line; for horizontal pairs it sits on the
  vertical line between them, vice versa for vertical pairs).
- Badge: 16×16px (**approximation** 14–18px), background `#FFFFFF`,
  border-radius 4px (slightly rounded square — **approximation**: a plain white
  square chip with no visible border reads closest; a `1px solid #E0E0E0` border is
  acceptable).
- Symbol: `=` or `×` glyph, drawn as strokes, color `#5F5F5F` (**approximation**
  `#555`–`#737373`), stroke width ~2px at 16px badge size. Use drawn SVG strokes,
  not font glyphs, so the `×` is a perfect 45° cross and the `=` two short
  horizontal bars.
- z-index above grid lines and above cell fills; pointer-events: none.
- Marks are static for the whole game (they are part of the puzzle definition).

---

## 5. Interactions

- **Tap cycle**: tap an editable cell to cycle `empty → sun → moon → empty`.
  (Confirmed: first click sun, second click moon, third click clears.)
- **Givens are locked**: taps on given cells do nothing (optionally a subtle
  150ms "nudge" shake — **approximation**, the original simply ignores the tap).
- **Placement animation**: symbol pops in with a quick scale-in,
  `transform: scale(0.6) → 1.0`, ~120ms ease-out (**approximation**; original has a
  subtle pop, no bounce). Clearing a cell is instant.
- No drag interactions; single taps only. Desktop: left-click cycles the same way;
  keyboard support (arrows + space/enter to cycle) is an accessibility addition,
  not in the original.
- Every cycle step pushes onto the undo stack.

---

## 6. Error UX

- **When**: checking is automatic and effectively immediate — as soon as the board
  state contains a hard rule violation (three-in-a-row, row/column over the limit of
  3 of one symbol, or a contradicted =/× mark), the involved cells are flagged.
  Apply a short debounce of ~500ms after the last tap before showing the marks
  (**approximation**: reviewers describe marks appearing right after a bad placement,
  sometimes lighting up a whole row/column; a small delay prevents flicker while
  cycling sun→moon through a cell).
- **What is flagged**: every cell participating in the violation — e.g. all 3+ cells
  of a three-in-a-row run; all filled cells of a row/column that already has four of
  one symbol; both cells of a violated =/× pair (the constraint badge itself also
  turns red — **approximation**).
- **How**: the cell keeps its symbol and is overlaid with **thin red diagonal
  hatching** — parallel 45° lines, `#EB4D4D` at ~35% opacity, 1.5px lines spaced
  ~7px (**approximation**: guides consistently describe "red marks/striping" across
  offending cells, matching the diagonal-stripe error treatment used across this
  family of puzzles; an alternative reading is a red squiggle under the symbol —
  hatching is the safer default).
- **Message**: no persistent toast in the original; the red marks are the feedback.
  Provide an `aria-live` message for screen readers, e.g.
  "This placement breaks a rule — check the highlighted cells." Marks disappear the
  moment the violation is resolved (undo or re-tap).
- Errors never block input; the player can keep placing symbols while marks show.
- Note: only *rule* violations are flagged, not "differs from the unique solution".
  A rule-consistent but wrong guess shows no error until it creates a contradiction.

---

## 7. Hint UX

Two-stage teaching hint (**approximation** of the original's behavior, which guides
rather than just filling cells):

1. **First press**: the board dims slightly (non-relevant cells overlay
   `rgba(255,255,255,0.6)`) and the cells that justify the next forced deduction are
   highlighted (2px `#0A66C2`-style blue ring — use your own accent, e.g. `#3B82F6`).
   A short explanation appears in the message area below the buttons, e.g.
   "Look at row 3 — it already has three suns." (Write original explanation strings
   per deduction type: three-in-a-row, sandwich, row/column count, = pair, × pair.)
2. **Second press** (or "Show me"): the target cell pulses and the correct symbol is
   placed automatically, then highlights clear.

- Using a hint does not stop the timer; the result is recorded as "solved with
  hints" and reflected in the share text (**approximation**).
- Hint button is disabled while the board has an active error (fix errors first —
  **approximation**; alternatively the first hint can point at the error).

---

## 8. Timer

- Count-up timer, format `m:ss` (no hours; cap display at `59:59`+ keep counting —
  **approximation**).
- Starts when the puzzle becomes visible/playable — i.e. when the player dismisses
  the start screen ("Play") or how-to-play overlay, not on page load.
- Pauses while the how-to-play/settings overlay is open and when the tab is hidden
  (**approximation** — original pauses when you leave the game view).
- Stops permanently at the winning placement; the final time is shown on the win
  screen and used in share text.
- A settings toggle to hide the clock during play is faithful to the original's
  options (**approximation**).

---

## 9. Win flow

On the final correct placement:

1. Errors are impossible at this point (board satisfies all rules); detect
   completion = all 36 cells filled + zero violations (uniqueness guarantees it
   matches the solution).
2. **Board flourish**: brief celebratory animation over the board — symbols do a
   quick staggered pulse/wave left-to-right (~600ms total) (**approximation**;
   the original plays a short confetti/flourish moment).
3. **Completion screen** (modal/card sliding up over the board) showing:
   - A cheerful headline (write several originals and rotate, e.g. "Solved!",
     "Nicely done!", "Smooth moves!").
   - Final time with clock icon, e.g. `1:42`.
   - Puzzle number and date.
   - Streak count, e.g. "3-day streak" (persist in localStorage).
   - **Share** button: copies a spoiler-free emoji/text block, e.g.
     `Tango-style #123 · 1:42 🌞🌚` (original wording, no LinkedIn branding).
   - Secondary: "See puzzle" (close modal, view solved board) and tomorrow's
     puzzle countdown ("Next puzzle in 7:12:09") (**approximation**).
4. Solved board becomes read-only.

---

## 10. How to play (original wording — do not copy LinkedIn's text)

Shown on first visit as an overlay, and any time via the `?` button. Include tiny
illustrative mini-grids next to each rule.

> **Goal**
> Fill every cell of the grid with a sun or a moon.
>
> **Rules**
> 1. Each row and each column must end up with the same number of suns and
>    moons — three of each on a 6×6 board.
> 2. The same symbol can never appear in three touching cells in a line,
>    horizontally or vertically.
> 3. Two cells joined by **=** always hold matching symbols.
> 4. Two cells joined by **×** always hold opposite symbols.
>
> **Tips**
> - Tap a cell to place a sun, tap again for a moon, and once more to clear it.
> - Pre-filled cells are fixed and can't be changed.
> - Every puzzle has exactly one solution and can be cracked with logic alone —
>   if you're guessing, there's a deduction you haven't spotted yet.

Buttons on the overlay: primary "Play" (starts/resumes timer). First-time visitors
see this automatically; returning players go straight to the start screen.

---

## 11. Typical puzzle difficulty stats (**approximation** — for the generator)

Observed across daily puzzles and community archives:

- **Givens (pre-filled cells)**: typically **4–10** of the 36 cells; easy/early
  dailies ran higher (10–14), harder ones as low as 2–4. Default target: **~6**.
  Givens are often placed in loose clusters (corners/edges) rather than scattered
  evenly.
- **Constraint marks**: typically **4–10** total =/× marks, frequently appearing in
  chains (2–4 marks linking a run of adjacent cells). Default target: **~6–8**,
  with a rough mix of both types (× is usually at least as common as =).
- Inverse relationship: fewer givens ⇒ more constraint marks, and vice versa.
- Dailies are tuned to ~1–5 minutes for a practiced player; the puzzle must be
  solvable by forced deductions only (each step provable from the current state) and
  must have a unique solution — validate both in the generator.

---

## Color palette summary (all **approximation**)

| Token            | Value     | Use                              |
|------------------|-----------|----------------------------------|
| `--bg`           | `#FFFFFF` | page, cells, badges, buttons     |
| `--line`         | `#D9D9D9` | grid lines, outer border         |
| `--given-bg`     | `#EDEDED` | locked cell fill                 |
| `--ink`          | `#1A1A1A` | titles                           |
| `--ink-soft`     | `#666666` | timer, secondary text            |
| `--btn-border`   | `#B6B6B6` | pill button border               |
| `--sun`          | `#FFA600` | sun icon                         |
| `--moon`         | `#4D8FE0` | moon icon                        |
| `--constraint`   | `#5F5F5F` | =/× glyph strokes                |
| `--error`        | `#EB4D4D` | error hatching (≈35% opacity)    |
| `--accent`       | `#3B82F6` | hint highlight ring (own accent) |

Typography: system sans stack (`-apple-system, "Segoe UI", Roboto, sans-serif`);
the original uses LinkedIn's corporate sans — do not replicate the brand font.
