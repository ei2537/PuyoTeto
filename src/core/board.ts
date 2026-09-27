import type { Grid } from './types';
export const grid = (w: number, h: number): Grid =>
  Array.from({ length: h }, () => Array(w).fill(0));
export const copyGrid = (b: Grid): Grid => b.map((r) => [...r]);
export function columnHeights(b: Grid): number[] {
  return b[0].map((_, x) => {
    const y = b.findIndex((r) => r[x] !== 0);
    return y < 0 ? 0 : b.length - y;
  });
}
