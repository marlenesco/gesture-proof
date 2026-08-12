import { describe, expect, it } from 'vitest';

import {
  createContainTransform,
  createCoverTransform,
  distance2D,
  jointAngleDegrees,
  normalizedToDisplay,
  normalizedToPixel,
  polygonArea,
  scaleIndependentDistance,
} from './geometry';

describe('geometry', () => {
  it('maps normalized points into mirrored pixel space', () => {
    expect(normalizedToPixel({ x: 0.25, y: 0.5 }, 800, 600, true)).toEqual({
      x: 600,
      y: 300,
    });
  });

  it('measures Euclidean distance', () => {
    expect(distance2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('measures polygon area independent of winding direction', () => {
    const clockwise = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];

    expect(polygonArea(clockwise)).toBe(12);
    expect(polygonArea([...clockwise].reverse())).toBe(12);
  });

  it('maps normalized input through a mirrored cover transform', () => {
    const transform = createCoverTransform(640, 480, 1200, 600, true);

    expect(transform).toMatchObject({
      scale: 1.875,
      offsetX: 0,
      offsetY: -150,
    });
    expect(normalizedToDisplay({ x: 0.25, y: 0.5 }, transform)).toEqual({
      x: 900,
      y: 300,
    });
  });

  it('keeps a square fixture plane proportional inside portrait display space', () => {
    const transform = createContainTransform(1, 1, 390, 844);

    expect(transform).toMatchObject({
      scale: 390,
      offsetX: 0,
      offsetY: 227,
    });
    expect(normalizedToDisplay({ x: 0.5, y: 0.5 }, transform)).toEqual({
      x: 195,
      y: 422,
    });
  });

  it('measures a joint angle without frame-size dependence', () => {
    expect(
      jointAngleDegrees({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }),
    ).toBeCloseTo(90);
  });

  it('normalizes distances against palm scale', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    landmarks[5] = { x: 0.2, y: 0 };
    landmarks[17] = { x: 0, y: 0.2 };

    expect(
      scaleIndependentDistance({ x: 0, y: 0 }, { x: 0.1, y: 0 }, landmarks),
    ).toBeCloseTo(0.5);
  });
});
