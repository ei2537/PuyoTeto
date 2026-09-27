import type { GameKind, GameEvent } from '../core/types';
// Original, short synthesis keeps the game self-contained and avoids copyrighted voice clips.
export class AudioManager {
  context: AudioContext | null = null;
  lastMove = 0;
  constructor(public volume: number) {}
  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  play(kind: GameKind, event: GameEvent) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.volume === 0) return;
    if (event.type === 'move' && ctx.currentTime - this.lastMove < 0.06) return;
    if (event.type === 'move') this.lastMove = ctx.currentTime;
    const clear = event.type === 'clear';
    const frequency = clear
      ? kind === 'puyo'
        ? 330 * 2 ** ((Math.min(event.value || 1, 8) - 1) / 6)
        : 660
      : { move: 150, rotate: 240, lock: 90, garbage: 65, hold: 400, clear: 660 }[event.type];
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      duration = clear ? 0.16 : 0.045;
    osc.type = event.type === 'garbage' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      frequency * (clear ? 1.5 : 0.65),
      ctx.currentTime + duration,
    );
    gain.gain.setValueAtTime(this.volume * (clear ? 0.17 : 0.07), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
}
