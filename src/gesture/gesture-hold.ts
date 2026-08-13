import type { GestureSignal } from '../engine/contracts';
import type {
  GestureStateMatrixPayload,
  MatrixGesture,
} from './gesture-state-matrix';

export interface GestureHoldPayload {
  readonly progress: number;
  readonly armed: boolean;
}

export class GestureHoldRecognizer {
  private startedAtMs: number | undefined;
  private fired = false;

  constructor(
    private readonly gesture: Extract<MatrixGesture, 'point' | 'open-palm'>,
    readonly holdDurationMs = 350,
  ) {}

  update(
    matrix: GestureSignal<GestureStateMatrixPayload>,
    enabled: boolean,
  ): GestureSignal<GestureHoldPayload> {
    const eligible =
      enabled &&
      matrix.phase === 'active' &&
      matrix.payload.gesture === this.gesture;
    if (!eligible) {
      this.startedAtMs = undefined;
      this.fired = false;
      return this.signal(matrix.timestampMs, 0, false);
    }
    if (this.startedAtMs === undefined) this.startedAtMs = matrix.timestampMs;
    const progress = Math.min(
      1,
      Math.max(
        0,
        (matrix.timestampMs - this.startedAtMs) / this.holdDurationMs,
      ),
    );
    const armed = progress >= 1 && !this.fired;
    if (armed) this.fired = true;
    return this.signal(matrix.timestampMs, progress, armed);
  }

  reset(timestampMs: number): GestureSignal<GestureHoldPayload> {
    this.startedAtMs = undefined;
    this.fired = false;
    return this.signal(timestampMs, 0, false);
  }

  private signal(
    timestampMs: number,
    progress: number,
    armed: boolean,
  ): GestureSignal<GestureHoldPayload> {
    return {
      id: `${this.gesture}-hold`,
      phase: progress > 0 && progress < 1 ? 'candidate' : 'unknown',
      confidence: progress,
      timestampMs,
      payload: { progress, armed },
    };
  }
}
