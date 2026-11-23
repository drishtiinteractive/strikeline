// packages/server/src/utils/TickClock.ts

/**
 * Fixed-rate tick clock.
 * Calls `onTick(dtMs)` as close to `targetHz` as possible using
 * setInterval, with carry-over delta for missed ticks.
 */
export class TickClock {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;

  constructor(
    private readonly targetHz: number,
    private readonly onTick: (dtMs: number) => void,
  ) {}

  start(): void {
    this.lastTime = Date.now();
    const intervalMs = 1000 / this.targetHz;

    this.interval = setInterval(() => {
      const now = Date.now();
      const dtMs = now - this.lastTime;
      this.lastTime = now;
      this.onTick(dtMs);
    }, intervalMs);
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
