import type { PadBinding } from './settings';
export function bindingDown(pad: Gamepad | null | undefined, binding: PadBinding): boolean {
  if (!pad) return false;
  return binding.type === 'button'
    ? !!pad.buttons[binding.index]?.pressed
    : (pad.axes[binding.index] || 0) * (binding.sign || 1) > 0.55;
}
export class GamepadManager {
  pads: (Gamepad | null)[] = [];
  onChange = () => {};
  onDisconnect: (index: number) => void = () => {};
  constructor() {
    window.addEventListener('gamepadconnected', () => {
      this.poll();
      this.onChange();
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.poll();
      this.onDisconnect(e.gamepad.index);
      this.onChange();
    });
    this.poll();
  }
  poll() {
    try {
      this.pads = Array.from(navigator.getGamepads?.() || []);
    } catch {
      this.pads = [];
    }
  }
  connected() {
    return this.pads.filter((p): p is Gamepad => !!p?.connected);
  }
  detectBinding(index: number): PadBinding | null {
    const p = this.pads[index];
    if (!p) return null;
    const b = p.buttons.findIndex((b) => b.pressed);
    if (b >= 0) return { type: 'button', index: b };
    const a = p.axes.findIndex((a) => Math.abs(a) > 0.65);
    return a >= 0 ? { type: 'axis', index: a, sign: Math.sign(p.axes[a]) } : null;
  }
}
