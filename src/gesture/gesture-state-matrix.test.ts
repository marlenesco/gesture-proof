import { describe, expect, it } from 'vitest';

import { stateMatrixFixtureAt } from '../engine/state-matrix-fixtures';
import {
  GestureStateMatrix,
  measureGestureMatrix,
  type MatrixGesture,
} from './gesture-state-matrix';

const POSE_TIMES: Readonly<Record<MatrixGesture, number>> = {
  pinch: 700,
  fist: 1700,
  'open-palm': 2700,
  point: 3700,
  'two-hand-span': 4700,
};

describe('gesture score matrix', () => {
  it.each(Object.entries(POSE_TIMES) as [MatrixGesture, number][])(
    'gives %s a decisive score',
    (gesture, timestampMs) => {
      const fixture = stateMatrixFixtureAt('gesture-sequence', timestampMs);
      const evidence = measureGestureMatrix(fixture.frame.observations);

      expect(evidence?.winner).toBe(gesture);
      expect(evidence?.scores[gesture]).toBeGreaterThanOrEqual(0.78);
      expect(evidence?.margin).toBeGreaterThanOrEqual(0.16);
    },
  );

  it('keeps neutral evidence below activation', () => {
    const fixture = stateMatrixFixtureAt('gesture-sequence', 200);
    const evidence = measureGestureMatrix(fixture.frame.observations);

    expect(evidence).toBeDefined();
    expect(Math.max(...Object.values(evidence?.scores ?? {}))).toBeLessThan(
      0.78,
    );
  });

  it('exposes competitive open-palm and span evidence as a narrow margin', () => {
    const states = Array.from({ length: 90 }, (_, index) =>
      stateMatrixFixtureAt('competitive-evidence', index * 20),
    );
    const margins = states
      .map(({ frame }) => measureGestureMatrix(frame.observations))
      .filter((value) => value !== undefined)
      .filter(({ scores, winner }) => scores[winner] >= 0.58)
      .map(({ margin }) => margin);

    expect(margins.some((margin) => margin < 0.16)).toBe(true);
  });

  it('requires two hands for span', () => {
    const open = stateMatrixFixtureAt('gesture-sequence', 2700);
    const evidence = measureGestureMatrix(open.frame.observations);

    expect(evidence?.scores['two-hand-span']).toBe(0);
  });

  it('keeps decisions equivalent for left mirrored input', () => {
    for (const timestampMs of [700, 1700, 2700, 3700]) {
      const right = stateMatrixFixtureAt('gesture-sequence', timestampMs);
      const left = stateMatrixFixtureAt('left-mirrored', timestampMs);

      expect(measureGestureMatrix(left.frame.observations)?.winner).toBe(
        measureGestureMatrix(right.frame.observations)?.winner,
      );
    }
  });
});

describe('GestureStateMatrix', () => {
  it('confirms each fixture gesture once and in order', () => {
    const matrix = new GestureStateMatrix();
    const activations: MatrixGesture[] = [];
    let previousPhase = 'unknown';

    for (let timestampMs = 0; timestampMs < 5600; timestampMs += 20) {
      const { frame } = stateMatrixFixtureAt('gesture-sequence', timestampMs);
      const signal = matrix.update(frame.observations, frame.timestampMs);
      if (signal.phase === 'active' && previousPhase !== 'active') {
        if (signal.payload.gesture) activations.push(signal.payload.gesture);
      }
      previousPhase = signal.phase;
    }

    expect(activations).toEqual([
      'pinch',
      'fist',
      'open-palm',
      'point',
      'two-hand-span',
    ]);
  });

  it('rejects holds shorter than temporal confirmation', () => {
    const matrix = new GestureStateMatrix();
    const phases = Array.from({ length: 180 }, (_, index) => {
      const { frame } = stateMatrixFixtureAt('short-holds', index * 20);
      return matrix.update(frame.observations, frame.timestampMs).phase;
    });

    expect(phases).not.toContain('active');
  });

  it('returns unknown for competitive evidence and never activates', () => {
    const matrix = new GestureStateMatrix();
    const signals = Array.from({ length: 90 }, (_, index) => {
      const { frame } = stateMatrixFixtureAt(
        'competitive-evidence',
        index * 20,
      );
      return matrix.update(frame.observations, frame.timestampMs);
    });

    expect(signals.some(({ payload }) => payload.reason === 'ambiguous')).toBe(
      true,
    );
    expect(signals.map(({ phase }) => phase)).not.toContain('active');
  });

  it('blocks a direct gesture handoff through release and cooldown', () => {
    const matrix = new GestureStateMatrix();
    const activations: { gesture: MatrixGesture; timestampMs: number }[] = [];
    let previousPhase = 'unknown';

    for (let timestampMs = 0; timestampMs < 2400; timestampMs += 20) {
      const { frame } = stateMatrixFixtureAt('direct-handoff', timestampMs);
      const signal = matrix.update(frame.observations, frame.timestampMs);
      if (
        signal.phase === 'active' &&
        previousPhase !== 'active' &&
        signal.payload.gesture
      ) {
        activations.push({
          gesture: signal.payload.gesture,
          timestampMs: signal.timestampMs,
        });
      }
      previousPhase = signal.phase;
    }

    expect(activations.map(({ gesture }) => gesture)).toEqual([
      'pinch',
      'fist',
    ]);
    expect((activations[1]?.timestampMs ?? 0) - 1300).toBeGreaterThanOrEqual(
      400,
    );
  });

  it('preserves short active dropout but rejects long dropout', () => {
    const matrix = new GestureStateMatrix();
    const signals = Array.from({ length: 165 }, (_, index) => {
      const { frame } = stateMatrixFixtureAt('dropout', index * 20);
      return matrix.update(frame.observations, frame.timestampMs);
    });

    expect(
      signals.some(({ payload }) => payload.reason === 'dropout-grace'),
    ).toBe(true);
    expect(
      signals.some(
        ({ phase, timestampMs }) => phase === 'unknown' && timestampMs >= 3040,
      ),
    ).toBe(true);
  });
});
