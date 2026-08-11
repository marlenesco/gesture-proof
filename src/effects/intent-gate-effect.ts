import type { GestureSignal } from '../engine/contracts';
import type { PinchPayload } from '../gesture/pinch-recognizer';

export class IntentGateEffect {
  private readonly context: CanvasRenderingContext2D;
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  render(
    signal: GestureSignal<PinchPayload> | undefined,
    timestampMs: number,
  ): void {
    this.resize();
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const phase = signal?.phase ?? 'unknown';
    const progress =
      phase === 'active' ? 1 : (signal?.payload.activationProgress ?? 0);
    const pulse = this.reducedMotion.matches
      ? 0
      : Math.sin(timestampMs / 180) * 0.025;
    const radius =
      Math.min(this.width, this.height) *
      (0.105 + progress * 0.16 + pulse * progress);
    const x = this.width * (this.width < 760 ? 0.5 : 0.61);
    const y = this.height * 0.47;
    const accentAlpha =
      phase === 'unknown'
        ? 0.16
        : phase === 'idle'
          ? 0.28
          : 0.55 + progress * 0.4;

    context.save();
    context.translate(x, y);
    context.strokeStyle = `rgba(255, 79, 47, ${accentAlpha})`;
    context.lineWidth = phase === 'active' ? 3 : 1;
    for (let ring = 0; ring < 3; ring += 1) {
      context.globalAlpha = 1 - ring * 0.25;
      context.beginPath();
      context.arc(0, 0, radius + ring * 28, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, radius * 1.45);
    glow.addColorStop(
      0,
      `rgba(255, 79, 47, ${phase === 'active' ? 0.38 : 0.08})`,
    );
    glow.addColorStop(1, 'rgba(255, 79, 47, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    context.fill();

    const gap = Math.PI * (0.22 + progress * 0.72);
    context.strokeStyle = '#f4eee5';
    context.globalAlpha = phase === 'unknown' ? 0.32 : 0.8;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, radius * 0.63, -gap / 2, gap / 2);
    context.stroke();
    context.restore();
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(bounds.width));
    this.height = Math.max(1, Math.round(bounds.height));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.round(this.width * ratio);
    const backingHeight = Math.round(this.height * ratio);
    if (
      this.canvas.width !== backingWidth ||
      this.canvas.height !== backingHeight
    ) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}
