import type { ObjectiveEventData, ObjectivesResponse } from '@/api/backend';
import {
  getMapElementById,
  getObjectiveMapElements,
  type MapElement,
} from './mapElements';

export type MapObjectiveState =
  | 'alive'
  | 'destroyed'
  | 'respawning'
  | 'inactive'
  | 'uncertain';

export interface MapObjectiveMarker extends MapElement {
  state: MapObjectiveState;
  detailLabel?: string;
}

type ResolvedObjectiveEvent = ObjectiveEventData & {
  markerId: string | null;
};

const OBJECTIVE_ANCHORS = getObjectiveMapElements();

const GAME_DAY_NIGHT_CYCLE_SECONDS = 5 * 60;
const ROSHAN_RESPAWN_MIN_SECONDS = 8 * 60;
const ROSHAN_RESPAWN_MAX_SECONDS = 11 * 60;
const TORMENTOR_INITIAL_SPAWN_SECONDS = 20 * 60;
const TORMENTOR_RESPAWN_SECONDS = 10 * 60;

const DIRECT_OBJECTIVE_ID_BY_ENTITY_NAME: Record<string, string> = {
  npc_dota_goodguys_tower1_top: 'radiant_top_t1',
  npc_dota_goodguys_tower1_mid: 'radiant_mid_t1',
  npc_dota_goodguys_tower1_bot: 'radiant_bot_t1',
  npc_dota_goodguys_tower2_top: 'radiant_top_t2',
  npc_dota_goodguys_tower2_mid: 'radiant_mid_t2',
  npc_dota_goodguys_tower2_bot: 'radiant_bot_t2',
  npc_dota_goodguys_tower3_top: 'radiant_top_t3',
  npc_dota_goodguys_tower3_mid: 'radiant_mid_t3',
  npc_dota_goodguys_tower3_bot: 'radiant_bot_t3',
  npc_dota_badguys_tower1_top: 'dire_top_t1',
  npc_dota_badguys_tower1_mid: 'dire_mid_t1',
  npc_dota_badguys_tower1_bot: 'dire_bot_t1',
  npc_dota_badguys_tower2_top: 'dire_top_t2',
  npc_dota_badguys_tower2_mid: 'dire_mid_t2',
  npc_dota_badguys_tower2_bot: 'dire_bot_t2',
  npc_dota_badguys_tower3_top: 'dire_top_t3',
  npc_dota_badguys_tower3_mid: 'dire_mid_t3',
  npc_dota_badguys_tower3_bot: 'dire_bot_t3',
  npc_dota_goodguys_melee_rax_top: 'radiant_top_rax_melee',
  npc_dota_goodguys_melee_rax_mid: 'radiant_mid_rax_melee',
  npc_dota_goodguys_melee_rax_bot: 'radiant_bot_rax_melee',
  npc_dota_goodguys_range_rax_top: 'radiant_top_rax_ranged',
  npc_dota_goodguys_range_rax_mid: 'radiant_mid_rax_ranged',
  npc_dota_goodguys_range_rax_bot: 'radiant_bot_rax_ranged',
  npc_dota_badguys_melee_rax_top: 'dire_top_rax_melee',
  npc_dota_badguys_melee_rax_mid: 'dire_mid_rax_melee',
  npc_dota_badguys_melee_rax_bot: 'dire_bot_rax_melee',
  npc_dota_badguys_range_rax_top: 'dire_top_rax_ranged',
  npc_dota_badguys_range_rax_mid: 'dire_mid_rax_ranged',
  npc_dota_badguys_range_rax_bot: 'dire_bot_rax_ranged',
  npc_dota_goodguys_fort: 'radiant_ancient',
  npc_dota_badguys_fort: 'dire_ancient',
};

function normalizeEntityName(name: string | undefined): string {
  if (!name) {
    return '';
  }

  return name
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

function formatDurationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function inferTeamFromEntityName(
  entityName: string | undefined,
  attackerTeamByName?: Record<string, number>,
): number | null {
  const normalizedName = normalizeEntityName(entityName);
  if (!normalizedName) {
    return null;
  }

  if (normalizedName.includes('goodguys')) {
    return 2;
  }
  if (normalizedName.includes('badguys')) {
    return 3;
  }

  return attackerTeamByName?.[normalizedName] ?? null;
}

function pickNearestObjectiveId(
  candidateIds: string[],
  x?: number,
  y?: number,
): string | null {
  if (typeof x !== 'number' || typeof y !== 'number') {
    return candidateIds[0] ?? null;
  }

  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidateId of candidateIds) {
    const candidate = getMapElementById(candidateId);
    if (!candidate) {
      continue;
    }

    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = candidateId;
    }
  }

  return bestId;
}

