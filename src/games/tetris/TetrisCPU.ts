import type { Action, Difficulty, Grid } from '../../core/types';
import { copyGrid, columnHeights } from '../../core/board';
import {
  cells,
  collides,
  rotate,
  ghost,
  clearRows,
  fullRows,
  spawn,
  type Piece,
  type Tetromino,
} from './TetrisRules';
import type { TetrisGame } from './TetrisGame';
export type TetrisSnapshot = ReturnType<TetrisGame['snapshot']>;
interface Candidate {
  board: Grid;
  path: Action[];
  value: number;
  lines: number;
}
export function evaluateTetris(b: Grid): number {
  const heights = columnHeights(b);
  let holes = 0,
    covered = 0;
  for (let x = 0; x < 10; x++) {
    let above = 0;
    for (let y = 0; y < 24; y++) {
      if (b[y][x]) above++;
      else if (above) {
        holes++;
        covered += above;
      }
    }
  }
  const rough = heights.slice(1).reduce((n, h, i) => n + Math.abs(h - heights[i]), 0);
  return (
    -heights.reduce((n, h) => n + h, 0) * 0.52 -
    holes * 8.5 -
    covered * 0.35 -
    rough * 0.35 -
    Math.max(...heights) ** 2 * 0.08
  );
}
function placement(b: Grid, p: Piece, path: Action[]): Candidate {
  const board = copyGrid(b);
  for (const [x, y] of cells(p)) board[y][x] = 1;
  const lines = fullRows(board).length,
    result = clearRows(board);
  const lockout = cells(p).every(([, y]) => y < 4);
  return {
    board: result,
    path: [...path, 'hardDrop'],
    lines,
    value: evaluateTetris(result) + [0, 1.5, 4, 7, 13][lines] - (lockout ? 10000 : 0),
  };
}
// Explore legal moves, including slides and rotations under overhangs; never teleport the CPU.
export function tetrisCandidates(b: Grid, start: Piece): Candidate[] {
  if (collides(b, start)) return [];
  const queue: { p: Piece; path: Action[] }[] = [{ p: start, path: [] }],
    seen = new Set<string>(),
    landings = new Set<string>(),
    candidates: Candidate[] = [];
  const key = (p: Piece) => `${p.x},${p.y},${p.r}`;
  seen.add(key(start));
  for (let i = 0; i < queue.length; i++) {
    const { p, path } = queue[i],
      land = ghost(b, p),
      lk = cells(land)
        .map((c) => c.join(','))
        .sort()
        .join(';');
    if (!landings.has(lk)) {
      landings.add(lk);
      candidates.push(placement(b, land, path));
    }
    for (const a of ['left', 'right', 'rotateRight', 'rotateLeft', 'down'] as Action[]) {
      let q: Piece | null;
      if (a.startsWith('rotate')) q = rotate(b, p, a === 'rotateLeft' ? -1 : 1)?.piece || null;
      else
        q = {
          ...p,
          x: p.x + (a === 'left' ? -1 : a === 'right' ? 1 : 0),
          y: p.y + (a === 'down' ? 1 : 0),
        };
      if (q && !collides(b, q) && !seen.has(key(q))) {
        seen.add(key(q));
        queue.push({ p: q, path: [...path, a] });
      }
    }
  }
  return candidates.sort((a, b) => b.value - a.value || a.path.length - b.path.length);
}
function nextBest(b: Grid, type: Tetromino) {
  let best = -10000;
  for (let r = 0; r < 4; r++)
    for (let x = -2; x < 10; x++) {
      const p = { ...spawn(type), r, x };
      if (collides(b, p)) continue;
      best = Math.max(best, placement(b, ghost(b, p), []).value);
    }
  return best;
}
export function planTetris(s: TetrisSnapshot, difficulty: Difficulty): Action[] {
  if (!s.active) return [];
  const choices = tetrisCandidates(s.board, s.active).map((c) => ({ ...c, next: s.next[0] }));
  if (difficulty !== 'easy' && !s.holdUsed) {
    const held = s.hold || s.next[0];
    choices.push(
      ...tetrisCandidates(s.board, spawn(held))
        .slice(0, 8)
        .map((c) => ({
          ...c,
          path: ['hold', ...c.path] as Action[],
          next: s.hold ? s.next[0] : s.next[1],
          value: c.value - 0.15,
        })),
    );
  }
  choices.sort((a, b) => b.value - a.value);
  if (difficulty === 'hard') {
    for (const c of choices.slice(0, 8)) c.value += nextBest(c.board, c.next) * 0.65;
    // Restrict lookahead ranking to evaluated candidates.
    choices.splice(8);
    choices.sort((a, b) => b.value - a.value);
  }
  return (
    choices[difficulty === 'easy' ? Math.min(s.pieces % 3, choices.length - 1) : 0]?.path || [
      'hardDrop',
    ]
  );
}
