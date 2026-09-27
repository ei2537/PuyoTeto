import type { Action, Difficulty, Grid } from '../../core/types';
import { copyGrid, columnHeights } from '../../core/board';
import { collides, rotate, ghost, pairCells, resolve, groups, type Pair } from './PuyoRules';
import type { PuyoGame } from './PuyoGame';
export type PuyoSnapshot = ReturnType<PuyoGame['snapshot']>;
interface Candidate {
  board: Grid;
  path: Action[];
  value: number;
}
export function evaluatePuyo(b: Grid): number {
  const h = columnHeights(b),
    peak = Math.max(...h);
  let linked = 0;
  for (const g of groups(b)) linked += g.length === 3 ? 10 : g.length === 2 ? 4 : 0;
  const rough = h.slice(1).reduce((n, v, i) => n + Math.abs(v - h[i]), 0);
  return (
    linked -
    h.reduce((a, v) => a + v, 0) * 1.7 -
    peak * peak * 0.35 -
    h[2] * h[2] * 0.6 -
    rough * 0.6 -
    (b[2][2] ? 10000 : 0)
  );
}
export function puyoCandidates(b: Grid, start: Pair): Candidate[] {
  if (collides(b, start)) return [];
  const queue: { p: Pair; path: Action[] }[] = [{ p: start, path: [] }],
    seen = new Set<string>(),
    lands = new Set<string>(),
    out: Candidate[] = [];
  const key = (p: Pair) => `${p.x},${p.y},${p.r}`;
  seen.add(key(start));
  for (let i = 0; i < queue.length; i++) {
    const { p, path } = queue[i],
      land = ghost(b, p),
      lk = key(land);
    if (!lands.has(lk)) {
      lands.add(lk);
      const board = copyGrid(b);
      for (const [x, y, c] of pairCells(land)) board[y][x] = c;
      const resolved = resolve(board),
        height = Math.max(...columnHeights(b));
      out.push({
        board: resolved.board,
        path: [...path, 'hardDrop'],
        value:
          evaluatePuyo(resolved.board) +
          resolved.chain ** 2 * 24 +
          resolved.cleared * (height > 8 ? 6 : 1.2) +
          resolved.score * 0.015,
      });
    }
    for (const a of ['left', 'right', 'rotateRight', 'rotateLeft', 'down'] as Action[]) {
      const q = a.startsWith('rotate')
        ? rotate(b, p, a === 'rotateLeft' ? -1 : 1)
        : {
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
  return out.sort((a, b) => b.value - a.value || a.path.length - b.path.length);
}
function nextBest(b: Grid, colors: [number, number]) {
  let value = -10000;
  for (let r = 0; r < 4; r++)
    for (let x = 0; x < 6; x++) {
      const p = { x, y: 2, r, colors };
      if (collides(b, p)) continue;
      const q = ghost(b, p),
        board = copyGrid(b);
      for (const [x, y, c] of pairCells(q)) board[y][x] = c;
      const z = resolve(board);
      value = Math.max(value, evaluatePuyo(z.board) + z.chain ** 2 * 24 + z.cleared * 1.2);
    }
  return value;
}
export function planPuyo(s: PuyoSnapshot, difficulty: Difficulty): Action[] {
  if (!s.active) return [];
  const candidates = puyoCandidates(s.board, s.active);
  if (difficulty === 'hard') {
    candidates.splice(8);
    for (const c of candidates) c.value += nextBest(c.board, s.next[0]) * 0.7;
    candidates.sort((a, b) => b.value - a.value);
  }
  return (
    candidates[difficulty === 'easy' ? Math.min(s.pieces % 3, candidates.length - 1) : 0]?.path || [
      'hardDrop',
    ]
  );
}
