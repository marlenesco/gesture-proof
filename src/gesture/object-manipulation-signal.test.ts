import { describe, expect, it } from 'vitest';
import type { GestureSignal, NormalizedPoint } from '../engine/contracts';
import { objectBenchFixtureAt } from '../engine/object-bench-fixtures';
import {
  GestureStateMatrix,
  type GestureStateMatrixPayload,
  type MatrixGesture,
} from './gesture-state-matrix';
import {
  ObjectManipulationSignal,
  type ObjectManipulationAction,
} from './object-manipulation-signal';
import { PalmMotionSignal, type MotionSignalPayload } from './motion-signal';

function motionSignal(
  timestampMs: number,
  position: NormalizedPoint | undefined,
  phase: GestureSignal['phase'] = position ? 'active' : 'unknown',
): GestureSignal<MotionSignalPayload> {
  return {
    id: 'motion',
    phase,
    confidence: position ? 0.95 : 0,
    timestampMs,
    payload: {
      position,
      velocityX: 0,
      velocityY: 0,
      speed: 0,
      palmRelativeSpeed: 0,
      ownerId: position ? 'hand-1' : undefined,
      reason: position ? 'moving' : 'evidence-missing',
    },
  };
}

function matrixSignal(
  timestampMs: number,
  gesture: MatrixGesture | undefined,
  spanRatio?: number,
  phase: GestureSignal['phase'] = gesture ? 'active' : 'idle',
): GestureSignal<GestureStateMatrixPayload> {
  return {
    id: 'matrix',
    phase,
    confidence: gesture ? 0.96 : 0.8,
    timestampMs,
    payload: {
      scores: {
        pinch: gesture === 'pinch' ? 1 : 0,
        fist: gesture === 'fist' ? 1 : 0,
        'open-palm': gesture === 'open-palm' ? 1 : 0,
        point: gesture === 'point' ? 1 : 0,
        'two-hand-span': gesture === 'two-hand-span' ? 1 : 0,
      },
      winner: gesture,
      runnerUp: 'open-palm',
      margin: gesture ? 1 : 0,
      gesture,
      primaryHandId: 'hand-1',
      spanRatio,
      activationProgress: gesture ? 1 : 0,
      releaseProgress: 0,
      reason: gesture ? 'active-continuation' : 'released',
    },
  };
}

function collectScenario(scenario: Parameters<typeof objectBenchFixtureAt>[0]) {
  const matrix = new GestureStateMatrix();
  const motion = new PalmMotionSignal();
  const manipulation = new ObjectManipulationSignal();
  const results: GestureSignal<
    ReturnType<typeof manipulation.update>['payload']
  >[] = [];
  for (let timestampMs = 0; timestampMs <= 6200; timestampMs += 20) {
    const fixture = objectBenchFixtureAt(scenario, timestampMs);
    const motionResult = motion.update(fixture.frame.observations, timestampMs);
    const matrixResult = matrix.update(fixture.frame.observations, timestampMs);
    results.push(manipulation.update(motionResult, matrixResult, timestampMs));
  }
  return results;
}

