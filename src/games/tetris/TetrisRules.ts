import type { Cell, Grid } from '../../core/types';
import { Random } from '../../core/random';
export const WIDTH = 10,
  HEIGHT = 24,
  HIDDEN = 4;
export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;
export type Tetromino = (typeof TYPES)[number];
export interface Piece {
  type: Tetromino;
  x: number;
  y: number;
  r: number;
}
const shapes: Record<Tetromino, Cell[]> = {
  I: [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  J: [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  L: [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  O: [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  T: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
};
export const SHAPES = Object.fromEntries(
  TYPES.map((type) => [
    type,
    Array.from({ length: 4 }, (_, r) =>
      shapes[type].map(([x, y]) => {
        for (let i = 0; i < r && type !== 'O'; i++) [x, y] = [(type === 'I' ? 3 : 2) - y, x];
        return [x, y] as Cell;
      }),
    ),
  ]),
) as Record<Tetromino, Cell[][]>;
export function cells(p: Piece): Cell[] {
  return SHAPES[p.type][p.r].map(([x, y]) => [p.x + x, p.y + y]);
}
export function collides(b: Grid, p: Piece): boolean {
  return cells(p).some(([x, y]) => x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || b[y][x] !== 0);
}
export function spawn(type: Tetromino): Piece {
  return { type, x: 3, y: 2, r: 0 };
}
export function ghost(b: Grid, p: Piece): Piece {
  const q = { ...p };
  while (!collides(b, { ...q, y: q.y + 1 })) q.y++;
  return q;
}
// SRS offsets use +Y upward; convert at the point of use to board coordinates.
const JLSTZ: Record<string, Cell[]> = {
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '1>0': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '1>2': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '2>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '0>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
};
const I: Record<string, Cell[]> = {
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};
export function rotate(b: Grid, p: Piece, dir: number): { piece: Piece; kick: number } | null {
  const r = (p.r + dir + 4) % 4;
  const kicks = p.type === 'O' ? [[0, 0]] : (p.type === 'I' ? I : JLSTZ)[`${p.r}>${r}`];
  for (let i = 0; i < kicks.length; i++) {
    const q = { ...p, r, x: p.x + kicks[i][0], y: p.y - kicks[i][1] };
    if (!collides(b, q)) return { piece: q, kick: i };
  }
  return null;
}
export function fullRows(b: Grid): number[] {
  return b.flatMap((r, y) => (r.every((v) => v !== 0) ? [y] : []));
}
export function clearRows(b: Grid, rows = fullRows(b)): Grid {
  const kept = b.filter((_, y) => !rows.includes(y)).map((r) => [...r]);
  return [...Array.from({ length: rows.length }, () => Array(WIDTH).fill(0)), ...kept];
}
export type Spin = 'none' | 'mini' | 'full';
export function detectSpin(b: Grid, p: Piece, lastRotation: boolean, kick: number): Spin {
  if (p.type !== 'T' || !lastRotation) return 'none';
  const occupied = (x: number, y: number) =>
    x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || b[y][x] !== 0;
  const c = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ].map(([x, y]) => occupied(p.x + x, p.y + y));
  if (c.filter(Boolean).length < 3) return 'none';
  return (c[p.r] && c[(p.r + 1) % 4]) || kick === 4 ? 'full' : 'mini';
}
export function attackFor(
  lines: number,
  spin: Spin,
  combo: number,
  b2b: boolean,
  perfect: boolean,
): number {
  if (!lines) return 0;
  let n =
    spin === 'full'
      ? [0, 2, 4, 6][lines] || 0
      : spin === 'mini'
        ? [0, 1, 2][lines] || 0
        : [0, 0, 1, 2, 4][lines] || 0;
  if (b2b && (lines === 4 || spin !== 'none')) n++;
  n += [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5][Math.min(combo, 11)] || 0;
  return n + (perfect ? 10 : 0);
}
export class SevenBag {
  private bag: Tetromino[] = [];
  constructor(private random: Random) {}
  next(): Tetromino {
    if (!this.bag.length) this.bag = this.random.shuffle([...TYPES]);
    return this.bag.pop()!;
  }
}
