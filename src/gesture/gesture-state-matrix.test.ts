import { describe, expect, it } from 'vitest';

import type { HandObservation } from '../engine/contracts';
import { shapeFist } from '../engine/calibration-fixtures';
import { fixtureFrameAt } from '../engine/fixtures';
import { palmScale } from '../engine/geometry';
import {
  shapePoint,
  stateMatrixFixtureAt,
} from '../engine/state-matrix-fixtures';
import {
  DEFAULT_GESTURE_STATE_MATRIX_CONFIG,
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

function palmCenter(hand: HandObservation): { x: number; y: number } {
  const points = [0, 5, 9, 13, 17].map((index) => hand.landmarks[index]!);
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function translatedHand(
  hand: HandObservation,
  id: string,
  centerX: number,
): HandObservation {
  const center = palmCenter(hand);
  return {
    ...hand,
    id,
    landmarks: hand.landmarks.map((point) => ({
      ...point,
      x: point.x + centerX - center.x,
    })),
  };
}

function noisyFistHand(): HandObservation {
  const open = fixtureFrameAt('stable', 0).observations[0]!;
  const fist = shapeFist(open, 1, 0);
  return {
    ...fist,
    landmarks: fist.landmarks.map((point, index) =>
      index >= 13 && index <= 16 ? open.landmarks[index]! : point,
    ),
  };
}

function practicalSpanHands(): readonly HandObservation[] {
  const open = fixtureFrameAt('stable', 0).observations[0]!;
  const scale = palmScale(open.landmarks)!;
  const separation = scale * 2.5;
  return [
    translatedHand(open, 'left', 0.5 - separation / 2),
    translatedHand(open, 'right', 0.5 + separation / 2),
  ];
}

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

  it('keeps the pointing index extended while the other fingertips curl toward the palm', () => {
    const point = stateMatrixFixtureAt('gesture-sequence', 3700).frame
      .observations[0];
    expect(point).toBeDefined();
    if (!point) return;
    const wrist = point.landmarks[0]!;
    const towardPalm = (mcpIndex: number, tipIndex: number): number => {
      const mcp = point.landmarks[mcpIndex]!;
      const tip = point.landmarks[tipIndex]!;
      return (
        (tip.x - mcp.x) * (wrist.x - mcp.x) +
        (tip.y - mcp.y) * (wrist.y - mcp.y)
      );
    };

    expect(towardPalm(5, 8)).toBeLessThan(0);
    expect(towardPalm(9, 12)).toBeGreaterThan(0);
    expect(towardPalm(13, 16)).toBeGreaterThan(0);
    expect(towardPalm(17, 20)).toBeGreaterThan(0);
  });

  it('keeps fist decisive when one non-pointing finger is noisy', () => {
    const evidence = measureGestureMatrix([noisyFistHand()]);

    expect(evidence?.winner).toBe('fist');
    expect(evidence?.scores.fist).toBeGreaterThanOrEqual(0.78);
    expect(evidence?.margin).toBeGreaterThanOrEqual(0.16);
  });

  it.each([
    ['fist', shapeFist(fixtureFrameAt('stable', 0).observations[0]!, 0.74, 0)],
    [
      'point',
      shapePoint(fixtureFrameAt('stable', 0).observations[0]!, 0, 0.74),
    ],
  ] as const)(
    'recognizes an incomplete camera-like %s pose',
    (gesture, hand) => {
      const evidence = measureGestureMatrix([hand]);

      expect(evidence?.winner).toBe(gesture);
      expect(evidence?.scores[gesture]).toBeGreaterThanOrEqual(0.78);
      expect(evidence?.margin).toBeGreaterThanOrEqual(0.16);
    },
  );

  it('rejects point when two non-index fingers remain open', () => {
    const open = fixtureFrameAt('stable', 0).observations[0]!;
    const point = shapePoint(open, 0);
    const twoOpenFingers = {
      ...point,
      landmarks: point.landmarks.map(
        (landmark, index) =>
          (index >= 9 && index <= 16 ? open.landmarks[index] : landmark)!,
      ),
    };
    const evidence = measureGestureMatrix([twoOpenFingers]);

    expect(evidence?.scores.point).toBeLessThan(0.78);
  });

  it('activates a practical two-hand span near 2.5 palm widths', () => {
    const evidence = measureGestureMatrix(practicalSpanHands(), undefined, {
      ...DEFAULT_GESTURE_STATE_MATRIX_CONFIG,
      spanContinuationRatio: 1.45,
      spanActivationRatio: 2.45,
    });

    expect(evidence?.spanRatio).toBeCloseTo(2.5, 4);
    expect(evidence?.winner).toBe('two-hand-span');
    expect(evidence?.scores['two-hand-span']).toBeGreaterThanOrEqual(0.78);
    expect(evidence?.margin).toBeGreaterThanOrEqual(0.16);
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
  it('temporally confirms a noisy real-world fist', () => {
    const matrix = new GestureStateMatrix();
    const signals = Array.from({ length: 12 }, (_, index) =>
      matrix.update([noisyFistHand()], index * 20),
    );

    expect(signals.at(-1)?.phase).toBe('active');
    expect(signals.at(-1)?.payload.gesture).toBe('fist');
  });

  it('temporally confirms the practical span with manipulation thresholds', () => {
    const matrix = new GestureStateMatrix({
      ...DEFAULT_GESTURE_STATE_MATRIX_CONFIG,
      spanContinuationRatio: 1.45,
      spanActivationRatio: 2.45,
    });
    const signals = Array.from({ length: 12 }, (_, index) =>
      matrix.update(practicalSpanHands(), index * 20),
    );

    expect(signals.at(-1)?.phase).toBe('active');
    expect(signals.at(-1)?.payload.gesture).toBe('two-hand-span');
  });

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
