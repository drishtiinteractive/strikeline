// packages/client/src/game/GameLoop.ts

export type TickFn = (dt: number, tick: number) => void;

export class GameLoop {
  private rafId: number | null = null;
  private lastTime  = 0;
  private tickCount = 0;

  constructor(private readonly onTick: TickFn) {}

  start(): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.05); // cap at 50ms
      this.lastTime = now;
      this.onTick(dt, this.tickCount++);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
