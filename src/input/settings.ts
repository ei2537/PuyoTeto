import { ACTIONS, type Action } from '../core/types';
export interface PadBinding {
  type: 'button' | 'axis';
  index: number;
  sign?: number;
}
export interface PlayerInput {
  keyboard: Record<Action, string>;
  pad: Record<Action, PadBinding>;
  gamepad: number | null;
}
export interface Settings {
  players: [PlayerInput, PlayerInput];
  das: number;
  arr: number;
  volume: number;
}
export const defaultPad = (): Record<Action, PadBinding> => ({
  left: { type: 'button', index: 14 },
  right: { type: 'button', index: 15 },
  down: { type: 'button', index: 13 },
  rotateLeft: { type: 'button', index: 2 },
  rotateRight: { type: 'button', index: 0 },
  hardDrop: { type: 'button', index: 3 },
  hold: { type: 'button', index: 4 },
});
export const defaults = (): Settings => ({
  players: [
    {
      keyboard: {
        left: 'ArrowLeft',
        right: 'ArrowRight',
        down: 'ArrowDown',
        rotateLeft: 'KeyZ',
        rotateRight: 'ArrowUp',
        hardDrop: 'Space',
        hold: 'KeyC',
      },
      pad: defaultPad(),
      gamepad: null,
    },
    {
      keyboard: {
        left: 'KeyA',
        right: 'KeyD',
        down: 'KeyS',
        rotateLeft: 'KeyQ',
        rotateRight: 'KeyE',
        hardDrop: 'KeyW',
        hold: 'ShiftLeft',
      },
      pad: defaultPad(),
      gamepad: null,
    },
  ],
  das: 140,
  arr: 30,
  volume: 0.35,
});
export function loadSettings(): Settings {
  const s = defaults();
  try {
    const v = JSON.parse(localStorage.getItem('stack-duel.settings.v1') || 'null');
    if (!v) return s;
    for (const i of [0, 1] as const) {
      const p = v.players?.[i];
      for (const a of ACTIONS) {
        if (typeof p?.keyboard?.[a] === 'string' && p.keyboard[a].length < 40)
          s.players[i].keyboard[a] = p.keyboard[a];
        const b = p?.pad?.[a];
        if (
          b &&
          ['button', 'axis'].includes(b.type) &&
          Number.isInteger(b.index) &&
          b.index >= 0 &&
          b.index < 64 &&
          (b.type !== 'axis' || b.sign === 1 || b.sign === -1)
        )
          s.players[i].pad[a] = b;
      }
      // Device indices are session-specific; never restore stale assignments.
    }
    if (Number.isFinite(v.das)) s.das = Math.max(60, Math.min(300, v.das));
    if (Number.isFinite(v.arr)) s.arr = Math.max(0, Math.min(100, v.arr));
    if (Number.isFinite(v.volume)) s.volume = Math.max(0, Math.min(1, v.volume));
  } catch {
    /* Corrupt or blocked storage falls back to defaults. */
  }
  return s;
}
export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem('stack-duel.settings.v1', JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
export const keyLabel = (s: string) =>
  ({
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowDown: '↓',
    ArrowUp: '↑',
    Space: 'SPACE',
    ShiftLeft: 'L SHIFT',
    ShiftRight: 'R SHIFT',
  })[s] || s.replace(/^Key|^Digit/, '');
export const padLabel = (b: PadBinding) =>
  b.type === 'axis' ? `AXIS ${b.index} ${b.sign === -1 ? '−' : '+'}` : `B${b.index}`;