function pickSequentialObjectiveId(
  candidateIds: string[],
  destroyedMarkerIds?: Set<string>,
): string | null {
  if (!destroyedMarkerIds) {
    return candidateIds[0] ?? null;
  }

  for (const candidateId of candidateIds) {
    if (!destroyedMarkerIds.has(candidateId)) {
      return candidateId;
    }
  }

  return candidateIds[0] ?? null;
}

function getRoshanPitIdForGameTime(gameTime: number): string {
  const normalizedTime = Math.max(0, gameTime);
  const cycleIndex = Math.floor(normalizedTime / GAME_DAY_NIGHT_CYCLE_SECONDS) % 2;
  return cycleIndex === 0 ? 'roshan_radiant' : 'roshan_dire';
}

interface ObjectiveResolutionOptions {
  destroyedMarkerIds?: Set<string>;
  attackerTeamByName?: Record<string, number>;
}

export function resolveObjectiveElementId(
  event: ObjectiveEventData,
  options?: ObjectiveResolutionOptions,
): string | null {
  const normalizedName = normalizeEntityName(event.objective_name);
  if (!normalizedName) {
    return null;
  }

  const directMatch = DIRECT_OBJECTIVE_ID_BY_ENTITY_NAME[normalizedName];
  if (directMatch) {
    return directMatch;
  }

  if (normalizedName === 'npc_dota_goodguys_tower4') {
    if (typeof event.x === 'number' && typeof event.y === 'number') {
      return pickNearestObjectiveId(['radiant_t4_top', 'radiant_t4_bot'], event.x, event.y);
    }
    return pickSequentialObjectiveId(['radiant_t4_top', 'radiant_t4_bot'], options?.destroyedMarkerIds);
  }

  if (normalizedName === 'npc_dota_badguys_tower4') {
    if (typeof event.x === 'number' && typeof event.y === 'number') {
      return pickNearestObjectiveId(['dire_t4_top', 'dire_t4_bot'], event.x, event.y);
    }
    return pickSequentialObjectiveId(['dire_t4_top', 'dire_t4_bot'], options?.destroyedMarkerIds);
  }

  if (normalizedName === 'npc_dota_roshan') {
    if (typeof event.x === 'number' && typeof event.y === 'number') {
      return pickNearestObjectiveId(['roshan_radiant', 'roshan_dire'], event.x, event.y);
    }
    return getRoshanPitIdForGameTime(event.game_time ?? 0);
  }

  if (normalizedName === 'npc_dota_miniboss') {
    if (typeof event.x === 'number' && typeof event.y === 'number') {
      return pickNearestObjectiveId(['tormentor_radiant', 'tormentor_dire'], event.x, event.y);
    }

    const attackerTeam = inferTeamFromEntityName(event.attacker_name, options?.attackerTeamByName);
    if (attackerTeam === 2) {
      return 'tormentor_radiant';
    }
    if (attackerTeam === 3) {
      return 'tormentor_dire';
    }

    return null;
  }

  return null;
}

function cloneObjectiveMarker(element: MapElement): MapObjectiveMarker {
  return {
    ...element,
    state: element.type === 'tormentor' ? 'inactive' : 'alive',
  };
}

