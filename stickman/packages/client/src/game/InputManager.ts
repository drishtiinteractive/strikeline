// packages/client/src/game/InputManager.ts
import type { InputPayload } from '@stickman/shared';

const KEY_MAP: Record<string, keyof Pick<InputPayload, 'jump' | 'block'> | 'light' | 'heavy' | 'left' | 'right'> = {
  ArrowLeft:  'left',
  ArrowRight: 'right',
  ArrowUp:    'jump',
  KeyA:       'left',
  KeyD:       'right',
  KeyW:       'jump',
  KeyJ:       'light',
  KeyK:       'heavy',
  ShiftLeft:  'block',
  ShiftRight: 'block',
};

export class InputManager {
  private held = new Set<string>();
  private seq  = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });
  }

  sample(tick: number): InputPayload {
    const pressed = (code: string) => this.held.has(code);

    const moveLeft  = pressed('ArrowLeft')  || pressed('KeyA');
    const moveRight = pressed('ArrowRight') || pressed('KeyD');

    return {
      seq:    this.seq++,
      tick,
      moveX:  moveLeft ? -1 : moveRight ? 1 : 0,
      moveZ:  0,
      jump:   pressed('ArrowUp') || pressed('KeyW'),
      attack: pressed('KeyK') ? 'heavy' : pressed('KeyJ') ? 'light' : 'none',
      block:  pressed('ShiftLeft') || pressed('ShiftRight'),
    };
  }
}
