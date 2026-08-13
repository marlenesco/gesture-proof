import { describe, expect, it } from 'vitest';

import { apertureFixtureAt } from '../engine/aperture-fixtures';
import { palmScale } from '../engine/geometry';
import { fingerOpennesses } from './pose-metrics';
import { ApertureFieldRecognizer, measureAperture } from './aperture-field';

function orientation(
  first: { readonly x: number; readonly y: number },
  second: { readonly x: number; readonly y: number },
  third: { readonly x: number; readonly y: number },
): number {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function segmentsCross(
  firstStart: { readonly x: number; readonly y: number },
  firstEnd: { readonly x: number; readonly y: number },
  secondStart: { readonly x: number; readonly y: number },
  secondEnd: { readonly x: number; readonly y: number },
): boolean {
  const first = orientation(firstStart, firstEnd, secondStart);
  const second = orientation(firstStart, firstEnd, secondEnd);
  const third = orientation(secondStart, secondEnd, firstStart);
  const fourth = orientation(secondStart, secondEnd, firstEnd);
  return first * second < 0 && third * fourth < 0;
}

describe('ApertureFieldRecognizer', () => {
  it('builds a stable L-pose aperture with closed remaining fingers', () => {
    const frame = apertureFixtureAt('steady-aperture', 1600).frame;
    const evidence = measureAperture(frame.observations);
    const openness = fingerOpennesses(frame.observations[0]!);

    expect(evidence?.corners).toHaveLength(4);
    expect(evidence?.area).toBeGreaterThan(1.25);
    expect(evidence?.handIds).toEqual(['aperture-left', 'aperture-right']);
    expect(openness?.index).toBeGreaterThan(0.58);
    expect(openness?.middle).toBeLessThan(0.4);
    expect(openness?.ring).toBeLessThan(0.4);
    expect(openness?.pinky).toBeLessThan(0.4);
  });

  it('confirms only after temporal evidence', () => {
    const recognizer = new ApertureFieldRecognizer();
    const phases = Array.from({ length: 14 }, (_, index) => {
      const frame = apertureFixtureAt(
        'steady-aperture',
        1300 + index * 20,
      ).frame;
      return recognizer.update(frame.observations, frame.timestampMs).phase;
    });

    expect(phases).toContain('candidate');
    expect(phases.at(-1)).toBe('active');
  });

  it('accepts a temporally confirmed micro aperture below former area floor', () => {
    const frame = apertureFixtureAt('small-aperture', 1600).frame;
    const evidence = measureAperture(frame.observations);
    expect(evidence?.area).toBeLessThan(1.25);
    expect(evidence?.area).toBeGreaterThanOrEqual(0.18);
  });

  it('rejects low-confidence aperture corners before geometry can activate', () => {
    const frame = apertureFixtureAt('small-aperture', 1600).frame;
    const uncertain = frame.observations.map((hand) => ({
      ...hand,
      confidence: 0.79,
    }));
    expect(measureAperture(uncertain)).toBeUndefined();
  });

  it('keeps open-palm fixture evidence inactive', () => {
    const frame = apertureFixtureAt('open-palm-span', 1600).frame;
    expect(measureAperture(frame.observations)).toBeUndefined();
  });

  it('requires micro corners to stay still through the longer confirmation', () => {
    const recognizer = new ApertureFieldRecognizer();
    const phases = Array.from({ length: 18 }, (_, index) => {
      const frame = apertureFixtureAt(
        'small-aperture',
        1300 + index * 20,
      ).frame;
      const unstable = {
        ...frame.observations[0]!,
        landmarks: frame.observations[0]!.landmarks.map(
          (point, landmarkIndex) =>
            landmarkIndex === 4 || landmarkIndex === 8
              ? { ...point, x: point.x + (index % 2 === 0 ? 0.03 : -0.03) }
              : point,
        ),
      };
      return recognizer.update(
        [unstable, frame.observations[1]!],
        frame.timestampMs,
      ).phase;
    });
    expect(phases).not.toContain('active');
  });

  it('rejects a collapsed aperture with fewer than three distinct corners', () => {
    const frame = apertureFixtureAt('collapsed-aperture', 1600).frame;
    expect(measureAperture(frame.observations)).toBeUndefined();
  });

  it('releases after a long missing-evidence interval', () => {
    const recognizer = new ApertureFieldRecognizer();
    const signals = Array.from({ length: 190 }, (_, index) => {
      const frame = apertureFixtureAt('dropout', index * 20).frame;
      return recognizer.update(frame.observations, frame.timestampMs);
    });

    expect(
      signals.some(({ payload }) => payload.reason === 'release-confirmed'),
    ).toBe(true);
  });

  it('preserves crossed anatomy as a four-corner bow-tie', () => {
    const crossed = Array.from({ length: 40 }, (_, index) => {
      const frame = apertureFixtureAt('crossing', 1600 + index * 100).frame;
      return measureAperture(frame.observations);
    }).find((evidence) => {
      if (evidence?.corners.length !== 4) return false;
      const [first, second, third, fourth] = evidence.corners;
      return segmentsCross(first!, second!, third!, fourth!);
    });

    expect(crossed?.corners).toHaveLength(4);
    expect(crossed?.area).toBeGreaterThan(1.25);
  });

  it('keeps a near pinch as a four-corner aperture', () => {
    const frame = apertureFixtureAt('steady-aperture', 1600).frame;
    const left = frame.observations[0]!;
    const index = left.landmarks[8]!;
    const scale = palmScale(left.landmarks)!;
    const nearPinch = {
      ...left,
      landmarks: left.landmarks.map((point, landmarkIndex) =>
        landmarkIndex === 4
          ? { ...point, x: index.x + scale * 0.16, y: index.y }
          : point,
      ),
    };
    const evidence = measureAperture([nearPinch, frame.observations[1]!]);

    expect(evidence?.corners).toHaveLength(4);
    expect(evidence?.corners[0]).not.toEqual(evidence?.corners[3]);
  });

  it('uses measured pinch contact as a triangular boundary without slot snap', () => {
    const frame = apertureFixtureAt('pinch-corner', 1600).frame;
    const evidence = measureAperture(frame.observations);
    const left = frame.observations[0]!;
    const thumb = left.landmarks[4]!;
    const index = left.landmarks[8]!;

    expect(fingerOpennesses(left)?.index).toBeGreaterThanOrEqual(0);
    expect(evidence?.corners).toHaveLength(4);
    expect(evidence?.corners[0]).toEqual({
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
    });
    expect(evidence?.corners[3]).toEqual(evidence?.corners[0]);
  });
});
