import type { MapElement } from '@/data/mapElements';

export type ObjectiveIconKey =
  | 'tower_outer'
  | 'tower'
  | 'tower_90'
  | 'racks_45'
  | 'racks_90'
  | 'ancient';

export interface ObjectiveIconSpec {
  assetPath: string;
  sizeRatio: number;
}

export interface ObjectiveIconLike {
  id: string;
  type: MapElement['type'];
}

export const OBJECTIVE_ICON_SPECS: Record<ObjectiveIconKey, ObjectiveIconSpec> = {
  tower_outer: {
    assetPath: '/assets/dota/minimap/icons/tower_outer.png',
    sizeRatio: 0.014,
  },
  tower: {
    assetPath: '/assets/dota/minimap/icons/tower.png',
    sizeRatio: 0.019,
  },
  tower_90: {
    assetPath: '/assets/dota/minimap/icons/tower_90.png',
    sizeRatio: 0.019,
  },
  racks_45: {
    assetPath: '/assets/dota/minimap/icons/racks_45.png',
    sizeRatio: 0.022,
  },
  racks_90: {
    assetPath: '/assets/dota/minimap/icons/racks_90.png',
    sizeRatio: 0.022,
  },
  ancient: {
    assetPath: '/assets/dota/minimap/icons/ancient.png',
    sizeRatio: 0.028,
  },
};

export function resolveObjectiveIconKey(objective: ObjectiveIconLike): ObjectiveIconKey | null {
  if (objective.type === 'ancient') {
    return 'ancient';
  }

  if (objective.type === 'barracks') {
    return objective.id.includes('_mid_') ? 'racks_90' : 'racks_45';
  }

  if (objective.type !== 'tower') {
    return null;
  }

  if (/_t[12]$/.test(objective.id)) {
    return objective.id.includes('_mid_') ? 'tower_90' : 'tower';
  }

  if (/_t4_/.test(objective.id) || /_mid_t3$/.test(objective.id)) {
    return 'tower_90';
  }

  return 'tower';
}
