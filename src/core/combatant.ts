import type { Incoming, GameEvent } from './types';
export class Combatant {
  score = 0;
  lost = false;
  incoming: Incoming[] = [];
  outgoing = 0;
  clock = 0;
  pieces = 0;
  message = '';
  messageTime = 0;
  events: GameEvent[] = [];
  receive(amount: number) {
    if (amount > 0) this.incoming.push({ amount, readyAt: this.clock + 700 });
  }
  cancel(amount: number): number {
    while (amount > 0 && this.incoming.length) {
      const n = Math.min(amount, this.incoming[0].amount);
      amount -= n;
      this.incoming[0].amount -= n;
      if (!this.incoming[0].amount) this.incoming.shift();
    }
    return amount;
  }
  takeGarbage(cap: number): number {
    let result = 0;
    while (this.incoming.length && result < cap && this.incoming[0].readyAt <= this.clock) {
      const n = Math.min(cap - result, this.incoming[0].amount);
      result += n;
      this.incoming[0].amount -= n;
      if (!this.incoming[0].amount) this.incoming.shift();
    }
    return result;
  }
  announce(message: string) {
    this.message = message;
    this.messageTime = 1800;
  }
  tick(dt: number) {
    this.clock += dt;
    this.messageTime = Math.max(0, this.messageTime - dt);
  }
}
