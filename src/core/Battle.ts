import { PuyoGame } from '../games/puyo/PuyoGame';
import { TetrisGame } from '../games/tetris/TetrisGame';
import type { Action, GameKind } from './types';
export type Game = PuyoGame | TetrisGame;
export class Battle {
  games: [Game, Game];
  elapsed = 0;
  countdown = 2400;
  state: 'countdown' | 'playing' | 'paused' | 'finished' = 'countdown';
  winner: number | null = null;
  resumeState: 'countdown' | 'playing' = 'playing';
  constructor(
    public kind: GameKind,
    public seed = Math.floor(Math.random() * 0x7fffffff),
  ) {
    const create = () => (kind === 'puyo' ? new PuyoGame(seed) : new TetrisGame(seed));
    this.games = [create(), create()];
  }
  act(player: number, action: Action) {
    return this.state === 'playing' && this.games[player].act(action);
  }
  step(dt: number) {
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.state = 'playing';
      return;
    }
    if (this.state !== 'playing') return;
    this.elapsed += dt;
    this.games.forEach((g) => g.step(dt));
    this.flushAttacks();
    const lost = this.games.map((g) => g.lost);
    if (lost.some(Boolean)) {
      this.winner = lost[0] && lost[1] ? null : lost[0] ? 1 : 0;
      this.state = 'finished';
    }
  }
  flushAttacks() {
    const [a, b] = this.games;
    let left = a.cancel(a.outgoing),
      right = b.cancel(b.outgoing);
    a.outgoing = 0;
    b.outgoing = 0;
    const mutual = Math.min(left, right);
    left -= mutual;
    right -= mutual;
    a.receive(right);
    b.receive(left);
  }
  pause() {
    if (this.state === 'playing' || this.state === 'countdown') {
      this.resumeState = this.state;
      this.state = 'paused';
    }
  }
  resume() {
    if (this.state === 'paused') this.state = this.resumeState;
  }
}
