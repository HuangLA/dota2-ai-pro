import { describe, expect, it } from 'vitest';
import type { ObjectivesResponse } from '@/api/backend';
import {
  buildObjectiveMarkers,
  resolveObjectiveElementId,
} from './mapObjectives';

function buildObjectivesResponse(
  objectives: ObjectivesResponse['objectives'],
): ObjectivesResponse {
  return {
    match_id: 1,
    objectives,
    summary: {
      total: objectives.length,
    },
  };
}

describe('mapObjectives', () => {
  it('maps raw combat-log names to stable objective ids', () => {
    expect(resolveObjectiveElementId({
      type: 'destroyed',
      objective_type: 'tower',
      objective_name: 'npc_dota_goodguys_tower1_top',
      tick: 300,
      time: 10,
      game_time: 10,
    })).toBe('radiant_top_t1');

    expect(resolveObjectiveElementId({
      type: 'destroyed',
      objective_type: 'tower',
      objective_name: 'npc_dota_goodguys_tower4',
      tick: 600,
      time: 20,
      game_time: 20,
      x: 10680,
      y: 11510,
    })).toBe('radiant_t4_top');

    expect(resolveObjectiveElementId({
      type: 'destroyed',
      objective_type: 'roshan',
      objective_name: 'npc_dota_roshan',
      tick: 1800,
      time: 60,
      game_time: 60,
      x: 17480,
      y: 19180,
    })).toBe('roshan_dire');
  });

  it('marks destroyed buildings and omits non-building objectives from display markers', () => {
    const markers = buildObjectiveMarkers(
      1650,
      buildObjectivesResponse([
        {
          type: 'destroyed',
          objective_type: 'tower',
          objective_name: 'npc_dota_badguys_tower1_mid',
          tick: 1500,
          time: 50,
          game_time: 900,
        },
        {
          type: 'destroyed',
          objective_type: 'tormentor',
          objective_name: 'npc_dota_miniboss',
          tick: 3900,
          time: 130,
          game_time: 1300,
          attacker_name: 'npc_dota_hero_windrunner',
        },
      ]),
      {
        npc_dota_hero_windrunner: 2,
      },
    );

    expect(markers.find((marker) => marker.id === 'dire_mid_t1')?.state).toBe('destroyed');
    expect(markers.find((marker) => marker.id === 'tormentor_radiant')).toBeUndefined();
  });

  it('does not include roshan markers in the rendered objective list', () => {
    const markers = buildObjectiveMarkers(
      1100,
      buildObjectivesResponse([
        {
          type: 'destroyed',
          objective_type: 'roshan',
          objective_name: 'npc_dota_roshan',
          tick: 18000,
          time: 600,
          game_time: 500,
          x: 17500,
          y: 19200,
        },
      ]),
    );

    expect(markers.find((marker) => marker.id === 'roshan_dire')).toBeUndefined();
  });

  it('prefers event coordinates when the objective payload includes x/y', () => {
    const markers = buildObjectiveMarkers(
      1800,
      buildObjectivesResponse([
        {
          type: 'destroyed',
          objective_type: 'barracks',
          objective_name: 'npc_dota_goodguys_melee_rax_mid',
          tick: 2000,
          time: 80,
          game_time: 1600,
          x: 11999,
          y: 11888,
        },
      ]),
    );

    const marker = markers.find((item) => item.id === 'radiant_mid_rax_melee');
    expect(marker?.x).toBe(11999);
    expect(marker?.y).toBe(11888);
    expect(marker?.state).toBe('destroyed');
  });

  it('assigns unresolved t4 kills in sequence when combat log lacks coordinates', () => {
    expect(resolveObjectiveElementId({
      type: 'destroyed',
      objective_type: 'tower',
      objective_name: 'npc_dota_goodguys_tower4',
      tick: 500,
      time: 20,
      game_time: 20,
    })).toBe('radiant_t4_top');

    expect(resolveObjectiveElementId(
      {
        type: 'destroyed',
        objective_type: 'tower',
        objective_name: 'npc_dota_goodguys_tower4',
        tick: 600,
        time: 24,
        game_time: 24,
      },
      {
        destroyedMarkerIds: new Set(['radiant_t4_top']),
      },
    )).toBe('radiant_t4_bot');
  });
});
