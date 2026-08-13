import { describe, expect, it } from 'vitest';
import type { GestureSignal } from '../engine/contracts';
import type { GestureStateMatrixPayload } from './gesture-state-matrix';
import { GestureHoldRecognizer } from './gesture-hold';
import { PointHoldRecognizer } from './point-hold';

function pointSignal(
  timestampMs: number,
): GestureSignal<GestureStateMatrixPayload> {
  return {
    id: 'gesture-state-matrix',
    phase: 'active',
    confidence: 1,
    timestampMs,
    payload: {
      gesture: 'point',
      primaryHandId: 'hand-1',
      scores: {
        pinch: 0,
        fist: 0,
        'open-palm': 0,
        point: 1,
        'two-hand-span': 0,
      },
      margin: 1,
      activationProgress: 1,
      releaseProgress: 0,
      reason: 'active-continuation',
    },
  };
}

describe('PointHoldRecognizer', () => {
  it('requires a continuous 350 ms active point before arming once', () => {
    const hold = new PointHoldRecognizer();
    expect(hold.update(pointSignal(100), 2).payload.progress).toBe(0);
    expect(hold.update(pointSignal(440), 2).payload.armed).toBe(false);
    expect(hold.update(pointSignal(450), 2).payload.armed).toBe(true);
    expect(hold.update(pointSignal(520), 2).payload.armed).toBe(false);
  });

  it('cancels hold when selection disappears', () => {
    const hold = new PointHoldRecognizer();
    hold.update(pointSignal(100), 1);
    expect(hold.update(pointSignal(300), 0).payload.progress).toBe(0);
    expect(hold.update(pointSignal(650), 1).payload.armed).toBe(false);
  });

  it('does not arm before the caller explicitly enables deletion', () => {
    const hold = new PointHoldRecognizer();
    expect(hold.update(pointSignal(100), 0).payload.armed).toBe(false);
    expect(hold.update(pointSignal(600), 0).payload.progress).toBe(0);
    expect(hold.update(pointSignal(700), 1).payload.armed).toBe(false);
    expect(hold.update(pointSignal(1050), 1).payload.armed).toBe(true);
  });

  it('arms a separate open-palm clear hold', () => {
    const clear = new GestureHoldRecognizer('open-palm');
    const palm = {
      ...pointSignal(100),
      payload: { ...pointSignal(100).payload, gesture: 'open-palm' as const },
    };
    expect(clear.update(palm, true).payload.armed).toBe(false);
    expect(
      clear.update({ ...palm, timestampMs: 450 }, true).payload.armed,
    ).toBe(true);
  });
});
