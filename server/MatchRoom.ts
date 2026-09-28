import { randomInt, randomUUID } from 'node:crypto';
import { Battle } from '../src/core/Battle';
import { gameView } from './snapshot';
import type { FinishReason, InputPacket, MatchSnapshot } from '../shared/protocol';
import type { MatchRecord } from './store';

export class MatchRoom {
  id = randomUUID();
  battle: Battle;
  tick = 0;
  reason: FinishReason | null = null;
  saved = false;
  finalizing = false;
  finishedAt = 0;
  disconnected = new Map<number, number>();
  inputs: [InputPacket['actions'], InputPacket['actions']] = [[], []];
  constructor(
    public record: Omit<MatchRecord, 'id'>,
    public lobbyId: string | null,
    public fixtureId: string | null,
  ) {
    this.battle = new Battle(record.game, randomInt(0x7fffffff));
  }
  get persistence(): MatchRecord {
    return { ...this.record, id: this.id };
  }
  step(dt: number) {
    if (this.finalizing || this.battle.state === 'finished') return;
    this.tick++;
    if (this.disconnected.size) {
      this.inputs = [[], []];
      return;
    }
    for (const player of [0, 1]) {
      const piece = this.battle.games[player].pieces;
      for (const action of this.inputs[player].splice(0)) {
        this.battle.act(player, action);
        if (
          this.battle.games[player].pieces !== piece ||
          this.battle.games[player].phase !== 'falling'
        )
          break;
      }
    }
    this.battle.step(dt);
    this.battle.games.forEach((g) => {
      g.events = [];
    });
  }
  view(): MatchSnapshot {
    return {
      id: this.id,
      tick: this.tick,
      game: this.record.game,
      type: this.record.type,
      state:
        this.disconnected.size && this.battle.state !== 'finished' ? 'paused' : this.battle.state,
      countdown: this.battle.countdown,
      elapsed: this.battle.elapsed,
      players: this.record.players,
      games: this.battle.games.map(gameView) as MatchSnapshot['games'],
      winner: this.battle.winner,
      reason: this.reason,
      saved: this.saved,
      disconnected: [...this.disconnected].map(([player, until]) => ({ player, until })),
    };
  }
}
