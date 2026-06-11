/* Tango — UI layer. State machine, rendering, input, timer, persistence.
 * All puzzle logic lives in js/engine.js (window.TangoEngine). */
(function () {
  'use strict';

  const E = window.TangoEngine;
  const SIZE = 6;
  const CELLS = SIZE * SIZE;

  const STATE_KEY = 'tango.state.v1';
  const NO_KEY = 'tango.puzzleNo';
  const SOLVES_KEY = 'tango.solves';

  const ERROR_DELAY_MS = 500;   // debounce before error marks appear
  const HINT_FILL_MS = 950;     // beat between hint explanation and auto-fill
  const HINT_LINGER_MS = 700;   // how long highlights stay after the fill
  const WIN_DELAY_MS = 600;     // let the last symbol pop before the overlay

  const WIN_LINES = ['Solved!', 'Nicely done!', 'Bright work!', 'Smooth solving!'];

  // ---------- Original symbol artwork (inline SVG) ----------

  const SUN_RAYS = Array.from({ length: 8 }, (_, k) =>
    `<rect x="16.3" y="2.4" width="3.4" height="5.2" rx="1.7" transform="rotate(${k * 45} 18 18)"/>`
  ).join('');

  const SUN_SVG =
    `<svg class="sym" viewBox="0 0 36 36" aria-hidden="true">` +
    `<g fill="#FF9B27" stroke="#D97A10" stroke-width="1.3" stroke-linejoin="round">` +
    `<circle cx="18" cy="18" r="7.6"/>${SUN_RAYS}</g></svg>`;

  // Crescent: outer circle r12.6 at (17.4,18.6) minus circle r11.4 offset to the
  // upper-right; the two-arc path was computed from the circle intersections.
  const MOON_SVG =
    `<svg class="sym" viewBox="0 0 36 36" aria-hidden="true">` +
    `<path d="M15.84 6.10 A12.6 12.6 0 1 0 29.08 23.32 A11.4 11.4 0 0 1 15.84 6.10 Z" ` +
    `fill="#4D6FD3" stroke="#3D59B8" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

  const EQ_SVG =
    `<svg viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke-width="1.6" stroke-linecap="round">` +
    `<path d="M2 3.4h6M2 6.6h6"/></svg>`;

  const X_SVG =
    `<svg viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke-width="1.6" stroke-linecap="round">` +
    `<path d="M2.2 2.2l5.6 5.6M7.8 2.2l-5.6 5.6"/></svg>`;

  // ---------- DOM ----------

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const messageEl = $('message');
  const timerEl = $('timer');
  const puzzleNoEl = $('puzzleNo');
  const undoBtn = $('undoBtn');
  const hintBtn = $('hintBtn');
  const clearBtn = $('clearBtn');
  const howBtn = $('howBtn');
  const rulesOverlay = $('rulesOverlay');
  const rulesCloseBtn = $('rulesCloseBtn');
  const winOverlay = $('winOverlay');
  const winTitle = $('winTitle');
  const winTime = $('winTime');
  const winSolves = $('winSolves');
  const newPuzzleBtn = $('newPuzzleBtn');

  // ---------- State ----------

  const state = {
    puzzle: null,
    board: null,
    undo: [],
    elapsed: 0,
    puzzleNo: 1,
    won: false,
  };

  let cells = [];          // 36 button elements
  let badges = new Map();  // "a:b" -> badge element
  let timerId = null;
  let errTimer = null;
  let hintFillTimer = null;
  let hintLingerTimer = null;
  let hintBusy = false;
  let messageKind = '';    // '', 'error', 'hint'

  // ---------- Persistence ----------

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        puzzle: state.puzzle,
        board: state.board,
        undo: state.undo,
        elapsed: state.elapsed,
        puzzleNo: state.puzzleNo,
      }));
    } catch (e) { /* storage full/unavailable — play on without persistence */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.puzzle || !Array.isArray(s.board) || s.board.length !== CELLS) return null;
      if (!Array.isArray(s.puzzle.givens) || s.puzzle.givens.length !== CELLS) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  // ---------- Timer ----------

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function renderTimer() { timerEl.textContent = fmtTime(state.elapsed); }

  function startTimer() {
    if (timerId !== null || state.won) return;
    timerId = setInterval(() => {
      state.elapsed++;
      renderTimer();
      saveState();
    }, 1000);
  }

  function stopTimer() {
    if (timerId !== null) { clearInterval(timerId); timerId = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else if (!state.won && rulesOverlay.hidden) startTimer();
  });

  // ---------- Rendering ----------

  function symbolFor(v) { return v === 1 ? SUN_SVG : v === 2 ? MOON_SVG : ''; }

  function cellLabel(i, v) {
    const name = v === 1 ? 'sun' : v === 2 ? 'moon' : 'empty';
    const fixed = state.puzzle.givens[i] !== 0 ? ', fixed' : '';
    return `Row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}: ${name}${fixed}`;
  }

  function renderCell(i) {
    cells[i].innerHTML = symbolFor(state.board[i]);
    cells[i].setAttribute('aria-label', cellLabel(i, state.board[i]));
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];
    badges = new Map();

    for (let i = 0; i < CELLS; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell' + (state.puzzle.givens[i] !== 0 ? ' given' : '');
      btn.addEventListener('click', () => onTap(i));
      boardEl.appendChild(btn);
      cells.push(btn);
      renderCell(i);
    }

    for (const cn of state.puzzle.constraints) {
      const horizontal = cn.b === cn.a + 1;
      const r = Math.floor(cn.a / SIZE);
      const c = cn.a % SIZE;
      const el = document.createElement('div');
      el.className = 'badge';
      el.style.setProperty('--gx', horizontal ? c + 1 : c + 0.5);
      el.style.setProperty('--gy', horizontal ? r + 0.5 : r + 1);
      el.innerHTML = cn.type === 'eq' ? EQ_SVG : X_SVG;
      boardEl.appendChild(el);
      badges.set(cn.a + ':' + cn.b, el);
    }
  }

  function setMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = 'message' + (kind ? ' ' + kind : '');
    messageKind = text ? kind : '';
  }

  function updateUndoBtn() {
    undoBtn.disabled = state.undo.length === 0 || state.won;
  }

  // ---------- Error marks ----------

  function clearErrorMarks() {
    for (const cell of cells) cell.classList.remove('error');
    for (const badge of badges.values()) badge.classList.remove('error');
  }

  function showErrors(errors) {
    clearErrorMarks();
    for (const err of errors) {
      for (const c of err.cells) cells[c].classList.add('error');
      if (err.rule === 'eq' || err.rule === 'x') {
        const badge = badges.get(err.cells[0] + ':' + err.cells[1]);
        if (badge) badge.classList.add('error');
      }
    }
    setMessage(errors[0].message, 'error');
  }

  // ---------- Moves ----------

  function applyMove(i, v, pushUndo) {
    const prev = state.board[i];
    if (prev === v) return;
    state.board[i] = v;
    if (pushUndo) state.undo.push({ cell: i, prev });
    renderCell(i);
    updateUndoBtn();
    afterChange();
  }

  function afterChange() {
    clearTimeout(errTimer);
    const res = E.validate(state.board, state.puzzle);
    if (res.errors.length === 0) {
      clearErrorMarks();
      if (messageKind === 'error') setMessage('', '');
    } else {
      errTimer = setTimeout(() => showErrors(res.errors), ERROR_DELAY_MS);
    }
    if (res.won) win();
    else saveState();
  }

  function onTap(i) {
    if (state.won || state.puzzle.givens[i] !== 0) return;
    applyMove(i, (state.board[i] + 1) % 3, true);
  }

  function onUndo() {
    if (state.won) return;
    const m = state.undo.pop();
    if (!m) return;
    state.board[m.cell] = m.prev;
    renderCell(m.cell);
    updateUndoBtn();
    afterChange();
  }

  function onClear() {
    if (state.won) return;
    if (!window.confirm('Clear the board and start this puzzle over?')) return;
    state.board = state.puzzle.givens.slice();
    state.undo = [];
    clearTimeout(errTimer);
    cancelHint();
    clearErrorMarks();
    setMessage('', '');
    for (let i = 0; i < CELLS; i++) renderCell(i);
    updateUndoBtn();
    saveState();
  }

  // ---------- Hint ----------

  function clearHintMarks() {
    for (const cell of cells) cell.classList.remove('hint-involved', 'hint-target');
  }

  function cancelHint() {
    clearTimeout(hintFillTimer);
    clearTimeout(hintLingerTimer);
    hintFillTimer = null;
    hintLingerTimer = null;
    clearHintMarks();
    hintBusy = false;
    hintBtn.disabled = state.won;
  }

  function onHint() {
    if (state.won || hintBusy) return;
    const h = E.hint(state.board, state.puzzle);
    if (!h) return;
    hintBusy = true;
    hintBtn.disabled = true;
    clearHintMarks();
    for (const c of h.involved) cells[c].classList.add('hint-involved');
    cells[h.cell].classList.add('hint-target');
    setMessage(h.reason, 'hint');
    hintFillTimer = setTimeout(() => {
      applyMove(h.cell, h.value, true); // a hint counts as a move for undo
      hintLingerTimer = setTimeout(() => {
        clearHintMarks();
        hintBusy = false;
        hintBtn.disabled = state.won;
      }, HINT_LINGER_MS);
    }, HINT_FILL_MS);
  }

  // ---------- Win ----------

  function win() {
    state.won = true;
    stopTimer();
    clearTimeout(errTimer);
    clearErrorMarks();
    updateUndoBtn();
    hintBtn.disabled = true;
    clearBtn.disabled = true;
    let solves = 1;
    try {
      solves = parseInt(localStorage.getItem(SOLVES_KEY) || '0', 10) + 1;
      localStorage.setItem(SOLVES_KEY, String(solves));
      localStorage.removeItem(STATE_KEY);
    } catch (e) { /* ignore */ }
    winTitle.textContent = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)];
    winTime.textContent = 'Solved in ' + fmtTime(state.elapsed);
    winSolves.textContent = solves === 1
      ? 'Your first solve — welcome to Tango.'
      : solves + ' puzzles solved';
    setMessage('', '');
    setTimeout(() => {
      winOverlay.hidden = false;
      newPuzzleBtn.focus();
    }, WIN_DELAY_MS);
  }

  // ---------- Puzzle lifecycle ----------

  function startPuzzle(puzzle, board, undo, elapsed, puzzleNo) {
    state.puzzle = puzzle;
    state.board = board;
    state.undo = undo;
    state.elapsed = elapsed;
    state.puzzleNo = puzzleNo;
    state.won = false;
    cancelHint();
    clearBtn.disabled = false;
    winOverlay.hidden = true;
    clearTimeout(errTimer);
    puzzleNoEl.textContent = '#' + puzzleNo;
    buildBoard();
    setMessage('', '');
    updateUndoBtn();
    renderTimer();
    saveState();
    if (!document.hidden) startTimer();
  }

  function newPuzzle() {
    stopTimer();
    let no = 1;
    try {
      no = parseInt(localStorage.getItem(NO_KEY) || '0', 10) + 1;
      localStorage.setItem(NO_KEY, String(no));
    } catch (e) { /* ignore */ }
    const puzzle = E.generatePuzzle();
    startPuzzle(puzzle, puzzle.givens.slice(), [], 0, no);
  }

  function init() {
    const saved = loadState();
    if (saved) {
      startPuzzle(saved.puzzle, saved.board, saved.undo || [], saved.elapsed || 0,
        saved.puzzleNo || 1);
      // Re-surface error marks (after the usual beat) on a restored board.
      afterChange();
    } else {
      newPuzzle();
    }
  }

  // ---------- Overlays ----------

  function openRules() {
    rulesOverlay.hidden = false;
    stopTimer();
    rulesCloseBtn.focus();
  }

  function closeRules() {
    rulesOverlay.hidden = true;
    if (!state.won && !document.hidden) startTimer();
    howBtn.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !rulesOverlay.hidden) closeRules();
  });

  // ---------- Wiring ----------

  undoBtn.addEventListener('click', onUndo);
  hintBtn.addEventListener('click', onHint);
  clearBtn.addEventListener('click', onClear);
  howBtn.addEventListener('click', openRules);
  rulesCloseBtn.addEventListener('click', closeRules);
  rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) closeRules(); });
  newPuzzleBtn.addEventListener('click', newPuzzle);

  init();

  // ---------- Debug handle (automated testing only) ----------
  window.__tango = {
    getPuzzle: () => state.puzzle,
    getBoard: () => state.board.slice(),
    setCell: (i, v) => applyMove(i, v, true),
    newPuzzle,
  };
})();
