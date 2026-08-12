import { describe, expect, it } from 'vitest';

import {
  calibrationFixtureAt,
  shapeFist,
} from '../engine/calibration-fixtures';
import type { HandObservation } from '../engine/contracts';
import { fixtureFrameAt } from '../engine/fixtures';
import { palmScale } from '../engine/geometry';
import { pinchRatio } from './pinch-recognizer';
import { CalibrationPipeline } from './calibration-comparison';
import { GestureCalibrationSession } from './calibration-profile';
import { OneEuroFilter } from './one-euro-filter';
import { fistOpenness } from './pose-metrics';
import { ScalarGestureGate } from './scalar-gate';

describe('calibration metrics', () => {
  function palmAxisProjection(
    hand: HandObservation,
    mcpIndex: number,
    pointIndex: number,
  ): number {
    const wrist = hand.landmarks[0]!;
    const mcp = hand.landmarks[mcpIndex]!;
    const point = hand.landmarks[pointIndex]!;
    const length = Math.hypot(wrist.x - mcp.x, wrist.y - mcp.y);
    return (
      ((point.x - mcp.x) * (wrist.x - mcp.x) +
        (point.y - mcp.y) * (wrist.y - mcp.y)) /
      length
    );
  }

  it('separates an open hand from a deterministic fist', () => {
    const open = fixtureFrameAt('stable', 0).observations[0];
    expect(open).toBeDefined();
    if (!open) return;
    const fist = shapeFist(open, 1, 0);

    expect(fistOpenness(open)).toBeGreaterThan(0.75);
    expect(fistOpenness(fist)).toBeLessThan(0.25);
    expect(pinchRatio(fist)).toBeGreaterThan(0.52);
    expect(pinchRatio(shapeFist(open, 0.7, 0))).toBeGreaterThan(0.52);
  });

  it('curls each fist fixture finger toward the palm without a tip reversal', () => {
    const open = fixtureFrameAt('stable', 0).observations[0];
    expect(open).toBeDefined();
    if (!open) return;
    const fist = shapeFist(open, 1, 0);
    const scale = palmScale(fist.landmarks);
    expect(scale).toBeDefined();
    if (!scale) return;

    for (const [mcpIndex, pipIndex, dipIndex, tipIndex] of [
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 16],
      [17, 18, 19, 20],
    ] as const) {
      const pip = palmAxisProjection(fist, mcpIndex, pipIndex) / scale;
      const dip = palmAxisProjection(fist, mcpIndex, dipIndex) / scale;
      const tip = palmAxisProjection(fist, mcpIndex, tipIndex) / scale;

      expect(pip).toBeLessThan(dip);
      expect(dip).toBeLessThan(tip);
    }
  });

  it('keeps openness invariant under mirroring and scale changes', () => {
    const right = calibrationFixtureAt('standard-range', 0).frame
      .observations[0];
    const left = calibrationFixtureAt('left-mirrored', 0).frame.observations[0];
    expect(right).toBeDefined();
    expect(left).toBeDefined();
    if (!right || !left) return;

    expect(fistOpenness(left)).toBeCloseTo(fistOpenness(right) ?? 0, 5);
  });
});

describe('timestamp-aware filtering and gate', () => {
  it('reduces stationary jitter without freezing a deliberate change', () => {
    const filter = new OneEuroFilter();
    const raw = [0.5, 0.58, 0.43, 0.56, 0.45, 0.55, 0.2, 0.2, 0.2];
    const filtered = raw.map((value, index) =>
      filter.filter(value, index * 40),
    );
    const variation = (values: readonly number[]): number =>
      values
        .slice(1)
        .reduce(
          (total, value, index) =>
            total + Math.abs(value - (values[index] ?? value)),
          0,
        );

    expect(variation(filtered.slice(0, 6))).toBeLessThan(
      variation(raw.slice(0, 6)),
    );
    expect(filtered.at(-1)).toBeLessThan(0.4);
  });

  it('activates from elapsed time and preserves a bounded dropout', () => {
    const gate = new ScalarGestureGate('test', {
      activation: 0.34,
      continuation: 0.46,
    });
    gate.update(0.8, 0, 1);
    expect(gate.update(0.2, 20, 1).phase).toBe('candidate');
    expect(gate.update(0.2, 60, 1).phase).toBe('candidate');
    expect(gate.update(0.2, 100, 1).phase).toBe('candidate');
    expect(gate.update(0.2, 140, 1).phase).toBe('active');
    expect(gate.update(undefined, 200, 0).phase).toBe('active');
    expect(gate.update(undefined, 260, 0).phase).toBe('unknown');
  });
});