describe('ObjectManipulationSignal', () => {
  it.each([
    {
      action: 'translate',
      gesture: 'pinch',
      start: { x: 0.4, y: 0.5 },
      end: { x: 0.48, y: 0.46 },
    },
    {
      action: 'rotate',
      gesture: 'fist',
      start: { x: 0.4, y: 0.5 },
      end: { x: 0.48, y: 0.46 },
    },
  ] as const)(
    'preserves $action movement made during temporal confirmation',
    ({ action, gesture, start, end }) => {
      const recognizer = new ObjectManipulationSignal();
      const pending = recognizer.update(
        motionSignal(0, start),
        matrixSignal(0, gesture, undefined, 'candidate'),
        0,
      );
      expect(pending.phase).toBe('candidate');
      expect(pending.payload.action).toBeUndefined();
      expect(pending.payload.reason).toBe('action-pending');
      expect(pending.payload.deltaX).toBe(0);
      expect(pending.payload.rotationX).toBe(0);
      recognizer.update(
        motionSignal(80, { x: 0.44, y: 0.48 }),
        matrixSignal(80, gesture, undefined, 'candidate'),
        80,
      );
      const confirmed = recognizer.update(
        motionSignal(140, end),
        matrixSignal(140, gesture),
        140,
      );

      expect(confirmed.payload.action).toBe(action);
      expect(confirmed.payload.reason).toBe('action-acquired');
      if (action === 'translate') {
        expect(confirmed.payload.deltaX).toBeCloseTo(0.08);
        expect(confirmed.payload.deltaY).toBeCloseTo(-0.04);
      } else {
        expect(confirmed.payload.rotationX).toBeCloseTo(-0.168);
        expect(confirmed.payload.rotationY).toBeCloseTo(0.336);
      }
    },
  );

  it('preserves span change made during temporal confirmation', () => {
    const recognizer = new ObjectManipulationSignal();
    const pending = recognizer.update(
      motionSignal(0, { x: 0.35, y: 0.5 }),
      matrixSignal(0, 'two-hand-span', 2.3, 'candidate'),
      0,
    );
    expect(pending.phase).toBe('candidate');
    expect(pending.payload.action).toBeUndefined();
    expect(pending.payload.reason).toBe('action-pending');
    expect(pending.payload.scaleFactor).toBe(1);
    recognizer.update(
      motionSignal(80, { x: 0.33, y: 0.5 }),
      matrixSignal(80, 'two-hand-span', 2.5, 'candidate'),
      80,
    );
    const confirmed = recognizer.update(
      motionSignal(140, { x: 0.31, y: 0.5 }),
      matrixSignal(140, 'two-hand-span', 2.65),
      140,
    );

    expect(confirmed.payload.action).toBe('scale');
    expect(confirmed.payload.reason).toBe('action-acquired');
    expect(confirmed.payload.scaleFactor).toBeCloseTo(2.65 / 2.3);
  });

  it.each([
    ['translate', 'translate'],
    ['rotate', 'rotate'],
    ['scale', 'scale'],
  ] as const)('maps %s fixture to only %s action', (scenario, expected) => {
    const results = collectScenario(scenario);
    const actions = new Set(
      results.map(({ payload }) => payload.action).filter(Boolean),
    );
    expect(actions).toEqual(new Set<ObjectManipulationAction>([expected]));
    expect(
      results.some(({ payload }) => payload.reason === 'transforming'),
    ).toBe(true);
  });

  it('runs translate, rotate, and scale through one release-separated sequence', () => {
    const actions = new Set(
      collectScenario('full-sequence')
        .map(({ payload }) => payload.action)
        .filter(Boolean),
    );
    expect(actions).toEqual(
      new Set<ObjectManipulationAction>(['translate', 'rotate', 'scale']),
    );
  });

  it('keeps neutral evidence transform-free', () => {
    const results = collectScenario('neutral');
    expect(results.every(({ payload }) => payload.action === undefined)).toBe(
      true,
    );
  });

  it('locks action and rejects a direct gesture change', () => {
    const recognizer = new ObjectManipulationSignal();
    recognizer.update(
      motionSignal(0, { x: 0.4, y: 0.5 }),
      matrixSignal(0, 'pinch'),
      0,
    );
    const changed = recognizer.update(
      motionSignal(20, { x: 0.42, y: 0.5 }),
      matrixSignal(20, 'fist'),
      20,
    );
    expect(changed.phase).toBe('unknown');
    expect(changed.payload.reason).toBe('action-changed');
    expect(changed.payload.deltaX).toBe(0);
  });

  it('reacquires baseline after dropout before emitting another delta', () => {
    const recognizer = new ObjectManipulationSignal();
    recognizer.update(
      motionSignal(0, { x: 0.4, y: 0.5 }),
      matrixSignal(0, 'pinch'),
      0,
    );
    const moved = recognizer.update(
      motionSignal(20, { x: 0.43, y: 0.5 }),
      matrixSignal(20, 'pinch'),
      20,
    );
    const missing = recognizer.update(
      motionSignal(40, undefined),
      matrixSignal(40, 'pinch'),
      40,
    );
    const recovered = recognizer.update(
      motionSignal(60, { x: 0.62, y: 0.5 }),
      matrixSignal(60, 'pinch'),
      60,
    );
    expect(moved.payload.deltaX).toBeCloseTo(0.03);
    expect(missing.payload.reason).toBe('evidence-missing');
    expect(recovered.payload.reason).toBe('baseline-reacquired');
    expect(recovered.payload.deltaX).toBe(0);
  });

  it('rejects implausible per-sample movement', () => {
    const recognizer = new ObjectManipulationSignal();
    recognizer.update(
      motionSignal(0, { x: 0.2, y: 0.5 }),
      matrixSignal(0, 'pinch'),
      0,
    );
    const result = recognizer.update(
      motionSignal(20, { x: 0.8, y: 0.5 }),
      matrixSignal(20, 'pinch'),
      20,
    );
    expect(result.phase).toBe('unknown');
    expect(result.payload.reason).toBe('delta-rejected');
  });

  it('rejects scale jumps and accepts bounded span change', () => {
    const recognizer = new ObjectManipulationSignal();
    recognizer.update(
      motionSignal(0, { x: 0.4, y: 0.5 }),
      matrixSignal(0, 'two-hand-span', 3),
      0,
    );
    const bounded = recognizer.update(
      motionSignal(20, { x: 0.4, y: 0.5 }),
      matrixSignal(20, 'two-hand-span', 3.3),
      20,
    );
    const rejected = recognizer.update(
      motionSignal(40, { x: 0.4, y: 0.5 }),
      matrixSignal(40, 'two-hand-span', 5),
      40,
    );
    expect(bounded.payload.scaleFactor).toBeCloseTo(1.1);
    expect(rejected.payload.reason).toBe('delta-rejected');
  });

  it('emits no transform for open palm or point', () => {
    const recognizer = new ObjectManipulationSignal();
    for (const gesture of ['open-palm', 'point'] as const) {
      const result = recognizer.update(
        motionSignal(0, { x: 0.5, y: 0.5 }),
        matrixSignal(0, gesture),
        0,
      );
      expect(result.payload.action).toBeUndefined();
      expect(result.payload.reason).toBe('ready');
    }
  });
});
