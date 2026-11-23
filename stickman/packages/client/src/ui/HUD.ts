// packages/client/src/ui/HUD.ts
import type { MatchState } from '@stickman/shared';

const MAX_HEALTH = 1000;

export class HUD {
  private root: HTMLElement;
  private p1Bar!: HTMLElement;
  private p2Bar!: HTMLElement;
  private timerEl!: HTMLElement;
  private roundEl!: HTMLElement;
  private statusEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.root = container;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <style>
        #hud-inner {
          position: absolute; top: 0; left: 0; right: 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 16px 24px; gap: 12px;
        }
        .health-wrap { flex: 1; }
        .health-label { color: #aaa; font-size: 11px; letter-spacing: 2px; margin-bottom: 4px; }
        .health-track {
          height: 18px; background: #111; border: 1px solid #334;
          border-radius: 2px; overflow: hidden;
        }
        .health-bar {
          height: 100%; width: 100%; background: linear-gradient(90deg, #0f9 0%, #4f4 100%);
          transition: width 0.12s ease-out, background 0.3s;
        }
        .health-bar.low  { background: linear-gradient(90deg, #f80 0%, #fa0 100%); }
        .health-bar.crit { background: linear-gradient(90deg, #f00 0%, #f44 100%); }
        #p2-health-wrap .health-bar { margin-left: auto; }
        .center-panel { text-align: center; min-width: 100px; }
        #round-label { color: #88aaff; font-size: 11px; letter-spacing: 3px; }
        #timer { color: #fff; font-size: 32px; font-weight: bold; line-height: 1; }
        #status-msg {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          color: #fff; font-size: 48px; font-weight: bold; letter-spacing: 8px;
          text-shadow: 0 0 20px #4af; opacity: 0; transition: opacity 0.3s;
          pointer-events: none;
        }
        #status-msg.show { opacity: 1; }
        .stocks { display: flex; gap: 4px; margin-top: 4px; }
        .stock-pip { width: 10px; height: 10px; border-radius: 50%; background: #4af; }
      </style>
      <div id="hud-inner">
        <div class="health-wrap" id="p1-health-wrap">
          <div class="health-label">P1</div>
          <div class="health-track"><div class="health-bar" id="p1-bar"></div></div>
          <div class="stocks" id="p1-stocks"></div>
        </div>
        <div class="center-panel">
          <div id="round-label">ROUND 1</div>
          <div id="timer">99</div>
        </div>
        <div class="health-wrap" id="p2-health-wrap" style="text-align:right">
          <div class="health-label" style="text-align:right">P2</div>
          <div class="health-track"><div class="health-bar" id="p2-bar"></div></div>
          <div class="stocks" id="p2-stocks" style="justify-content:flex-end"></div>
        </div>
      </div>
      <div id="status-msg"></div>
    `;
    this.p1Bar   = document.getElementById('p1-bar')!;
    this.p2Bar   = document.getElementById('p2-bar')!;
    this.timerEl = document.getElementById('timer')!;
    this.roundEl = document.getElementById('round-label')!;
    this.statusEl = document.getElementById('status-msg')!;
  }

  update(state: MatchState, myId: string): void {
    const players = [...state.players.values()];
    const me    = players.find((p) => p.id === myId);
    const opponent = players.find((p) => p.id !== myId);

    this.setBar(this.p1Bar, me?.health ?? MAX_HEALTH);
    this.setBar(this.p2Bar, opponent?.health ?? MAX_HEALTH);
    this.timerEl.textContent = String(Math.ceil(state.timer.timeLeft));
    this.roundEl.textContent = `ROUND ${state.timer.round}`;
  }

  showStatus(msg: string, durationMs = 2000): void {
    this.statusEl.textContent = msg;
    this.statusEl.classList.add('show');
    setTimeout(() => this.statusEl.classList.remove('show'), durationMs);
  }

  private setBar(el: HTMLElement, health: number): void {
    const pct = Math.max(0, (health / MAX_HEALTH) * 100);
    el.style.width = `${pct}%`;
    el.classList.toggle('low',  pct <= 40);
    el.classList.toggle('crit', pct <= 15);
  }
}