describe('calibration profile', () => {
  it('derives thresholds from separated medians', () => {
    const calibration = new GestureCalibrationSession();
    for (let index = 0; index < 20; index += 1) {
      calibration.record('open', { pinch: 0.86, fist: 0.9 });
      calibration.record('pinch', { pinch: 0.4 });
      calibration.record('fist', { fist: 0.4 });
    }
    const result = calibration.result();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.profile.pinch.activation).toBeCloseTo(0.469, 3);
    expect(result.profile.fist.activation).toBeCloseTo(0.475, 3);
  });

  it('returns inconclusive for insufficient or overlapping references', () => {
    const insufficient = new GestureCalibrationSession();
    expect(insufficient.result()).toEqual({
      status: 'inconclusive',
      reason: 'insufficient-samples',
    });
    const overlap = new GestureCalibrationSession();
    for (let index = 0; index < 20; index += 1) {
      overlap.record('open', { pinch: 0.5, fist: 0.6 });
      overlap.record('pinch', { pinch: 0.4 });
      overlap.record('fist', { fist: 0.2 });
    }
    expect(overlap.result()).toEqual({
      status: 'inconclusive',
      reason: 'pinch-overlap',
    });
  });
});

describe('personal-range fixture', () => {
  it('lets calibrated lanes recover deliberate poses missed by fixed thresholds', () => {
    const calibration = new GestureCalibrationSession();
    for (let timestampMs = 0; timestampMs < 2100; timestampMs += 20) {
      const state = calibrationFixtureAt('personal-range', timestampMs);
      const hand = state.frame.observations[0];
      if (!hand || !state.reference) continue;
      calibration.record(state.reference, {
        pinch: pinchRatio(hand),
        fist: fistOpenness(hand),
      });
    }
    const result = calibration.result();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const fixedPinch = new CalibrationPipeline(
      'fixed',
      { activation: 0.34, continuation: 0.46 },
      false,
    );
    const calibratedPinch = new CalibrationPipeline(
      'calibrated',
      result.profile.pinch,
      true,
    );
    const fixedFist = new CalibrationPipeline(
      'fixed',
      { activation: 0.32, continuation: 0.45 },
      false,
    );
    const calibratedFist = new CalibrationPipeline(
      'calibrated',
      result.profile.fist,
      true,
    );
    let fixedPinchActive = false;
    let calibratedPinchActive = false;
    let fixedFistActive = false;
    let calibratedFistActive = false;

    for (let timestampMs = 2400; timestampMs <= 5800; timestampMs += 20) {
      const state = calibrationFixtureAt('personal-range', timestampMs);
      const hand = state.frame.observations[0];
      const pinch = hand ? pinchRatio(hand) : undefined;
      const fist = hand ? fistOpenness(hand) : undefined;
      const confidence = hand?.confidence ?? 0;
      fixedPinchActive ||=
        fixedPinch.update(pinch, timestampMs, confidence).signal.phase ===
        'active';
      calibratedPinchActive ||=
        calibratedPinch.update(pinch, timestampMs, confidence).signal.phase ===
        'active';
      fixedFistActive ||=
        fixedFist.update(fist, timestampMs, confidence).signal.phase ===
        'active';
      calibratedFistActive ||=
        calibratedFist.update(fist, timestampMs, confidence).signal.phase ===
        'active';
    }

    expect(fixedPinchActive).toBe(false);
    expect(calibratedPinchActive).toBe(true);
    expect(fixedFistActive).toBe(false);
    expect(calibratedFistActive).toBe(true);
  });
});