export function buildObjectiveMarkers(
  currentGameTime: number,
  objectivesResponse?: ObjectivesResponse | null,
  attackerTeamByName?: Record<string, number>,
): MapObjectiveMarker[] {
  const markers = new Map<string, MapObjectiveMarker>();
  for (const element of OBJECTIVE_ANCHORS) {
    markers.set(element.id, cloneObjectiveMarker(element));
  }

  const relevantEvents = (objectivesResponse?.objectives ?? [])
    .filter((event) => typeof event.game_time === 'number' && event.game_time <= currentGameTime)
    .sort((left, right) => {
      const leftTime = left.game_time ?? left.tick;
      const rightTime = right.game_time ?? right.tick;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.tick - right.tick;
    });

  const latestEventByMarkerId = new Map<string, ResolvedObjectiveEvent>();
  const destroyedMarkerIds = new Set<string>();
  const unresolvedTormentorEvents: ObjectiveEventData[] = [];
  const resolvedEvents: ResolvedObjectiveEvent[] = [];

  for (const event of relevantEvents) {
    const markerId = resolveObjectiveElementId(event, {
      destroyedMarkerIds,
      attackerTeamByName,
    });

    resolvedEvents.push({
      ...event,
      markerId,
    });

    if (!markerId) {
      if (event.objective_type === 'tormentor') {
        unresolvedTormentorEvents.push(event);
      }
      continue;
    }

    const previous = latestEventByMarkerId.get(markerId);
    if (!previous || (event.game_time ?? -Infinity) >= (previous.game_time ?? -Infinity)) {
      latestEventByMarkerId.set(markerId, { ...event, markerId });
    }

    const marker = markers.get(markerId);
    if (marker && (marker.type === 'tower' || marker.type === 'barracks' || marker.type === 'ancient')) {
      destroyedMarkerIds.add(markerId);
    }
  }

  for (const [markerId, latestEvent] of latestEventByMarkerId.entries()) {
    const marker = markers.get(markerId);
    if (!marker) {
      continue;
    }

    if (typeof latestEvent.x === 'number' && typeof latestEvent.y === 'number') {
      marker.x = latestEvent.x;
      marker.y = latestEvent.y;
    }
  }

  for (const marker of markers.values()) {
    if (marker.type === 'tower' || marker.type === 'barracks' || marker.type === 'ancient') {
      if (latestEventByMarkerId.has(marker.id)) {
        marker.state = 'destroyed';
        marker.detailLabel = '已摧毁';
      }
    }
  }

  for (const tormentorId of ['tormentor_radiant', 'tormentor_dire'] as const) {
    const marker = markers.get(tormentorId);
    if (!marker) {
      continue;
    }

    if (currentGameTime < TORMENTOR_INITIAL_SPAWN_SECONDS) {
      marker.state = 'inactive';
      marker.detailLabel = `20:00 刷新`;
      continue;
    }

    const lastKill = latestEventByMarkerId.get(tormentorId);
    if (!lastKill || typeof lastKill.game_time !== 'number') {
      const latestUnresolvedKill = unresolvedTormentorEvents[unresolvedTormentorEvents.length - 1];
      if (latestUnresolvedKill && typeof latestUnresolvedKill.game_time === 'number') {
        const respawnAt = latestUnresolvedKill.game_time + TORMENTOR_RESPAWN_SECONDS;
        if (currentGameTime < respawnAt) {
          marker.state = 'uncertain';
          marker.detailLabel = '位置待定';
          continue;
        }
      }

      marker.state = 'alive';
      marker.detailLabel = undefined;
      continue;
    }

    const respawnAt = lastKill.game_time + TORMENTOR_RESPAWN_SECONDS;
    if (currentGameTime < respawnAt) {
      marker.state = 'respawning';
      marker.detailLabel = formatDurationLabel(respawnAt - currentGameTime);
      continue;
    }

    marker.state = 'alive';
    marker.detailLabel = undefined;
  }

  const roshanRadiant = markers.get('roshan_radiant');
  const roshanDire = markers.get('roshan_dire');
  if (roshanRadiant && roshanDire) {
    roshanRadiant.state = 'inactive';
    roshanDire.state = 'inactive';
    roshanRadiant.detailLabel = undefined;
    roshanDire.detailLabel = undefined;

    const activePitId = getRoshanPitIdForGameTime(currentGameTime);
    const latestRoshanKill = resolvedEvents
      .filter((event) => event.objective_type === 'roshan')
      .sort((left, right) => (right.game_time ?? -Infinity) - (left.game_time ?? -Infinity))[0];

    if (!latestRoshanKill || typeof latestRoshanKill.game_time !== 'number') {
      const activePit = markers.get(activePitId);
      if (activePit) {
        activePit.state = 'alive';
      }
    } else {
      const deathPitId = latestRoshanKill.markerId ?? getRoshanPitIdForGameTime(latestRoshanKill.game_time);
      const respawnWindowStart = latestRoshanKill.game_time + ROSHAN_RESPAWN_MIN_SECONDS;
      const respawnWindowEnd = latestRoshanKill.game_time + ROSHAN_RESPAWN_MAX_SECONDS;
      const deathPit = markers.get(deathPitId);

      if (deathPit && currentGameTime < respawnWindowStart) {
        deathPit.state = 'respawning';
        deathPit.detailLabel = formatDurationLabel(respawnWindowStart - currentGameTime);
      } else if (deathPit && currentGameTime < respawnWindowEnd) {
        deathPit.state = 'uncertain';
        deathPit.detailLabel = '8-11 分钟';
      } else {
        const activePit = markers.get(activePitId);
        if (activePit) {
          activePit.state = 'alive';
        }
      }
    }
  }

  return OBJECTIVE_ANCHORS
    .map((element) => markers.get(element.id))
    .filter((marker): marker is MapObjectiveMarker => Boolean(marker));
}

export function summarizeObjectiveMarkers(markers: MapObjectiveMarker[]): {
  alive: number;
  destroyed: number;
  respawning: number;
  inactive: number;
  uncertain: number;
} {
  return markers.reduce(
    (summary, marker) => {
      summary[marker.state] += 1;
      return summary;
    },
    {
      alive: 0,
      destroyed: 0,
      respawning: 0,
      inactive: 0,
      uncertain: 0,
    },
  );
}
