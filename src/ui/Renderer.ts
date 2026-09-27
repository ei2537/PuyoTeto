import type { GameView } from '../../shared/protocol';
import { cells, ghost as tGhost, SHAPES, type Tetromino } from '../games/tetris/TetrisRules';
import { pairCells, ghost as pGhost } from '../games/puyo/PuyoRules';
import type { GameKind } from '../core/types';
const BLOCKS = [
  '',
  '#65bed0',
  '#718fdd',
  '#e6a365',
  '#e9cc70',
  '#75bc91',
  '#b396d1',
  '#df7b78',
  '#7b8982',
];
const PUYOS = ['', '#e68279', '#e6c760', '#76bb94', '#77b6da', '#a9b6ad'];
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
export function drawBlock(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  value: number,
  ghost = false,
) {
  c.save();
  const pad = Math.max(1, size * 0.045);
  c.fillStyle = BLOCKS[value];
  round(c, x + pad, y + pad, size - 2 * pad, size - 2 * pad, Math.max(1, size * 0.08));
  if (ghost) {
    c.globalAlpha = 0.6;
    c.lineWidth = 1.3;
    c.strokeStyle = BLOCKS[value];
    c.stroke();
  } else {
    c.fill();
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.22;
    c.fillRect(x + pad + 2, y + pad + 2, size - 2 * pad - 4, Math.max(1, size * 0.07));
    if (value === 8) {
      c.globalAlpha = 0.35;
      c.strokeStyle = '#263e33';
      c.lineWidth = 1.4;
      c.strokeRect(x + size * 0.34, y + size * 0.34, size * 0.32, size * 0.32);
    }
  }
  c.restore();
}
export function drawPuyo(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  value: number,
  ghost = false,
) {
  c.save();
  c.fillStyle = PUYOS[value];
  c.strokeStyle = PUYOS[value];
  c.beginPath();
  c.ellipse(
    x + s * 0.5,
    y + s * 0.55,
    s * 0.44,
    s * (value === 2 ? 0.39 : 0.425),
    0,
    0,
    Math.PI * 2,
  );
  if (ghost) {
    c.globalAlpha = 0.48;
    c.lineWidth = 1.3;
    c.stroke();
    c.restore();
    return;
  }
  c.fill();
  if (value === 5) {
    c.fillStyle = '#53675d';
    round(c, x + s * 0.29, y + s * 0.36, s * 0.42, s * 0.36, s * 0.1);
    c.fill();
    c.fillStyle = '#d1dbd5';
    c.fillRect(x + s * 0.38, y + s * 0.46, s * 0.24, s * 0.07);
  } else {
    for (const dx of [0.36, 0.65]) {
      c.fillStyle = '#fffefa';
      c.beginPath();
      c.ellipse(x + s * dx, y + s * 0.5, s * 0.13, s * 0.18, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#283b30';
      c.beginPath();
      c.ellipse(x + s * (dx + 0.025), y + s * 0.53, s * 0.055, s * 0.08, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#293d32';
    c.lineWidth = Math.max(1, s * 0.025);
    c.beginPath();
    if (value === 1) c.arc(x + s * 0.53, y + s * 0.69, s * 0.07, 0, Math.PI);
    else if (value === 2) {
      c.moveTo(x + s * 0.47, y + s * 0.73);
      c.lineTo(x + s * 0.59, y + s * 0.73);
    } else c.arc(x + s * 0.54, y + s * 0.7, s * 0.045, 0, Math.PI);
    c.stroke();
    c.fillStyle = '#fff';
    c.globalAlpha = 0.25;
    c.beginPath();
    c.ellipse(x + s * 0.3, y + s * 0.25, s * 0.09, s * 0.045, -0.5, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
export function prepareCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return c;
}
export class BoardRenderer {
  width = 240;
  height = 528;
  private observer: ResizeObserver;
  constructor(public canvas: HTMLCanvasElement) {
    this.observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      this.width = box.width;
      this.height = box.height;
    });
    this.observer.observe(canvas);
    this.width = canvas.clientWidth;
    this.height = canvas.clientHeight;
  }
  draw(game: GameView) {
    const w = this.width,
      h = this.height;
    if (w <= 0 || h <= 0) return;
    const c = prepareCanvas(this.canvas, w, h),
      start = game.kind === 'tetris' ? 2 : 1,
      rows = game.height - start,
      s = w / game.width;
    c.fillStyle = '#202925';
    c.fillRect(0, 0, w, h);
    const top = (game.hidden - start) * s;
    c.fillStyle = '#2a322e';
    c.fillRect(0, 0, w, top);
    c.strokeStyle = '#303a34';
    c.lineWidth = 0.7;
    c.beginPath();
    for (let x = 1; x < game.width; x++) {
      c.moveTo(x * s, top);
      c.lineTo(x * s, h);
    }
    for (let y = game.hidden - start; y < rows; y++) {
      c.moveTo(0, y * s);
      c.lineTo(w, y * s);
    }
    c.stroke();
    c.strokeStyle = '#657469';
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(0, top);
    c.lineTo(w, top);
    c.stroke();
    c.setLineDash([]);
    if (game.kind === 'puyo') {
      c.strokeStyle = '#9a6760';
      c.lineWidth = 1.5;
      const x = 2.5 * s,
        y = top + 0.5 * s;
      c.beginPath();
      c.moveTo(x - s * 0.13, y - s * 0.13);
      c.lineTo(x + s * 0.13, y + s * 0.13);
      c.moveTo(x + s * 0.13, y - s * 0.13);
      c.lineTo(x - s * 0.13, y + s * 0.13);
      c.stroke();
    }
    const draw = (x: number, y: number, v: number, isGhost = false) => {
      if (y < start) return;
      const py = (y - start) * s;
      if (game.kind === 'tetris') drawBlock(c, x * s, py, s, v, isGhost);
      else drawPuyo(c, x * s, py, s, v, isGhost);
    };
    // Each compacted column retains its order, so we can interpolate gravity without changing logic.
    if (game.kind === 'puyo' && game.phase === 'settle' && game.fallingFrom) {
      const t = 1 - Math.max(0, game.phaseTime) / 180;
      for (let x = 0; x < 6; x++) {
        const source = game.fallingFrom.flatMap((row, y) => (row[x] ? [{ y, v: row[x] }] : []));
        source.forEach((p, i) =>
          draw(x, p.y + (game.height - source.length + i - p.y) * t * t, p.v),
        );
      }
    } else {
      for (let y = start; y < game.height; y++)
        for (let x = 0; x < game.width; x++)
          if (
            game.board[y][x] &&
            !(
              game.kind === 'puyo' &&
              game.garbageTime > 0 &&
              game.garbageDrops.some((p) => p.x === x && p.y === y)
            )
          ) {
            const clearing =
              game.kind === 'tetris'
                ? game.clearing.includes(y)
                : game.clearing.some(([cx, cy]) => cx === x && cy === y);
            c.globalAlpha = clearing ? 0.35 + 0.55 * Math.abs(Math.sin(game.phaseTime / 65)) : 1;
            draw(x, y, game.board[y][x]);
          }
    }
    c.globalAlpha = 1;
    if (game.kind === 'puyo' && game.garbageTime > 0) {
      const t = 1 - game.garbageTime / 550;
      for (const p of game.garbageDrops) {
        const fall = Math.min(1, t / 0.78);
        const bounce = t < 0.78 ? 0 : Math.sin(((t - 0.78) / 0.22) * Math.PI) * 0.18;
        draw(p.x, p.fromY + (p.y - p.fromY) * fall * fall - bounce, 5);
      }
    }
    if (game.active && !game.lost) {
      if (game.kind === 'tetris') {
        const value = 'IJLOSTZ'.indexOf(game.active.type) + 1;
        for (const [x, y] of cells(tGhost(game.board, game.active))) draw(x, y, value, true);
        for (const [x, y] of cells(game.active)) draw(x, y, value);
      } else {
        for (const [x, y, v] of pairCells(pGhost(game.board, game.active))) draw(x, y, v, true);
        for (const [x, y, v] of pairCells(game.active)) draw(x, y, v);
      }
    }
    if (game.lost) {
      c.fillStyle = '#202925aa';
      c.fillRect(0, 0, w, h);
    }
  }
  destroy() {
    this.observer.disconnect();
  }
}
export function preview(
  canvas: HTMLCanvasElement,
  kind: GameKind,
  pieces: (Tetromino | [number, number])[],
  disabled = false,
) {
  const w = canvas.clientWidth || 76,
    h = canvas.clientHeight || 180,
    c = prepareCanvas(canvas, w, h);
  c.globalAlpha = disabled ? 0.35 : 1;
  const unit =
      kind === 'tetris'
        ? Math.min(w / 4.6, 19, (h - 12) / Math.max(2, pieces.length * 3 - 0.6))
        : Math.min(w / 3, 26, (h - 10) / Math.max(2, pieces.length * 2.6 - 0.6)),
    gap = kind === 'tetris' ? unit * 3 : unit * 2.6;
  pieces.forEach((p, i) => {
    if (typeof p === 'string') {
      const shape = SHAPES[p][0],
        minX = Math.min(...shape.map(([x]) => x)),
        maxX = Math.max(...shape.map(([x]) => x)),
        minY = Math.min(...shape.map(([, y]) => y));
      const left = (w - (maxX - minX + 1) * unit) / 2;
      for (const [x, y] of shape)
        drawBlock(
          c,
          left + (x - minX) * unit,
          8 + i * gap + (y - minY) * unit,
          unit,
          'IJLOSTZ'.indexOf(p) + 1,
        );
    } else {
      drawPuyo(c, w / 2 - unit / 2, 5 + i * gap, unit, p[1]);
      drawPuyo(c, w / 2 - unit / 2, 5 + i * gap + unit, unit, p[0]);
    }
  });
}
export function drawEmblem(canvas: HTMLCanvasElement, kind: GameKind) {
  const w = canvas.clientWidth || 180,
    h = canvas.clientHeight || 120,
    c = prepareCanvas(canvas, w, h),
    s = Math.min(w / 4.5, h / 3);
  if (kind === 'puyo') {
    [
      [0.4, 1.5, 1],
      [1.4, 1.5, 3],
      [2.4, 1.5, 2],
      [1.4, 0.5, 4],
    ].forEach(([x, y, v]) => drawPuyo(c, x * s, y * s, s, v));
  } else {
    [
      [0.2, 1.5, 2],
      [1.2, 1.5, 2],
      [2.2, 1.5, 2],
      [0.2, 0.5, 2],
      [3.2, 1.5, 4],
      [3.2, 0.5, 4],
      [2.2, 0.5, 4],
      [2.2, -0.5, 4],
    ].forEach(([x, y, v]) => drawBlock(c, x * s, (y + 0.4) * s, s, v));
  }
}
