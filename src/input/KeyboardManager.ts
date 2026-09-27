export class KeyboardManager {
  held = new Set<string>();
  pressed = new Set<string>();
  enabled = false;
  capture: ((code: string) => void) | null = null;
  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        if (!e.repeat) this.capture(e.code);
        return;
      }
      if (this.enabled && !['Tab', 'F5', 'F11', 'F12'].includes(e.code) && !e.ctrlKey && !e.metaKey)
        e.preventDefault();
      if (!e.repeat && !this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.clear());
  }
  clear() {
    this.held.clear();
    this.pressed.clear();
  }
}
