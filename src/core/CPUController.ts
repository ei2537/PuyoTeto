import type { Game } from './Battle';
import type { Action, Difficulty } from './types';
import { planTetris } from '../games/tetris/TetrisCPU';
import { planPuyo } from '../games/puyo/PuyoCPU';
export class CPUController {
  worker: Worker | null = null;
  plan: Action[] = [];
  piece = -1;
  requestId = 0;
  pending = false;
  elapsed = 0;
  wait = 0;
  constructor(public difficulty: Difficulty) {
    try {
      this.worker = new Worker(new URL('./cpu.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        if (e.data.id === this.requestId) {
          this.plan = e.data.actions;
          this.pending = false;
        }
      };
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        this.pending = false;
        this.piece = -1;
      };
    } catch {
      this.worker = null;
    }
  }
  step(game: Game, dt: number) {
    if (game.lost || game.phase !== 'falling') return;
    if (this.piece !== game.pieces) {
      this.piece = game.pieces;
      this.plan = [];
      this.pending = true;
      this.requestId++;
      this.elapsed = 0;
      this.wait = { easy: 750, normal: 330, hard: 100 }[this.difficulty];
      const s = game.snapshot();
      if (this.worker)
        this.worker.postMessage({ id: this.requestId, snapshot: s, difficulty: this.difficulty });
      else {
        this.plan =
          s.kind === 'tetris' ? planTetris(s, this.difficulty) : planPuyo(s, this.difficulty);
        this.pending = false;
      }
    }
    this.elapsed += dt;
    if (this.pending || this.elapsed < this.wait || !this.plan.length) return;
    this.elapsed = 0;
    this.wait = { easy: 100, normal: 55, hard: 28 }[this.difficulty];
    const action = this.plan.shift()!;
    const success = game.act(action);
    if (action === 'hold' && success) this.piece = game.pieces;
    if (!success) this.piece = -1;
  }
  destroy() {
    this.worker?.terminate();
  }
}
