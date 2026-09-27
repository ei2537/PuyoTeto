import { ACTIONS, type Action } from '../core/types';
import { KeyboardManager } from './KeyboardManager';
import { GamepadManager, bindingDown } from './GamepadManager';
import type { Settings } from './settings';
export interface RepeatState {
  active: boolean;
  elapsed: number;
  next: number;
}
export function repeatCount(
  state: RepeatState,
  down: boolean,
  dt: number,
  das: number,
  arr: number,
): number {
  if (!down) {
    state.active = false;
    state.elapsed = 0;
    state.next = das;
    return 0;
  }
  if (!state.active) {
    state.active = true;
    state.elapsed = 0;
    state.next = das;
    return 1;
  }
  state.elapsed += dt;
  if (state.elapsed < state.next) return 0;
  if (arr === 0) return 12;
  const n = Math.min(12, Math.floor((state.elapsed - state.next) / arr) + 1);
  state.next += n * arr;
  return n;
}
export class InputManager {
  keyboard = new KeyboardManager();
  gamepads = new GamepadManager();
  states = [new Map<Action, RepeatState>(), new Map<Action, RepeatState>()];
  previous = [new Set<Action>(), new Set<Action>()];
  direction = [0, 0];
  pauseHeld = false;
  constructor(public settings: Settings) {}
  reset() {
    this.keyboard.clear();
    this.states.forEach((m) => m.clear());
    this.previous.forEach((s) => s.clear());
    this.direction = [0, 0];
  }
  actions(player: number, dt: number): Action[] {
    const p = this.settings.players[player];
    const pad = p.gamepad === null ? null : this.gamepads.pads[p.gamepad];
    const down = new Set(
      ACTIONS.filter((a) => this.keyboard.held.has(p.keyboard[a]) || bindingDown(pad, p.pad[a])),
    );
    // Left stick is also usable with the default D-pad bindings.
    if (
      pad &&
      p.pad.left.type === 'button' &&
      p.pad.left.index === 14 &&
      (pad.axes[0] || 0) < -0.55
    )
      down.add('left');
    if (
      pad &&
      p.pad.right.type === 'button' &&
      p.pad.right.index === 15 &&
      (pad.axes[0] || 0) > 0.55
    )
      down.add('right');
    if (pad && p.pad.down.type === 'button' && p.pad.down.index === 13 && (pad.axes[1] || 0) > 0.55)
      down.add('down');
    // Last pressed horizontal direction wins. Release restores the held opposite direction.
    for (const [a, d] of [
      ['left', -1],
      ['right', 1],
    ] as const)
      if (down.has(a) && !this.previous[player].has(a)) this.direction[player] = d;
    const result: Action[] = [];
    for (const a of ACTIONS) {
      const pressed = down.has(a) || this.keyboard.pressed.has(p.keyboard[a]);
      if (a === 'left' || a === 'right' || a === 'down') {
        let active = pressed;
        if (down.has('left') && down.has('right') && a !== 'down')
          active = this.direction[player] === (a === 'left' ? -1 : 1);
        let state = this.states[player].get(a);
        if (!state) this.states[player].set(a, (state = { active: false, elapsed: 0, next: 0 }));
        const n = repeatCount(
          state,
          active,
          dt,
          a === 'down' ? 25 : this.settings.das,
          a === 'down' ? 25 : this.settings.arr,
        );
        for (let i = 0; i < n; i++) result.push(a);
      } else if (pressed && !this.previous[player].has(a)) result.push(a);
    }
    this.previous[player] = down;
    return result;
  }
  pausePressed() {
    const down = this.gamepads.connected().some((p) => p.buttons[9]?.pressed);
    const triggered = this.keyboard.pressed.has('Escape') || (down && !this.pauseHeld);
    this.pauseHeld = down;
    return triggered;
  }
  endFrame() {
    this.keyboard.pressed.clear();
  }
}
