import type { Grid, Cell } from '../../core/types';
import { copyGrid } from '../../core/board';
export const WIDTH = 6,
  HEIGHT = 14,
  HIDDEN = 2,
  GARBAGE = 5;
export interface Pair {
  x: number;
  y: number;
  r: number;
  colors: [number, number];
}
const offsets: Cell[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export function pairCells(p: Pair): [number, number, number][] {
  const [dx, dy] = offsets[p.r];
  return [
    [p.x, p.y, p.colors[0]],
    [p.x + dx, p.y + dy, p.colors[1]],
  ];
}
export function collides(b: Grid, p: Pair) {
  return pairCells(p).some(
    ([x, y]) => x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || b[y][x] !== 0,
  );
}
export function rotate(b: Grid, p: Pair, dir: number): Pair | null {
  const r = (p.r + dir + 4) % 4;
  for (const [dx, dy] of [
    [0, 0],
    [r === 1 ? -1 : r === 3 ? 1 : 0, 0],
    [0, -1],
  ]) {
    const q = { ...p, r, x: p.x + dx, y: p.y + dy };
    if (!collides(b, q)) return q;
  }
  // Quick turn in a one-column well, swapping vertical pivot positions.
  if (
    p.r % 2 === 0 &&
    (p.x === 0 || b[p.y][p.x - 1] !== 0) &&
    (p.x === WIDTH - 1 || b[p.y][p.x + 1] !== 0)
  ) {
    const q = { ...p, r: (p.r + 2) % 4, y: p.y + (p.r === 0 ? -1 : 1) };
    if (!collides(b, q)) return q;
  }
  return null;
}
export function ghost(b: Grid, p: Pair): Pair {
  const q = { ...p };
  while (!collides(b, { ...q, y: q.y + 1 })) q.y++;
  return q;
}
export function gravity(b: Grid): boolean {
  let moved = false;
  for (let x = 0; x < WIDTH; x++) {
    let dest = HEIGHT - 1;
    for (let y = HEIGHT - 1; y >= 0; y--)
      if (b[y][x]) {
        if (dest !== y) {
          b[dest][x] = b[y][x];
          b[y][x] = 0;
          moved = true;
        }
        dest--;
      }
  }
  return moved;
}
export function groups(b: Grid): Cell[][] {
  const seen = new Set<number>(),
    result: Cell[][] = [];
  // Hidden rows hold pieces but do not participate in color matching.
  for (let y = HIDDEN; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      const color = b[y][x],
        key = y * WIDTH + x;
      if (!color || color === GARBAGE || seen.has(key)) continue;
      const group: Cell[] = [[x, y]];
      seen.add(key);
      for (let i = 0; i < group.length; i++) {
        const [cx, cy] = group[i];
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx,
            ny = cy + dy,
            k = ny * WIDTH + nx;
          if (
            nx >= 0 &&
            nx < WIDTH &&
            ny >= HIDDEN &&
            ny < HEIGHT &&
            b[ny][nx] === color &&
            !seen.has(k)
          ) {
            seen.add(k);
            group.push([nx, ny]);
          }
        }
      }
      result.push(group);
    }
  return result;
}
const chainPower = [
  0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512,
];
export function findClear(b: Grid, chain: number) {
  const matched = groups(b).filter((g) => g.length >= 4),
    colorSet = new Set<number>();
  let count = 0,
    groupBonus = 0;
  const remove = new Map<number, Cell>();
  for (const group of matched) {
    count += group.length;
    colorSet.add(b[group[0][1]][group[0][0]]);
    groupBonus += group.length === 4 ? 0 : group.length >= 11 ? 10 : group.length - 3;
    for (const [x, y] of group) {
      remove.set(y * WIDTH + x, [x, y]);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (b[ny]?.[nx] === GARBAGE) remove.set(ny * WIDTH + nx, [nx, ny]);
      }
    }
  }
  const colorBonus = [0, 0, 3, 6, 12, 24][colorSet.size];
  const power = chainPower[Math.min(chain - 1, 18)] || 0;
  const score = count * 10 * Math.max(1, Math.min(999, power + colorBonus + groupBonus));
  return { cells: [...remove.values()], colored: count, score };
}
export function resolve(b: Grid) {
  const board = copyGrid(b);
  gravity(board);
  let chain = 0,
    score = 0,
    cleared = 0;
  while (true) {
    const clear = findClear(board, chain + 1);
    if (!clear.colored) break;
    chain++;
    score += clear.score;
    cleared += clear.colored;
    for (const [x, y] of clear.cells) board[y][x] = 0;
    gravity(board);
  }
  return { board, chain, score, cleared };
}
