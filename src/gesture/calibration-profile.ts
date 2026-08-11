import type { ScalarGateThresholds } from './scalar-gate';

export type CalibrationReference = 'open' | 'pinch' | 'fist';

export interface GestureCalibrationProfile {
  readonly pinch: ScalarGateThresholds;
  readonly fist: ScalarGateThresholds;
  readonly medians: {
    readonly openPinch: number;
    readonly pinch: number;
    readonly openFist: number;
    readonly fist: number;
  };
}

export type CalibrationResult =
  | { readonly status: 'ready'; readonly profile: GestureCalibrationProfile }
  | {
      readonly status: 'inconclusive';
      readonly reason:
        'insufficient-samples' | 'pinch-overlap' | 'fist-overlap';
    };

const MINIMUM_SAMPLES = 15;

function median(values: readonly number[]): number | undefined {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) return undefined;
  return sorted.length % 2 === 0
    ? (value + (sorted[middle - 1] ?? value)) / 2
    : value;
}

function thresholds(active: number, released: number): ScalarGateThresholds {
  const range = released - active;
  return {
    activation: active + range * 0.15,
    continuation: active + range * 0.3,
  };
}

export class GestureCalibrationSession {
  private readonly openPinch: number[] = [];
  private readonly pinch: number[] = [];
  private readonly openFist: number[] = [];
  private readonly fist: number[] = [];

  record(
    reference: CalibrationReference,
    metrics: { readonly pinch?: number; readonly fist?: number },
  ): void {
    if (reference === 'open') {
      if (metrics.pinch !== undefined) this.openPinch.push(metrics.pinch);
      if (metrics.fist !== undefined) this.openFist.push(metrics.fist);
    } else if (reference === 'pinch' && metrics.pinch !== undefined) {
      this.pinch.push(metrics.pinch);
    } else if (reference === 'fist' && metrics.fist !== undefined) {
      this.fist.push(metrics.fist);
    }
  }

  result(): CalibrationResult {
    if (
      [this.openPinch, this.pinch, this.openFist, this.fist].some(
        ({ length }) => length < MINIMUM_SAMPLES,
      )
    ) {
      return { status: 'inconclusive', reason: 'insufficient-samples' };
    }
    const openPinch = median(this.openPinch);
    const pinch = median(this.pinch);
    const openFist = median(this.openFist);
    const fist = median(this.fist);
    if (
      openPinch === undefined ||
      pinch === undefined ||
      openFist === undefined ||
      fist === undefined
    ) {
      return { status: 'inconclusive', reason: 'insufficient-samples' };
    }
    if (openPinch - pinch < 0.16) {
      return { status: 'inconclusive', reason: 'pinch-overlap' };
    }
    if (openFist - fist < 0.22) {
      return { status: 'inconclusive', reason: 'fist-overlap' };
    }
    return {
      status: 'ready',
      profile: {
        pinch: thresholds(pinch, openPinch),
        fist: thresholds(fist, openFist),
        medians: { openPinch, pinch, openFist, fist },
      },
    };
  }

  reset(): void {
    this.openPinch.length = 0;
    this.pinch.length = 0;
    this.openFist.length = 0;
    this.fist.length = 0;
  }
}