describe('comparison fixture outcomes', () => {
  it('keeps filtered standard activation within the 80 ms latency budget', () => {
    const calibration = new GestureCalibrationSession();
    for (let timestampMs = 0; timestampMs < 2100; timestampMs += 20) {
      const state = calibrationFixtureAt('standard-range', timestampMs);
      const hand = state.frame.observations[0];
      if (!hand || !state.reference) continue;
      calibration.record(state.reference, {
        pinch: pinchRatio(hand),
        fist: fistOpenness(hand),
      });
    }
    const result = calibration.result();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    for (const gesture of ['pinch', 'fist'] as const) {
      const fixedThresholds =
        gesture === 'pinch'
          ? { activation: 0.34, continuation: 0.46 }
          : { activation: 0.32, continuation: 0.45 };
      const pipelines = [
        new CalibrationPipeline('fixed', fixedThresholds, false),
        new CalibrationPipeline('filtered', fixedThresholds, true),
        new CalibrationPipeline('calibrated', result.profile[gesture], true),
      ];
      const latencies = new Map<string, number>();
      let expectedStartedAtMs: number | undefined;

      for (let timestampMs = 2400; timestampMs <= 6000; timestampMs += 20) {
        const state = calibrationFixtureAt('standard-range', timestampMs);
        const hand = state.frame.observations[0];
        const value =
          gesture === 'pinch'
            ? hand && pinchRatio(hand)
            : hand && fistOpenness(hand);
        const expected = state.expected[gesture];
        if (expected === true && expectedStartedAtMs === undefined) {
          expectedStartedAtMs = timestampMs;
        }
        pipelines.forEach((pipeline) => {
          const output = pipeline.update(
            value,
            timestampMs,
            hand?.confidence ?? 0,
          );
          if (
            output.signal.phase === 'active' &&
            expectedStartedAtMs !== undefined &&
            !latencies.has(output.id)
          ) {
            latencies.set(output.id, timestampMs - expectedStartedAtMs);
          }
        });
        if (expected === false && latencies.size === pipelines.length) break;
      }

      const fixedLatency = latencies.get('fixed');
      expect(fixedLatency).toBeDefined();
      expect(
        (latencies.get('filtered') ?? Infinity) - (fixedLatency ?? 0),
      ).toBeLessThanOrEqual(80);
      expect(
        (latencies.get('calibrated') ?? Infinity) - (fixedLatency ?? 0),
      ).toBeLessThanOrEqual(80);
    }
  });

  it('never confirms jitter or deliberately short holds', () => {
    for (const scenario of ['threshold-jitter', 'short-hold'] as const) {
      for (const gesture of ['pinch', 'fist'] as const) {
        const thresholds =
          gesture === 'pinch'
            ? { activation: 0.34, continuation: 0.46 }
            : { activation: 0.32, continuation: 0.45 };
        const pipelines = [
          new CalibrationPipeline('fixed', thresholds, false),
          new CalibrationPipeline('filtered', thresholds, true),
        ];
        let activated = false;
        for (let timestampMs = 2400; timestampMs <= 6800; timestampMs += 20) {
          const state = calibrationFixtureAt(scenario, timestampMs);
          const hand = state.frame.observations[0];
          const value =
            gesture === 'pinch'
              ? hand && pinchRatio(hand)
              : hand && fistOpenness(hand);
          pipelines.forEach((pipeline) => {
            activated ||=
              pipeline.update(value, timestampMs, hand?.confidence ?? 0).signal
                .phase === 'active';
          });
        }
        expect(activated).toBe(false);
      }
    }
  });

  it('reduces pinch phase changes near the fixed threshold', () => {
    const fixed = new CalibrationPipeline(
      'fixed',
      { activation: 0.34, continuation: 0.46 },
      false,
    );
    const filtered = new CalibrationPipeline(
      'filtered',
      { activation: 0.34, continuation: 0.46 },
      true,
    );
    let fixedChanges = 0;
    let filteredChanges = 0;
    let fixedPhase = 'unknown';
    let filteredPhase = 'unknown';

    for (let timestampMs = 2400; timestampMs <= 4400; timestampMs += 20) {
      const hand = calibrationFixtureAt('threshold-jitter', timestampMs).frame
        .observations[0];
      const value = hand && pinchRatio(hand);
      const nextFixed = fixed.update(value, timestampMs, hand?.confidence ?? 0)
        .signal.phase;
      const nextFiltered = filtered.update(
        value,
        timestampMs,
        hand?.confidence ?? 0,
      ).signal.phase;
      if (nextFixed !== fixedPhase) fixedChanges += 1;
      if (nextFiltered !== filteredPhase) filteredChanges += 1;
      fixedPhase = nextFixed;
      filteredPhase = nextFiltered;
    }

    expect(filteredChanges).toBeLessThan(fixedChanges);
  });
});
