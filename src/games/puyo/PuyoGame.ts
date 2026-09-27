import { Combatant } from '../../core/combatant';
import { grid } from '../../core/board';
import { Random } from '../../core/random';
import type { Action, Cell, Grid } from '../../core/types';
import {
  WIDTH,
  HEIGHT,
  HIDDEN,
  GARBAGE,
  type Pair,
  pairCells,
  collides,
  rotate,
  ghost,
  gravity,
  findClear,
} from './PuyoRules';
export class PuyoGame extends Combatant {
  readonly kind = 'puyo' as const;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly hidden = HIDDEN;
  board = grid(WIDTH, HEIGHT);
  active: Pair | null = null;
  next: [number, number][] = [];
  phase: 'falling' | 'settle' | 'clear' | 'entry' = 'falling';
  chain = 0;
  bestChain = 0;
  clearing: Cell[] = [];
  fallElapsed = 0;
  lockElapsed = 0;
  lockResets = 0;
  phaseTime = 0;
  activeTime = 0;
  attackRemainder = 0;
  fallingFrom: Grid | null = null;
  private rng: Random;
  private garbageRng: Random;
  private allClearBonus = false;
  constructor(seed = 1) {
    super();
    this.rng = new Random(seed);
    this.garbageRng = new Random(seed ^ 0xabad1dea);
    this.next = Array.from({ length: 3 }, () => this.nextPair());
    this.spawnNext();
  }
  private nextPair(): [number, number] {
    return [this.rng.int(4) + 1, this.rng.int(4) + 1];
  }
  private spawnNext() {
    // Standard danger cell: middle-left column of the first visible row.
    if (this.board[HIDDEN][2]) {
      this.lost = true;
      return;
    }
    this.active = { x: 2, y: HIDDEN, r: 0, colors: this.next.shift()! };
    this.next.push(this.nextPair());
    this.pieces++;
    this.phase = 'falling';
    this.fallElapsed = 0;
    this.lockElapsed = 0;
    this.lockResets = 0;
    this.activeTime = 0;
    if (collides(this.board, this.active)) this.lost = true;
  }
  act(action: Action): boolean {
    if (this.lost || this.phase !== 'falling' || !this.active || action === 'hold') return false;
    const p = this.active,
      grounded = collides(this.board, { ...p, y: p.y + 1 });
    if (action === 'hardDrop') {
      const q = ghost(this.board, p);
      this.score += q.y - p.y;
      this.active = q;
      this.lock();
      return true;
    }
    if (action === 'rotateLeft' || action === 'rotateRight') {
      const q = rotate(this.board, p, action === 'rotateLeft' ? -1 : 1);
      if (!q) return false;
      this.active = q;
      this.events.push({ type: 'rotate' });
    } else {
      const q = {
        ...p,
        x: p.x + (action === 'left' ? -1 : action === 'right' ? 1 : 0),
        y: p.y + (action === 'down' ? 1 : 0),
      };
      if (collides(this.board, q)) return false;
      this.active = q;
      if (action === 'down') {
        this.score++;
        this.fallElapsed = 0;
      } else this.events.push({ type: 'move' });
    }
    if (grounded && this.lockResets < 8 && action !== 'down') {
      this.lockElapsed = 0;
      this.lockResets++;
    }
    return true;
  }
  step(dt: number) {
    if (this.lost) return;
    this.tick(dt);
    if (this.phase !== 'falling') {
      this.phaseTime -= dt;
      if (this.phaseTime > 0) return;
      if (this.phase === 'clear') {
        for (const [x, y] of this.clearing) this.board[y][x] = 0;
        this.clearing = [];
        this.settle();
      } else if (this.phase === 'settle') {
        this.fallingFrom = null;
        this.checkChain();
      } else this.spawnNext();
      return;
    }
    if (!this.active) return;
    this.activeTime += dt;
    this.fallElapsed += dt;
    const interval = Math.max(120, 800 - Math.floor(this.clock / 45000) * 60);
    while (this.fallElapsed >= interval) {
      this.fallElapsed -= interval;
      const q: Pair = { ...this.active!, y: this.active!.y + 1 };
      if (!collides(this.board, q)) this.active = q;
    }
    if (this.active && collides(this.board, { ...this.active, y: this.active.y + 1 })) {
      this.lockElapsed += dt;
      if (this.lockElapsed >= 450 || this.activeTime >= 16000) this.lock();
    }
  }
  private lock() {
    if (!this.active) return;
    for (const [x, y, color] of pairCells(this.active)) this.board[y][x] = color;
    this.active = null;
    this.chain = 0;
    this.events.push({ type: 'lock' });
    this.settle();
  }
  private settle() {
    this.fallingFrom = this.board.map((r) => [...r]);
    const moved = gravity(this.board);
    this.phase = 'settle';
    this.phaseTime = moved ? 180 : 60;
  }
  private checkChain() {
    const clear = findClear(this.board, this.chain + 1);
    if (clear.colored) {
      this.chain++;
      this.bestChain = Math.max(this.bestChain, this.chain);
      this.score += clear.score;
      this.attackRemainder += clear.score;
      let attack = Math.floor(this.attackRemainder / 70);
      this.attackRemainder %= 70;
      if (this.allClearBonus) {
        attack += 30;
        this.allClearBonus = false;
      }
      this.outgoing += attack;
      this.clearing = clear.cells;
      this.phase = 'clear';
      this.phaseTime = 320;
      this.announce(`${this.chain} CHAIN`);
      this.events.push({ type: 'clear', value: this.chain });
    } else {
      if (this.chain && this.board.every((r) => r.every((v) => v === 0))) {
        this.score += 2100;
        this.allClearBonus = true;
        this.announce('ALL CLEAR');
      }
      // Never insert garbage in the middle of a chain. Each link can cancel queued attacks.
      this.addGarbage(this.takeGarbage(30));
      this.phase = 'entry';
      this.phaseTime = 100;
    }
  }
  addGarbage(amount: number) {
    if (!amount) return;
    const columns: number[] = [];
    while (columns.length < amount)
      columns.push(
        ...this.garbageRng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, amount - columns.length),
      );
    for (const x of columns) {
      let y = 0;
      while (y < HEIGHT && !this.board[y][x]) y++;
      if (y === 0) {
        this.lost = true;
        continue;
      }
      this.board[y - 1][x] = GARBAGE;
    }
    this.events.push({ type: 'garbage', value: amount });
  }
  snapshot() {
    return {
      kind: this.kind,
      board: this.board,
      active: this.active,
      next: this.next,
      pieces: this.pieces,
    };
  }
}
