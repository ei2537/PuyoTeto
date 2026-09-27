import { Combatant } from '../../core/combatant';
import { grid } from '../../core/board';
import { Random } from '../../core/random';
import type { Action } from '../../core/types';
import {
  WIDTH,
  HEIGHT,
  HIDDEN,
  TYPES,
  SevenBag,
  cells,
  collides,
  spawn,
  ghost,
  rotate,
  fullRows,
  clearRows,
  detectSpin,
  attackFor,
  type Piece,
  type Tetromino,
} from './TetrisRules';
export class TetrisGame extends Combatant {
  readonly kind = 'tetris' as const;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly hidden = HIDDEN;
  board = grid(WIDTH, HEIGHT);
  active: Piece | null = null;
  next: Tetromino[] = [];
  hold: Tetromino | null = null;
  holdUsed = false;
  phase: 'falling' | 'clear' | 'entry' = 'falling';
  combo = -1;
  b2b = false;
  lines = 0;
  clearing: number[] = [];
  lastRotation = false;
  lastKick = 0;
  lockElapsed = 0;
  lockResets = 0;
  activeTime = 0;
  fallElapsed = 0;
  phaseTime = 0;
  private bag: SevenBag;
  private garbageRng: Random;
  private clearedLast = false;
  constructor(seed = 1) {
    super();
    this.bag = new SevenBag(new Random(seed));
    this.garbageRng = new Random(seed ^ 0xabad1dea);
    this.next = Array.from({ length: 5 }, () => this.bag.next());
    this.spawnNext();
  }
  private spawnNext(type?: Tetromino) {
    if (!type) {
      type = this.next.shift()!;
      this.next.push(this.bag.next());
    }
    this.active = spawn(type);
    this.phase = 'falling';
    this.pieces++;
    this.lockElapsed = 0;
    this.lockResets = 0;
    this.activeTime = 0;
    this.fallElapsed = 0;
    this.lastRotation = false;
    this.lastKick = 0;
    if (collides(this.board, this.active)) this.lost = true;
  }
  act(action: Action): boolean {
    if (this.lost || this.phase !== 'falling' || !this.active) return false;
    const p = this.active;
    const grounded = collides(this.board, { ...p, y: p.y + 1 });
    if (action === 'hold') {
      if (this.holdUsed) return false;
      const old = this.hold;
      this.hold = p.type;
      this.spawnNext(old || undefined);
      this.holdUsed = true;
      this.events.push({ type: 'hold' });
      return true;
    }
    if (action === 'hardDrop') {
      const q = ghost(this.board, p);
      this.score += (q.y - p.y) * 2;
      if (q.y !== p.y) this.lastRotation = false;
      this.active = q;
      this.lock();
      return true;
    }
    if (action === 'rotateLeft' || action === 'rotateRight') {
      const result = rotate(this.board, p, action === 'rotateLeft' ? -1 : 1);
      if (!result) return false;
      this.active = result.piece;
      this.lastRotation = true;
      this.lastKick = result.kick;
      this.events.push({ type: 'rotate' });
    } else {
      const q = {
        ...p,
        x: p.x + (action === 'left' ? -1 : action === 'right' ? 1 : 0),
        y: p.y + (action === 'down' ? 1 : 0),
      };
      if (collides(this.board, q)) return false;
      this.active = q;
      this.lastRotation = false;
      if (action === 'down') {
        this.score++;
        this.fallElapsed = 0;
      } else this.events.push({ type: 'move' });
    }
    if (grounded && this.lockResets < 15 && action !== 'down') {
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
      if (this.phaseTime <= 0) {
        if (this.phase === 'clear') {
          this.board = clearRows(this.board, this.clearing);
          this.clearing = [];
        }
        this.finishTurn();
      }
      return;
    }
    if (!this.active) return;
    this.activeTime += dt;
    this.fallElapsed += dt;
    const gravity = Math.max(100, 850 - Math.floor(this.clock / 45000) * 70);
    while (this.fallElapsed >= gravity) {
      this.fallElapsed -= gravity;
      const q: Piece = { ...this.active!, y: this.active!.y + 1 };
      if (!collides(this.board, q)) {
        this.active = q;
        this.lastRotation = false;
      }
    }
    if (this.active && collides(this.board, { ...this.active, y: this.active.y + 1 })) {
      this.lockElapsed += dt;
      if (this.lockElapsed >= 500 || this.activeTime >= 20000) this.lock();
    }
  }
  private lock() {
    if (!this.active) return;
    const p = this.active,
      occupied = cells(p);
    let spin = detectSpin(this.board, p, this.lastRotation, this.lastKick);
    for (const [x, y] of occupied) this.board[y][x] = TYPES.indexOf(p.type) + 1;
    this.active = null;
    this.events.push({ type: 'lock' });
    this.clearing = fullRows(this.board);
    const n = this.clearing.length;
    if (spin === 'mini' && n >= 2) spin = 'full';
    const after = clearRows(this.board, this.clearing);
    // Complete lock out: a piece locked wholly in the hidden spawn area without clearing.
    if (!n && occupied.every(([, y]) => y < HIDDEN)) {
      this.lost = true;
      return;
    }
    this.clearedLast = n > 0;
    if (n) {
      this.combo++;
      this.lines += n;
      const difficult = n === 4 || spin !== 'none';
      const back = this.b2b && difficult;
      const perfect = after.every((r) => r.every((v) => v === 0));
      this.outgoing += attackFor(n, spin, this.combo, back, perfect);
      const base =
        spin === 'full'
          ? [400, 800, 1200, 1600][n]
          : spin === 'mini'
            ? [100, 200, 400][n]
            : [0, 100, 300, 500, 800][n];
      this.score += Math.floor(base * (back ? 1.5 : 1)) + this.combo * 50 + (perfect ? 3500 : 0);
      this.b2b = difficult;
      this.announce(
        perfect
          ? 'ALL CLEAR'
          : `${back ? 'B2B · ' : ''}${spin !== 'none' ? (spin === 'mini' ? 'MINI T-SPIN' : 'T-SPIN') + ' · ' : ''}${['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][n]}`,
      );
      this.phase = 'clear';
      this.phaseTime = 160;
      this.events.push({ type: 'clear', value: n });
    } else {
      this.combo = -1;
      if (spin !== 'none') {
        this.score += spin === 'mini' ? 100 : 400;
        this.announce(spin === 'mini' ? 'MINI T-SPIN' : 'T-SPIN');
      }
      this.phase = 'entry';
      this.phaseTime = 70;
    }
  }
  private finishTurn() {
    if (!this.clearedLast) this.addGarbage(this.takeGarbage(8));
    if (!this.lost) {
      this.holdUsed = false;
      this.spawnNext();
    }
  }
  addGarbage(amount: number, fixedHole?: number) {
    if (!amount) return;
    let hole = fixedHole ?? this.garbageRng.int(WIDTH);
    for (let i = 0; i < amount; i++) {
      if (this.board[0].some(Boolean)) this.lost = true;
      this.board.shift();
      const row = Array(WIDTH).fill(8);
      row[hole] = 0;
      this.board.push(row);
      if (fixedHole === undefined && this.garbageRng.next() < 0.2)
        hole = this.garbageRng.int(WIDTH);
    }
    this.events.push({ type: 'garbage', value: amount });
  }
  snapshot() {
    return {
      kind: this.kind,
      board: this.board,
      active: this.active,
      next: this.next,
      hold: this.hold,
      holdUsed: this.holdUsed,
      pieces: this.pieces,
    };
  }
}
