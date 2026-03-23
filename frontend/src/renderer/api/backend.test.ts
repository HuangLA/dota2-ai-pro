import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import backendAPI from './backend';

const fetchMock = vi.fn();

function createJsonResponse<T>(data: T) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as const;
}

describe('backendAPI visualization queries', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only one hero for single-match heatmaps even when multiple heroes are selected', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({
        data: {
          match_id: 8674716612,
          heatmap_type: 'movement',
          hero: 'npc_dota_hero_axe',
          heroes: ['npc_dota_hero_axe'],
          team: 2,
          time_range: { start: -90, end: 120 },
          grid_size: 64,
          map_bounds: { min_x: 0, max_x: 1, min_y: 0, max_y: 1 },
          grid_data: [],
          max_density: 1,
          total_samples: 1,
        },
        meta: {
          generation_time_ms: 10,
        },
      })
    );

    await backendAPI.getMatchHeatmap(8674716612, {
      heatmapType: 'movement',
      heroes: ['npc_dota_hero_axe', 'npc_dota_hero_lina'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    const query = new URL(calledUrl).searchParams;
    expect(query.getAll('hero')).toEqual(['npc_dota_hero_axe']);
    expect(query.get('heatmap_type')).toBe('movement');
  });

  it('keeps multi-hero path queries intact', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({
        data: {
          match_id: 8674716612,
          time_range: { start: -90, end: 120 },
          paths: [],
          hero_count: 2,
          simplification: {
            enabled: true,
            epsilon: 100,
            original_points: 10,
            simplified_points: 8,
            reduction_ratio: 0.2,
          },
        },
        meta: {
          generation_time_ms: 10,
        },
      })
    );

    await backendAPI.getMovementPaths(8674716612, {
      heroes: ['npc_dota_hero_axe', 'npc_dota_hero_lina'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    const query = new URL(calledUrl).searchParams;
    expect(query.getAll('hero')).toEqual(['npc_dota_hero_axe', 'npc_dota_hero_lina']);
  });
});
