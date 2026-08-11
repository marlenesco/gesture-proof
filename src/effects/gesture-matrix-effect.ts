import type { GestureSignal } from '../engine/contracts';
import {
  MATRIX_GESTURES,
  type GestureStateMatrixPayload,
  type MatrixGesture,
} from '../gesture/gesture-state-matrix';

const LABELS: Readonly<Record<MatrixGesture, string>> = {
  pinch: 'PINCH',
  fist: 'FIST',
  'open-palm': 'OPEN',
  point: 'POINT',
  'two-hand-span': 'SPAN',
};

export class GestureMatrixEffect {
  private readonly context: CanvasRenderingContext2D;
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly displayed = new Float32Array(MATRIX_GESTURES.length);
  private width = 1;
  private height = 1;
  private lastTimestampMs = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  render(
    signal: GestureSignal<GestureStateMatrixPayload>,
    timestampMs: number,
  ): void {
    this.resize();
    const deltaMs = Math.min(
      48,
      Math.max(0, timestampMs - this.lastTimestampMs),
    );
    this.lastTimestampMs = timestampMs;
    const interpolation = this.reducedMotion.matches
      ? 1
      : 1 - Math.exp(-deltaMs / 90);
    MATRIX_GESTURES.forEach((gesture, index) => {
      const current = this.displayed[index] ?? 0;
      this.displayed[index] =
        current + (signal.payload.scores[gesture] - current) * interpolation;
    });

    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.drawBands(signal, timestampMs);
    this.drawDecision(signal);
  }

  reset(): void {
    this.displayed.fill(0);
    this.lastTimestampMs = 0;
  }

  private drawBands(
    signal: GestureSignal<GestureStateMatrixPayload>,
    timestampMs: number,
  ): void {
    const context = this.context;
    const compact = this.width < 720;
    const left = compact ? 18 : this.width * 0.3;
    const right = compact ? this.width - 18 : this.width * 0.82;
    const top = compact ? this.height * 0.46 : this.height * 0.16;
    const bottom = compact ? this.height * 0.84 : this.height * 0.88;
    const gap = compact ? 8 : 14;
    const bandWidth = (right - left - gap * 4) / 5;

    MATRIX_GESTURES.forEach((gesture, index) => {
      const score = this.displayed[index] ?? 0;
      const x = left + index * (bandWidth + gap);
      const isGesture = signal.payload.gesture === gesture;
      const isWinner = signal.payload.winner === gesture;
      const active = signal.phase === 'active' && isGesture;
      const height = bottom - top;

      context.save();
      context.fillStyle = 'rgba(244, 238, 229, 0.035)';
      context.fillRect(x, top, bandWidth, height);
      context.fillStyle = active
        ? 'rgba(255, 79, 47, 0.34)'
        : isWinner
          ? 'rgba(255, 79, 47, 0.14)'
          : 'rgba(244, 238, 229, 0.09)';
      context.fillRect(x, bottom - height * score, bandWidth, height * score);

      context.strokeStyle = active ? '#ff4f2f' : 'rgba(244, 238, 229, 0.18)';
      context.lineWidth = active ? 2 : 1;
      context.strokeRect(x, top, bandWidth, height);

      const activationY = bottom - height * 0.78;
      context.setLineDash([3, 6]);
      context.strokeStyle = 'rgba(255, 79, 47, 0.55)';
      context.beginPath();
      context.moveTo(x, activationY);
      context.lineTo(x + bandWidth, activationY);
      context.stroke();
      context.setLineDash([]);

      if (signal.phase === 'candidate' && isGesture) {
        const progress = signal.payload.activationProgress;
        const sweep = this.reducedMotion.matches
          ? progress
          : Math.min(1, progress + Math.sin(timestampMs / 90) * 0.015);
        context.fillStyle = '#ff4f2f';
        context.fillRect(x, top - 5, bandWidth * sweep, 2);
      }
      context.restore();
    });
  }

  private drawDecision(signal: GestureSignal<GestureStateMatrixPayload>): void {
    const gesture = signal.payload.gesture;
    if (!gesture || signal.phase === 'idle' || signal.phase === 'unknown') {
      return;
    }
    const context = this.context;
    const compact = this.width < 720;
    context.save();
    context.textAlign = compact ? 'center' : 'left';
    context.textBaseline = 'middle';
    context.font = `${compact ? 700 : 760} ${compact ? Math.min(56, this.width * 0.16) : Math.min(112, this.width * 0.085)}px system-ui, sans-serif`;
    context.fillStyle =
      signal.phase === 'active'
        ? 'rgba(255, 79, 47, 0.92)'
        : 'rgba(244, 238, 229, 0.26)';
    context.fillText(
      LABELS[gesture],
      compact ? this.width / 2 : this.width * 0.035,
      compact ? this.height * 0.37 : this.height * 0.7,
    );
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
