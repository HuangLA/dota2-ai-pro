import { describe, expect, it } from 'vitest';
import {
  createMapCoordinateMapper,
  DOTA_MAP_BOUNDS,
  LEGACY_MINIMAP_CONTENT_BOUNDS,
  MINIMAP_CONTENT_BOUNDS,
} from './mapCoordinateMapper';

const VIEWPORT = 900;

function createDefaultMapper() {
  return createMapCoordinateMapper({
    viewportWidth: VIEWPORT,
    viewportHeight: VIEWPORT,
    worldBounds: DOTA_MAP_BOUNDS,
    minimapContentBounds: MINIMAP_CONTENT_BOUNDS,
  });
}

function createLinearMapper() {
  return createMapCoordinateMapper({
    viewportWidth: VIEWPORT,
    viewportHeight: VIEWPORT,
    worldBounds: DOTA_MAP_BOUNDS,
    minimapContentBounds: MINIMAP_CONTENT_BOUNDS,
    preserveAspectRatio: false,
  });
}

function createLegacyAspectMapper() {
  return createMapCoordinateMapper({
    viewportWidth: VIEWPORT,
    viewportHeight: VIEWPORT,
    worldBounds: DOTA_MAP_BOUNDS,
    minimapContentBounds: LEGACY_MINIMAP_CONTENT_BOUNDS,
    preserveAspectRatio: true,
  });
}

function createOverlayMapper() {
  return createMapCoordinateMapper({
    viewportWidth: 320,
    viewportHeight: 320,
    worldBounds: DOTA_MAP_BOUNDS,
    minimapContentBounds: MINIMAP_CONTENT_BOUNDS,
    preserveAspectRatio: false,
  });
}

describe('mapCoordinateMapper', () => {
  it('maps world boundary points to minimap content boundary', () => {
    const mapper = createLinearMapper();

    const minPoint = mapper.gameToScreen(DOTA_MAP_BOUNDS.minX, DOTA_MAP_BOUNDS.maxY);
    const maxPoint = mapper.gameToScreen(DOTA_MAP_BOUNDS.maxX, DOTA_MAP_BOUNDS.minY);

    expect(minPoint.x).toBeCloseTo(MINIMAP_CONTENT_BOUNDS.left * VIEWPORT, 6);
    expect(minPoint.y).toBeCloseTo(MINIMAP_CONTENT_BOUNDS.top * VIEWPORT, 6);
    expect(maxPoint.x).toBeCloseTo(MINIMAP_CONTENT_BOUNDS.right * VIEWPORT, 6);
    expect(maxPoint.y).toBeCloseTo(MINIMAP_CONTENT_BOUNDS.bottom * VIEWPORT, 6);
  });

  it('maps midpoint to minimap content center', () => {
    const mapper = createDefaultMapper();

    const midX = (DOTA_MAP_BOUNDS.minX + DOTA_MAP_BOUNDS.maxX) / 2;
    const midY = (DOTA_MAP_BOUNDS.minY + DOTA_MAP_BOUNDS.maxY) / 2;
    const midPoint = mapper.gameToScreen(midX, midY);

    const expectedX = ((MINIMAP_CONTENT_BOUNDS.left + MINIMAP_CONTENT_BOUNDS.right) / 2) * VIEWPORT;
    const expectedY = ((MINIMAP_CONTENT_BOUNDS.top + MINIMAP_CONTENT_BOUNDS.bottom) / 2) * VIEWPORT;

    expect(midPoint.x).toBeCloseTo(expectedX, 6);
    expect(midPoint.y).toBeCloseTo(expectedY, 6);
  });

  it('uses inverted Y axis so higher game Y is visually higher', () => {
    const mapper = createDefaultMapper();

    const lower = mapper.gameToScreen(16384, 10000);
    const higher = mapper.gameToScreen(16384, 20000);

    expect(higher.y).toBeLessThan(lower.y);
  });

  it('still supports legacy bordered minimap bounds when explicitly requested', () => {
    const mapper = createLegacyAspectMapper();

    const minPoint = mapper.gameToScreen(DOTA_MAP_BOUNDS.minX, DOTA_MAP_BOUNDS.maxY);
    const maxPoint = mapper.gameToScreen(DOTA_MAP_BOUNDS.maxX, DOTA_MAP_BOUNDS.minY);

    expect(minPoint.x).toBeCloseTo(LEGACY_MINIMAP_CONTENT_BOUNDS.left * VIEWPORT, 6);
    expect(minPoint.y).toBeGreaterThan(LEGACY_MINIMAP_CONTENT_BOUNDS.top * VIEWPORT);
    expect(maxPoint.x).toBeCloseTo(LEGACY_MINIMAP_CONTENT_BOUNDS.right * VIEWPORT, 6);
    expect(maxPoint.y).toBeLessThan(VIEWPORT);
  });

  it('keeps round-trip error within one world unit', () => {
    const mapper = createDefaultMapper();
    const samples = [
      { x: DOTA_MAP_BOUNDS.minX, y: DOTA_MAP_BOUNDS.minY },
      { x: DOTA_MAP_BOUNDS.maxX, y: DOTA_MAP_BOUNDS.maxY },
      { x: 9550, y: 9950 },
      { x: 16384, y: 16384 },
      { x: 23450, y: 22750 },
    ];

    for (const sample of samples) {
      const screen = mapper.gameToScreen(sample.x, sample.y);
      const roundTrip = mapper.screenToGame(screen.x, screen.y);

      expect(Math.abs(roundTrip.x - sample.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTrip.y - sample.y)).toBeLessThanOrEqual(1);
    }
  });

  it('aligns known objective coordinates with the official building overlay', () => {
    const mapper = createOverlayMapper();
    const samples = [
      { x: 10048, y: 18240, screenX: 55, screenY: 123 },
      { x: 9883, y: 15512, screenX: 55, screenY: 170 },
      { x: 14840, y: 14976, screenX: 135, screenY: 181 },
      { x: 21287.5, y: 10185.719, screenX: 249, screenY: 264 },
      { x: 11108.9375, y: 22312.438, screenX: 75, screenY: 61 },
      { x: 18880, y: 18496, screenX: 204, screenY: 124 },
      { x: 22784, y: 16768, screenX: 266, screenY: 157 },
      { x: 22720, y: 19416, screenX: 266, screenY: 108 },
    ];

    for (const sample of samples) {
      const screen = mapper.gameToScreen(sample.x, sample.y);
      expect(Math.abs(screen.x - sample.screenX)).toBeLessThanOrEqual(6);
      expect(Math.abs(screen.y - sample.screenY)).toBeLessThanOrEqual(6);
    }
  });
});
