import type { CalibrationPipelineOutput } from '../gesture/calibration-comparison';

export type BenchGesture = 'pinch' | 'fist';

const LANE_IDS = ['fixed', 'filtered', 'calibrated'] as const;
const HISTORY_SIZE = 180;

interface LaneHistory {
  readonly values: Float32Array;
  cursor: number;
  count: number;
}

export class CalibrationTraceEffect {
  private readonly context: CanvasRenderingContext2D;
  private readonly reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly histories = new Map<string, LaneHistory>();
  private lastTimestampMs = -1;
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
    LANE_IDS.forEach((id) => {
      this.histories.set(id, {
        values: new Float32Array(HISTORY_SIZE).fill(Number.NaN),
        cursor: 0,
        count: 0,
      });
    });
  }

  render(
    outputs: readonly CalibrationPipelineOutput[],
    timestampMs: number,
    gesture: BenchGesture,
  ): void {
    this.resize();
    const sampleTimestampMs = outputs[0]?.signal.timestampMs ?? timestampMs;
    if (sampleTimestampMs !== this.lastTimestampMs) {
      this.lastTimestampMs = sampleTimestampMs;
      outputs.forEach((output) => this.record(output));
    }
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const left = this.width < 760 ? 18 : this.width * 0.24;
    const right = this.width < 760 ? this.width - 18 : this.width * 0.69;
    const top = this.width < 760 ? this.height * 0.48 : this.height * 0.22;
    const spacing = this.width < 760 ? this.height * 0.13 : this.height * 0.2;
    outputs.forEach((output, index) => {
      const centerY = top + spacing * index;
      this.drawLane(output, centerY, left, right, spacing * 0.68, gesture);
    });
  }

  reset(): void {
    this.lastTimestampMs = -1;
    this.histories.forEach((history) => {
      history.values.fill(Number.NaN);
      history.cursor = 0;
      history.count = 0;
    });
  }

  private record(output: CalibrationPipelineOutput): void {
    const history = this.histories.get(output.id);
    if (!history) return;
    history.values[history.cursor] = output.processedValue ?? Number.NaN;
    history.cursor = (history.cursor + 1) % HISTORY_SIZE;
    history.count = Math.min(HISTORY_SIZE, history.count + 1);
  }

  private drawLane(
    output: CalibrationPipelineOutput,
    centerY: number,
    left: number,
    right: number,
    height: number,
    gesture: BenchGesture,
  ): void {
    const context = this.context;
    const history = this.histories.get(output.id);
    if (!history) return;
    const maximum = gesture === 'pinch' ? 1 : 1;
    const mapY = (value: number): number =>
      centerY +
      height / 2 -
      (Math.min(maximum, Math.max(0, value)) / maximum) * height;
    context.save();
    context.strokeStyle = 'rgba(244, 238, 229, 0.14)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(left, centerY + height / 2);
    context.lineTo(right, centerY + height / 2);
    context.moveTo(left, centerY - height / 2);
    context.lineTo(right, centerY - height / 2);
    context.stroke();

    const threshold = output.signal.payload.thresholds.activation;
    context.setLineDash([4, 7]);
    context.strokeStyle = 'rgba(255, 79, 47, 0.62)';
    context.beginPath();
    context.moveTo(left, mapY(threshold));
    context.lineTo(right, mapY(threshold));
    context.stroke();
    context.setLineDash([]);

    context.strokeStyle =
      output.signal.phase === 'active'
        ? '#ff4f2f'
        : 'rgba(244, 238, 229, 0.76)';
    context.lineWidth = output.signal.phase === 'active' ? 2.5 : 1.35;
    context.beginPath();
    let drawing = false;
    for (let index = 0; index < history.count; index += 1) {
      const historyIndex =
        (history.cursor - history.count + index + HISTORY_SIZE) % HISTORY_SIZE;
      const value = history.values[historyIndex];
      if (value === undefined || !Number.isFinite(value)) {
        drawing = false;
        continue;
      }
      const x = left + (index / Math.max(1, HISTORY_SIZE - 1)) * (right - left);
      const y = mapY(value);
      if (!drawing) context.moveTo(x, y);
      else context.lineTo(x, y);
      drawing = true;
    }
    context.stroke();

    if (output.signal.phase === 'active') {
      context.fillStyle = 'rgba(255, 79, 47, 0.12)';
      const pulse = this.reducedMotion.matches
        ? 0
        : Math.sin(this.lastTimestampMs / 160) * 4;
      context.fillRect(
        left,
        centerY - height / 2 - pulse / 2,
        right - left,
        height + pulse,
      );
    }
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
