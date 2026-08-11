import { describe, expect, it } from 'vitest';
import { fixtureFrameAt } from '../engine/fixtures';
import {
  motionFieldFixtureAt,
  translateFixtureHand,
} from '../engine/motion-field-fixtures';
import { PalmMotionSignal, palmMotionSample } from './motion-signal';

function baseHand() {
  const hand = fixtureFrameAt('stable', 0).observations[0];
  if (!hand) throw new Error('Stable fixture hand is missing.');
  return hand;
}

describe('palmMotionSample', () => {
  it('returns a normalized center and valid palm scale', () => {
    const sample = palmMotionSample(baseHand());
    expect(sample?.position.x).toBeGreaterThan(0);
    expect(sample?.position.x).toBeLessThan(1);
    expect(sample?.scale).toBeGreaterThan(0.02);
  });

  it('rejects incomplete geometry', () => {
    expect(palmMotionSample({ ...baseHand(), landmarks: [] })).toBeUndefined();
  });
});

describe('PalmMotionSignal', () => {
  it('derives positive horizontal motion from elapsed time', () => {
    const signal = new PalmMotionSignal();
    const hand = baseHand();
    signal.update([translateFixtureHand(hand, 0.3, 0.6, 0)], 0);
    const result = signal.update(
      [translateFixtureHand(hand, 0.34, 0.6, 100)],
      100,
    );
    expect(result.phase).toBe('active');
    expect(result.payload.velocityX).toBeGreaterThan(0.2);
    expect(Math.abs(result.payload.velocityY)).toBeLessThan(0.01);
  });

  it('keeps sub-threshold stillness idle', () => {
    const signal = new PalmMotionSignal();
    for (let timestampMs = 0; timestampMs <= 600; timestampMs += 20) {
      const state = motionFieldFixtureAt('stillness', timestampMs);
      const result = signal.update(state.frame.observations, timestampMs);
      expect(result.phase).not.toBe('active');
    }
  });

  it('reports direction reversal without frame-count assumptions', () => {
    const signal = new PalmMotionSignal();
    let before = 0;
    let after = 0;
    for (let timestampMs = 0; timestampMs <= 2600; timestampMs += 40) {
      const state = motionFieldFixtureAt('horizontal-sweep', timestampMs);
      const result = signal.update(state.frame.observations, timestampMs);
      if (timestampMs === 1600) before = result.payload.velocityX;
      if (timestampMs === 2400) after = result.payload.velocityX;
    }
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(0);
  });

  it('rejects repeated timestamps', () => {
    const signal = new PalmMotionSignal();
    const hand = baseHand();
    signal.update([hand], 100);
    const result = signal.update([hand], 100);
    expect(result.phase).toBe('unknown');
    expect(result.payload.reason).toBe('invalid-timestamp');
  });

  it('restarts after a long timestamp gap', () => {
    const signal = new PalmMotionSignal();
    const hand = baseHand();
    signal.update([hand], 0);
    const result = signal.update([hand], 200);
    expect(result.phase).toBe('unknown');
    expect(result.payload.reason).toBe('timestamp-gap');
  });

  it('rejects an impossible jump instead of teleporting', () => {
    const signal = new PalmMotionSignal();
    const hand = baseHand();
    signal.update([translateFixtureHand(hand, 0.2, 0.6, 0)], 0);
    const result = signal.update(
      [translateFixtureHand(hand, 0.8, 0.6, 20)],
      20,
    );
    expect(result.phase).toBe('unknown');
    expect(result.payload.reason).toBe('impossible-jump');
    expect(result.payload.speed).toBe(0);
  });

  it('freezes velocity during short dropout and expires after grace', () => {
    const signal = new PalmMotionSignal();
    const hand = baseHand();
    signal.update([translateFixtureHand(hand, 0.3, 0.6, 0)], 0);
    signal.update([translateFixtureHand(hand, 0.34, 0.6, 80)], 80);
    const short = signal.update([], 140);
    const long = signal.update([], 240);
    expect(short.payload.reason).toBe('dropout-grace');
    expect(short.payload.speed).toBe(0);
    expect(long.payload.reason).toBe('evidence-missing');
  });

  it('retains the strongest owner when a second hand appears', () => {
    const signal = new PalmMotionSignal();
    const first = motionFieldFixtureAt('two-hand-owner', 0);
    const second = motionFieldFixtureAt('two-hand-owner', 80);
    const acquired = signal.update(first.frame.observations, 0);
    const moving = signal.update(second.frame.observations, 80);
    expect(acquired.payload.ownerId).toBe('fixture-right');
    expect(moving.payload.ownerId).toBe('fixture-right');
  });

  it('clamps valid high velocity to the public contract', () => {
    const signal = new PalmMotionSignal({
      activationSpeed: 0.08,
      continuationSpeed: 0.04,
      maximumVelocity: 0.5,
      maximumJumpVelocity: 20,
      maximumGapMs: 160,
      dropoutGraceMs: 120,
      smoothingTimeMs: 1,
    });
    const hand = baseHand();
    signal.update([translateFixtureHand(hand, 0.2, 0.6, 0)], 0);
    const result = signal.update(
      [translateFixtureHand(hand, 0.3, 0.6, 20)],
      20,
    );
    expect(result.payload.speed).toBeCloseTo(0.5, 5);
  });
});
