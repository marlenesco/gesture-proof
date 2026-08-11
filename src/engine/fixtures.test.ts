import { describe, expect, it } from 'vitest';

import { FixturePlayer, fixtureFrameAt } from './fixtures';

describe('deterministic fixtures', () => {
  it('returns identical observations inside a fixture time step', () => {
    expect(fixtureFrameAt('jitter', 421)).toEqual(
      fixtureFrameAt('jitter', 499),
    );
  });

  it('models a repeatable dropout and recovery', () => {
    expect(fixtureFrameAt('dropout', 1000).observations).toHaveLength(1);
    expect(fixtureFrameAt('dropout', 1200).observations).toHaveLength(0);
    expect(fixtureFrameAt('dropout', 1800).observations).toHaveLength(1);
  });

  it('preserves hand identity while two hands cross', () => {
    const before = fixtureFrameAt('crossing', 200).observations;
    const during = fixtureFrameAt('crossing', 1800).observations;

    expect(before.map(({ id }) => id)).toEqual([
      'fixture-left',
      'fixture-right',
    ]);
    expect(during.map(({ id }) => id)).toEqual([
      'fixture-left',
      'fixture-right',
    ]);
    expect(before[0]?.landmarks[0]?.x).not.toBe(during[0]?.landmarks[0]?.x);
  });

  it('restarts selected scenarios from their first frame', () => {
    const player = new FixturePlayer('rapid-motion');
    player.start(1000);
    const first = player.frame(1000);
    player.select('rapid-motion', 9000);

    expect(player.frame(9000)).toEqual(first);
  });
});
