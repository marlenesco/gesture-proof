import { describe, expect, it } from 'vitest';

import type { GestureSignal, HandObservation } from '../engine/contracts';
import { pinchFixtureFrameAt } from '../engine/pinch-fixtures';
import {
  PinchRecognizer,
  pinchRatio,
  type PinchPayload,
} from './pinch-recognizer';

function runScenario(
  scenario: Parameters<typeof pinchFixtureFrameAt>[0],
  stepMs = 20,
  durationMs = 3400,
): GestureSignal<PinchPayload>[] {
  const recognizer = new PinchRecognizer();
  const signals: GestureSignal<PinchPayload>[] = [];
  for (let timestampMs = 0; timestampMs <= durationMs; timestampMs += stepMs) {
    const frame = pinchFixtureFrameAt(scenario, timestampMs);
    signals.push(recognizer.update(frame.observations, frame.timestampMs));
  }
  return signals;
}

function firstPhaseAt(
  signals: readonly GestureSignal<PinchPayload>[],
  phase: GestureSignal['phase'],
): number | undefined {
  return signals.find((signal) => signal.phase === phase)?.timestampMs;
}

describe('pinch geometry', () => {
  it('normalizes thumb-to-index distance by palm size', () => {
    const small = pinchFixtureFrameAt('clean-pinch', 1200).observations[0];
    expect(small).toBeDefined();
    if (!small) return;
    const scaled: HandObservation = {
      ...small,
      landmarks: small.landmarks.map(({ x, y, z }) => ({
        x: 0.5 + (x - 0.5) * 0.5,
        y: 0.5 + (y - 0.5) * 0.5,
        z,
      })),
    };

    expect(pinchRatio(scaled)).toBeCloseTo(pinchRatio(small) ?? 0, 5);
  });

  it('rejects impossible or degenerate geometry', () => {
    const source = pinchFixtureFrameAt('clean-pinch', 1200).observations[0];
    expect(source).toBeDefined();
    if (!source) return;
    const invalid: HandObservation = {
      ...source,
      landmarks: source.landmarks.map(() => ({ x: 0.5, y: 0.5 })),
    };

    expect(pinchRatio(invalid)).toBeUndefined();
    expect(new PinchRecognizer().update([invalid], 0).phase).toBe('unknown');
  });
});

describe('pinch temporal state machine', () => {
  it('confirms a clean pinch, releases it, and completes cooldown', () => {
    const signals = runScenario('clean-pinch');

    expect(signals.some(({ phase }) => phase === 'candidate')).toBe(true);
    expect(signals.some(({ phase }) => phase === 'active')).toBe(true);
    expect(signals.some(({ phase }) => phase === 'cooldown')).toBe(true);
    expect(signals.at(-1)?.phase).toBe('idle');
  });

  it.each(['near-miss', 'threshold-jitter', 'short-tap'] as const)(
    'does not activate for %s evidence',
    (scenario) => {
      expect(
        runScenario(scenario).some(({ phase }) => phase === 'active'),
      ).toBe(false);
    },
  );

  it('uses elapsed time instead of frame counts', () => {
    const fast = firstPhaseAt(runScenario('clean-pinch', 20), 'active');
    const slow = firstPhaseAt(runScenario('clean-pinch', 60), 'active');

    expect(fast).toBeDefined();
    expect(slow).toBeDefined();
    expect(Math.abs((fast ?? 0) - (slow ?? 0))).toBeLessThanOrEqual(60);
  });

  it('keeps active intent across a short dropout with decayed confidence', () => {
    const dropoutSignals = runScenario('short-dropout').filter(
      ({ timestampMs }) => timestampMs >= 1600 && timestampMs < 1680,
    );

    expect(dropoutSignals).not.toHaveLength(0);
    expect(dropoutSignals.every(({ phase }) => phase === 'active')).toBe(true);
    expect(
      dropoutSignals.every(({ payload }) => payload.reason === 'dropout-grace'),
    ).toBe(true);
    expect(dropoutSignals.at(-1)?.confidence).toBeLessThan(
      dropoutSignals[0]?.confidence ?? 0,
    );
  });

  it('returns unknown when a dropout exceeds the grace period', () => {
    const signals = runScenario('long-dropout');
    const duringLongDropout = signals.filter(
      ({ timestampMs }) => timestampMs >= 1620 && timestampMs < 1840,
    );

    expect(duringLongDropout.some(({ phase }) => phase === 'unknown')).toBe(
      true,
    );
  });

  it('has equivalent activation timing for left and mirrored fixtures', () => {
    const clean = firstPhaseAt(runScenario('clean-pinch'), 'active');
    const left = firstPhaseAt(runScenario('left-hand'), 'active');
    const mirrored = firstPhaseAt(runScenario('mirrored'), 'active');

    expect(left).toBe(clean);
    expect(mirrored).toBe(clean);
  });

  it('does not silently transfer an active gesture to another hand', () => {
    const recognizer = new PinchRecognizer();
    let selectedId: string | undefined;

    for (let timestampMs = 0; timestampMs <= 1400; timestampMs += 20) {
      const primary = pinchFixtureFrameAt('clean-pinch', timestampMs)
        .observations[0];
      expect(primary).toBeDefined();
      if (!primary) continue;
      const secondary: HandObservation = {
        ...primary,
        id: 'other-hand',
        confidence: 1,
      };
      const signal = recognizer.update(
        timestampMs < 200 ? [primary] : [secondary, primary],
        timestampMs,
      );
      selectedId = signal.payload.handId;
    }

    expect(selectedId).toBe('fixture-right');
  });

  it('reacquires a different hand only after missing evidence becomes unknown', () => {
    const recognizer = new PinchRecognizer();
    let primary: HandObservation | undefined;
    for (let timestampMs = 0; timestampMs <= 1400; timestampMs += 20) {
      primary = pinchFixtureFrameAt('clean-pinch', timestampMs).observations[0];
      if (primary) recognizer.update([primary], timestampMs);
    }
    expect(primary).toBeDefined();
    if (!primary) return;
    const secondary: HandObservation = { ...primary, id: 'replacement-hand' };

    expect(recognizer.update([secondary], 1460).phase).toBe('active');
    const unknown = recognizer.update([secondary], 1520);
    expect(unknown.phase).toBe('unknown');
    expect(unknown.payload.handId).toBe('fixture-right');
    const recovered = recognizer.update([secondary], 1540);
    expect(recovered.phase).toBe('idle');
    expect(recovered.payload.handId).toBe('replacement-hand');
  });
});
