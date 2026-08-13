import { GestureHoldRecognizer } from './gesture-hold';
import type { GestureSignal } from '../engine/contracts';
import type { GestureStateMatrixPayload } from './gesture-state-matrix';

export type { GestureHoldPayload as PointHoldPayload } from './gesture-hold';

export class PointHoldRecognizer {
  private readonly hold: GestureHoldRecognizer;

  constructor(readonly holdDurationMs = 350) {
    this.hold = new GestureHoldRecognizer('point', holdDurationMs);
  }

  update(
    matrix: GestureSignal<GestureStateMatrixPayload>,
    selectionCount: number,
  ) {
    return this.hold.update(matrix, selectionCount > 0);
  }

  reset(timestampMs: number) {
    return this.hold.reset(timestampMs);
  }
}
