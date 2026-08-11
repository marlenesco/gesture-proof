import type { GestureSignal } from '../engine/contracts';
import { OneEuroFilter } from './one-euro-filter';
import {
  ScalarGestureGate,
  type ScalarGatePayload,
  type ScalarGateThresholds,
} from './scalar-gate';

export type CalibrationPipelineId = 'fixed' | 'filtered' | 'calibrated';

export interface CalibrationPipelineOutput {
  readonly id: CalibrationPipelineId;
  readonly rawValue?: number;
  readonly processedValue?: number;
  readonly signal: GestureSignal<ScalarGatePayload>;
}

export class CalibrationPipeline {
  private readonly filter = new OneEuroFilter();
  private readonly gate: ScalarGestureGate;

  constructor(
    readonly id: CalibrationPipelineId,
    thresholds: ScalarGateThresholds,
    private readonly filterEnabled: boolean,
  ) {
    this.gate = new ScalarGestureGate(`calibration-${id}`, thresholds);
  }

  update(
    rawValue: number | undefined,
    timestampMs: number,
    confidence: number,
  ): CalibrationPipelineOutput {
    const processedValue =
      rawValue === undefined
        ? undefined
        : this.filterEnabled
          ? this.filter.filter(rawValue, timestampMs)
          : rawValue;
    return {
      id: this.id,
      rawValue,
      processedValue,
      signal: this.gate.update(processedValue, timestampMs, confidence),
    };
  }

  setThresholds(thresholds: ScalarGateThresholds): void {
    this.filter.reset();
    this.gate.setThresholds(thresholds);
  }

  reset(): void {
    this.filter.reset();
    this.gate.reset();
  }
}
