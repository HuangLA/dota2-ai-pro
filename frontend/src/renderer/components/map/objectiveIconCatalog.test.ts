import { describe, expect, it } from 'vitest';

import { resolveObjectiveIconKey } from './objectiveIconCatalog';

describe('resolveObjectiveIconKey', () => {
  it('matches outer towers to their lane highground tower style', () => {
    expect(
      resolveObjectiveIconKey({
        id: 'radiant_mid_t1',
        type: 'tower',
      }),
    ).toBe('tower_90');

    expect(
      resolveObjectiveIconKey({
        id: 'dire_top_t2',
        type: 'tower',
      }),
    ).toBe('tower');

    expect(
      resolveObjectiveIconKey({
        id: 'radiant_bot_t1',
        type: 'tower',
      }),
    ).toBe('tower');
  });

  it('separates highground towers from outer towers', () => {
    expect(
      resolveObjectiveIconKey({
        id: 'radiant_top_t3',
        type: 'tower',
      }),
    ).toBe('tower');

    expect(
      resolveObjectiveIconKey({
        id: 'dire_mid_t3',
        type: 'tower',
      }),
    ).toBe('tower_90');
  });

  it('uses lane-aware barracks icons', () => {
    expect(
      resolveObjectiveIconKey({
        id: 'radiant_mid_rax_melee',
        type: 'barracks',
      }),
    ).toBe('racks_90');

    expect(
      resolveObjectiveIconKey({
        id: 'dire_top_rax_ranged',
        type: 'barracks',
      }),
    ).toBe('racks_45');
  });

  it('keeps ancients on the dedicated icon', () => {
    expect(
      resolveObjectiveIconKey({
        id: 'radiant_ancient',
        type: 'ancient',
      }),
    ).toBe('ancient');
  });
});
