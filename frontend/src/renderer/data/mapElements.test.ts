import { describe, expect, it } from 'vitest';
import { getMapElementById } from './mapElements';

function getDistanceBetween(firstId: string, secondId: string): number {
  const first = getMapElementById(firstId);
  const second = getMapElementById(secondId);

  expect(first).toBeDefined();
  expect(second).toBeDefined();

  return Math.hypot((first?.x ?? 0) - (second?.x ?? 0), (first?.y ?? 0) - (second?.y ?? 0));
}

describe('mapElements highground anchors', () => {
  it('keeps radiant mid highground tower and barracks as separate anchors', () => {
    expect(getDistanceBetween('radiant_mid_t3', 'radiant_mid_rax_melee')).toBeGreaterThan(350);
    expect(getDistanceBetween('radiant_mid_t3', 'radiant_mid_rax_ranged')).toBeGreaterThan(350);
    expect(getDistanceBetween('radiant_mid_rax_melee', 'radiant_mid_rax_ranged')).toBeGreaterThan(500);
  });

  it('uses parser-calibrated coordinates for known base buildings', () => {
    expect(getMapElementById('radiant_ancient')).toMatchObject({
      x: 10464,
      y: 11032,
    });
    expect(getMapElementById('radiant_mid_rax_melee')).toMatchObject({
      x: 11712,
      y: 11832,
    });
    expect(getMapElementById('radiant_top_rax_ranged')).toMatchObject({
      x: 9540,
      y: 12625,
    });
    expect(getMapElementById('radiant_t4_top')).toMatchObject({
      x: 10672,
      y: 11520,
    });
    expect(getMapElementById('dire_top_rax_melee')).toMatchObject({
      x: 20282.031,
      y: 21880,
    });
    expect(getMapElementById('dire_ancient')).toMatchObject({
      x: 21912,
      y: 21384,
    });
  });
});
