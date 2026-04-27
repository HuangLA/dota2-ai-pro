/**
 * Real Match Viewer - 真实比赛查看器
 * 显示解析后的录像数据，支持时间轴控制和平滑动画
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePlaybackStore } from '../store/playbackStore';
import MapViewer from '../components/map/MapViewer';
import {
  HeatmapBounds,
  HeroPosition,
  KillMarkerData,
  PathOverlay,
  Ward,
  WardInteractionPayload,
} from '../components/map/DotaMapRenderer';
import { Timeline } from '../components/timeline';
import AdvantageChart from '../components/charts/AdvantageChart';
import backendAPI, {
  HudHeroMetric,
  Match,
  MatchDetail,
  MatchHeatmapResponse,
  MatchPlayer,
  MovementPathsResponse,
  ObjectivesResponse,
  PlaybackTimeBasis,
  TickData,
  WardData,
  WardsResponse,
} from '../api/backend';
import { ParseTask, replayService } from '../api/replayService';
import { getHeroByName, getHeroPortraitUrl } from '../data/heroes';
import {
  getItemFallbackShortLabel,
  getItemIconCandidates,
  getItemTooltipData,
  getItemLabel,
  isEnhancementItem,
  isHiddenReplayItem,
  isLikelyNeutralItem,
  normalizeItemName,
} from '../data/items';
import { ReplayEntryContext } from '../types/replayContext';
import {
  createGameClockMapper,
  formatGameClockTime,
  GameClockMapper,
} from '../utils/gameClock';
import { buildObjectiveMarkers, summarizeObjectiveMarkers } from '../data/mapObjectives';

/** 时间范围常量（秒） */
const PRE_GAME_FETCH_SECONDS = 180;
const POST_GAME_FETCH_BUFFER_SECONDS = 600;
const DEFAULT_DURATION = 3600;
const DEFAULT_INITIAL_GAME_CLOCK_SECONDS = -90;
const DEFAULT_HERO_PORTRAIT_URL = '/assets/dota/heroes/default.png';
const TEAM_HERO_COUNT = 5;
const HUD_REQUEST_THROTTLE_MS = 500;
const HUD_VISIBLE_ROW_COUNT = 10;
const DEFAULT_HEATMAP_GRID_SIZE = 64;
const PARSE_TASK_POLLING_INTERVAL_MS = 2000;
const LEGACY_ITEM_SLOT_WARNING_SNIPPET = '旧版物品槽契约';
const OBSERVER_WARD_LIFETIME_SECONDS = 360;
const SENTRY_WARD_LIFETIME_SECONDS = 420;
const WARD_TOOLTIP_OFFSET_PX = 16;

type VisualizationRangePreset = 'full' | 'opening5' | 'opening10' | 'opening15' | 'midgame15to25' | 'custom';
type WardTeamFilter = 'all' | 'radiant' | 'dire';
type WardTypeFilter = 'all' | 'observer' | 'sentry';
type WardMapMode = 'current' | 'range' | 'full';

interface WardPlacementRecord {
  instanceKey: string;
  handle: number;
  type: 'observer' | 'sentry';
  team: 'radiant' | 'dire';
  x: number;
  y: number;
  placedSourceTime: number;
  placedGameTime: number;
  naturalExpireSourceTime: number;
  naturalExpireGameTime: number;
  removalSourceTime: number;
  removalGameTime: number;
  removalKind: 'destroyed' | 'expired';
  destroyerName?: string;
  destroyerKind?: 'hero' | 'hero_summon' | 'lane_creep' | 'neutral_creep' | 'unit';
  destroyerTeam?: number;
  destroyerLabel: string;
  lifetimeSeconds: number;
  placerHeroName?: string;
  placerHandle?: number;
  placerSource?: 'parser' | 'inferred';
  placerDistance?: number;
}

interface WardPopoverState {
  wards: WardPlacementRecord[];
  anchorX: number;
  anchorY: number;
}

interface CustomVisualizationRange {
  start: string;
  end: string;
}

interface HudItemSlots {
  inventory: Array<string | null>;
  backpack: Array<string | null>;
  neutral: string | null;
  enhancement: string | null;
  extraStashCount: number;
}

interface TeamHeroPortrait {
  key: number;
  heroName: string;
  portraitUrl: string;
  team: 'radiant' | 'dire';
  displayName?: string | null;
  displayType?: string | null;
  proName?: string | null;
  personaName?: string | null;
  accountId?: number | null;
  playerName?: string | null;
}

interface TeamLineups {
  radiant: TeamHeroPortrait[];
  dire: TeamHeroPortrait[];
}

interface DeathInterval {
  startSourceTime: number;
  endSourceTime: number;
}

interface HudHeroStatus {
  isAlive: boolean;
  respawnRemainingSeconds?: number;
  hp?: number;
  maxHp?: number;
  hpRatio?: number;
}

interface HeatmapSummary {
  hero?: string | null;
  heroes?: string[] | null;
  team?: number | null;
  totalSamples: number;
  maxDensity: number;
  timeRange: {
    start: number;
    end: number;
  };
}

interface PathSummary {
  heroCount: number;
  timeRange: {
    start: number;
    end: number;
  };
  simplification: MovementPathsResponse['data']['simplification'];
}

interface HeroSelectionOption {
  value: string;
  label: string;
  portraitUrl: string;
  team: 'radiant' | 'dire';
  key: number;
}

interface LoadMatchDataOptions {
  preserveAnalysisState?: boolean;
  preserveCurrentTime?: boolean;
}

interface OverlayModeMeta {
  title: string;
  description: string;
  densityLabel: string;
  filterLabel: string;
}

type MapOverlayPanelKey = 'insight' | 'legend';

interface MapOverlayPanelState {
  x: number;
  y: number;
  open: boolean;
}

interface MapOverlayPanelDragState {
  key: MapOverlayPanelKey;
  offsetX: number;
  offsetY: number;
  containerRect: DOMRect;
  panelWidth: number;
  panelHeight: number;
}

const OVERLAY_MODE_META: Record<'none' | 'movement' | 'kill' | 'death', OverlayModeMeta> = {
  none: {
    title: '无热力图',
    description: '当前只显示实时英雄位置、眼位、最近 5 秒死亡位置和可选路径轨迹。',
    densityLabel: '未启用',
    filterLabel: '仅实时图层',
  },
  movement: {
    title: '移动热力图',
    description: '颜色越热，代表所选英雄或队伍在该区域停留、经过的采样越密集。',
    densityLabel: '位置采样密度',
    filterLabel: '按英雄位置统计',
  },
  kill: {
    title: '击杀热力图',
    description: '颜色越热，代表该区域发生击杀的次数越多；队伍过滤按击杀者阵营统计。',
    densityLabel: '击杀次数密度',
    filterLabel: '按击杀者阵营统计',
  },
  death: {
    title: '死亡热力图',
    description: '颜色越热，代表该区域出现阵亡的次数越多；队伍过滤按阵亡英雄阵营统计。',
    densityLabel: '阵亡次数密度',
    filterLabel: '按阵亡者阵营统计',
  },
};

const MAP_OVERLAY_PANEL_MARGIN = 12;
const MAP_OVERLAY_PANEL_META: Record<MapOverlayPanelKey, { title: string; width: number }> = {
  insight: {
    title: '现在看到什么',
    width: 280,
  },
  legend: {
    title: '地图图例',
    width: 250,
  },
};

function clampMapOverlayPosition(
  x: number,
  y: number,
  containerWidth: number,
  containerHeight: number,
  panelWidth: number,
  panelHeight: number
): { x: number; y: number } {
  const maxX = Math.max(MAP_OVERLAY_PANEL_MARGIN, containerWidth - panelWidth - MAP_OVERLAY_PANEL_MARGIN);
  const maxY = Math.max(MAP_OVERLAY_PANEL_MARGIN, containerHeight - panelHeight - MAP_OVERLAY_PANEL_MARGIN);

  return {
    x: clamp(x, MAP_OVERLAY_PANEL_MARGIN, maxX),
    y: clamp(y, MAP_OVERLAY_PANEL_MARGIN, maxY),
  };
}

function createDefaultMapOverlayPanels(mapViewportSize: number): Record<MapOverlayPanelKey, MapOverlayPanelState> {
  return {
    insight: {
      x: MAP_OVERLAY_PANEL_MARGIN,
      y: MAP_OVERLAY_PANEL_MARGIN,
      open: false,
    },
    legend: {
      x: Math.max(
        MAP_OVERLAY_PANEL_MARGIN,
        mapViewportSize - MAP_OVERLAY_PANEL_META.legend.width - MAP_OVERLAY_PANEL_MARGIN
      ),
      y: MAP_OVERLAY_PANEL_MARGIN,
      open: false,
    },
  };
}

function getTeamPerspectiveLabel(team: number | null | undefined): string {
  if (team === 2) {
    return '天辉';
  }
  if (team === 3) {
    return '夜魇';
  }
  return '全部队伍';
}

function normalizeHeroLookupKey(heroName: string): string {
  return String(heroName ?? '').replace('npc_dota_hero_', '').toLowerCase().replace(/_/g, '');
}

function normalizeTeamSide(team: string | number | null | undefined): 'radiant' | 'dire' | null {
  if (team === 2 || team === '2' || String(team ?? '').toLowerCase() === 'radiant') {
    return 'radiant';
  }
  if (team === 3 || team === '3' || String(team ?? '').toLowerCase() === 'dire') {
    return 'dire';
  }
  return null;
}

function getTeamHeroKey(team: 'radiant' | 'dire', heroName: string): string {
  return `${team}:${normalizeHeroLookupKey(heroName)}`;
}

function getWinnerTeam(
  winnerTeam: string | number | null | undefined,
  radiantWin: boolean | null | undefined
): 'radiant' | 'dire' | null {
  const normalizedWinner = normalizeTeamSide(winnerTeam);
  if (normalizedWinner) {
    return normalizedWinner;
  }
  if (typeof radiantWin === 'boolean') {
    return radiantWin ? 'radiant' : 'dire';
  }
  return null;
}

function buildMatchPlayerLookup(players: MatchPlayer[]): Map<string, MatchPlayer> {
  const playerLookup = new Map<string, MatchPlayer>();

  for (const player of players) {
    const team = normalizeTeamSide(player.team);
    if (!team || !player.hero_name) {
      continue;
    }

    playerLookup.set(getTeamHeroKey(team, player.hero_name), player);
  }

  return playerLookup;
}

function dedupeHeroSelections(selectedHeroes: string[]): string[] {
  return Array.from(
    new Set(
      selectedHeroes
        .map((hero) => String(hero ?? '').trim())
        .filter((hero) => hero.length > 0)
    )
  );
}

function formatSelectedHeroesLabel(
  selectedHeroes: string[],
  heroOptions: HeroSelectionOption[],
  allLabel: string
): string {
  if (selectedHeroes.length === 0) {
    return allLabel;
  }

  const labels = selectedHeroes
    .map((heroName) => heroOptions.find((option) => option.value === heroName)?.label)
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) {
    return allLabel;
  }

  if (labels.length <= 2) {
    return labels.join('、');
  }

  return `${labels.slice(0, 2).join('、')} +${labels.length - 2}`;
}

function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--';
  }

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatWardEntityName(entityName?: string | null): string {
  const trimmed = entityName?.trim();
  if (!trimmed) {
    return '未知来源';
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.includes('sentry_ward') || normalized.includes('sentry_wards') || normalized.includes('truesight')) {
    return '真眼';
  }
  if (normalized.includes('observer_ward') || normalized.includes('observer_wards')) {
    return '假眼';
  }

  const heroData = getHeroByName(trimmed);
  if (heroData?.chineseName) {
    return heroData.chineseName;
  }

  return trimmed
    .replace(/^npc_dota_hero_/, '')
    .replace(/^npc_dota_/, '')
    .replace(/^npc_/, '')
    .replace(/_/g, ' ')
    .trim() || trimmed;
}

function getWardDestroyerLabel(event?: WardData | null): string {
  if (!event) {
    return '自然到时';
  }

  if (event.destroy_reason === 'expired') {
    return '自然到时';
  }

  const sourceName = formatWardEntityName(event.destroyer_name);
  if (event.destroyer_kind === 'hero') {
    return `被 ${sourceName} 排掉`;
  }
  if (event.destroyer_kind === 'hero_summon') {
    return sourceName === '未知来源' ? '被召唤物排掉' : `被 ${sourceName} 的召唤物排掉`;
  }
  if (event.destroyer_kind === 'lane_creep') {
    return sourceName === '未知来源' ? '被小兵打掉' : `被 ${sourceName} 打掉（小兵）`;
  }
  if (event.destroyer_kind === 'neutral_creep') {
    return sourceName === '未知来源' ? '被中立生物打掉' : `被 ${sourceName} 打掉（中立生物）`;
  }
  if (event.destroyer_kind === 'unit') {
    return sourceName === '未知来源' ? '被单位打掉' : `被 ${sourceName} 打掉`;
  }
  if (event.destroy_reason === 'destroyed') {
    return sourceName === '未知来源' ? '被排掉（来源未明）' : `被 ${sourceName} 排掉`;
  }
  return '被排掉（来源未明）';
}

function getWardLifetimeSeconds(wardType: WardData['ward_type'] | WardPlacementRecord['type']): number {
  return wardType === 'sentry' ? SENTRY_WARD_LIFETIME_SECONDS : OBSERVER_WARD_LIFETIME_SECONDS;
}

function buildWardPlacementRecords(
  wardsResponse: WardsResponse | null,
  mapper: GameClockMapper
): WardPlacementRecord[] {
  if (!wardsResponse?.wards?.length) {
    return [];
  }

  const destroyedQueues = new Map<string, WardData[]>();
  for (const wardEvent of wardsResponse.wards) {
    if (wardEvent.type !== 'destroyed') {
      continue;
    }
    const queueKey = `${wardEvent.handle}:${wardEvent.ward_type}`;
    const queue = destroyedQueues.get(queueKey) ?? [];
    queue.push(wardEvent);
    destroyedQueues.set(queueKey, queue);
  }

  for (const queue of destroyedQueues.values()) {
    queue.sort((left, right) => mapper.getSourceTime(left) - mapper.getSourceTime(right));
  }

  return wardsResponse.wards
    .filter((wardEvent) => (
      wardEvent.type === 'placed' &&
      wardEvent.x !== undefined &&
      wardEvent.y !== undefined &&
      wardEvent.team !== undefined
    ))
    .sort((left, right) => mapper.getSourceTime(left) - mapper.getSourceTime(right))
    .map((placedWard) => {
      const placedSourceTime = mapper.getSourceTime(placedWard);
      const naturalExpireSourceTime = placedSourceTime + getWardLifetimeSeconds(placedWard.ward_type);
      const queueKey = `${placedWard.handle}:${placedWard.ward_type}`;
      const queue = destroyedQueues.get(queueKey) ?? [];
      let matchedDestroy: WardData | undefined;

      while (queue.length > 0) {
        const candidate = queue[0];
        const candidateSourceTime = mapper.getSourceTime(candidate);
        if (candidateSourceTime < placedSourceTime) {
          queue.shift();
          continue;
        }
        matchedDestroy = queue.shift();
        break;
      }

      const matchedDestroySourceTime = matchedDestroy ? mapper.getSourceTime(matchedDestroy) : Number.POSITIVE_INFINITY;
      const removalKind =
        matchedDestroy && matchedDestroy.destroy_reason !== 'expired' && matchedDestroySourceTime <= naturalExpireSourceTime
          ? 'destroyed'
          : 'expired';
      const removalSourceTime =
        removalKind === 'destroyed'
          ? matchedDestroySourceTime
          : naturalExpireSourceTime;
      const placedGameTime =
        typeof placedWard.game_time === 'number' && Number.isFinite(placedWard.game_time)
          ? placedWard.game_time
          : mapper.sourceToGameClock(placedSourceTime);
      const naturalExpireGameTime = mapper.sourceToGameClock(naturalExpireSourceTime);
      const removalGameTime =
        removalKind === 'destroyed' && matchedDestroy && typeof matchedDestroy.game_time === 'number' && Number.isFinite(matchedDestroy.game_time)
          ? matchedDestroy.game_time
          : mapper.sourceToGameClock(removalSourceTime);

      return {
        instanceKey: `${placedWard.handle}:${placedWard.tick}:${placedSourceTime}:${placedWard.ward_type}`,
        handle: placedWard.handle,
        type: placedWard.ward_type,
        team: placedWard.team === 2 ? 'radiant' : 'dire',
        x: placedWard.x ?? 0,
        y: placedWard.y ?? 0,
        placedSourceTime,
        placedGameTime,
        naturalExpireSourceTime,
        naturalExpireGameTime,
        removalSourceTime,
        removalGameTime,
        removalKind,
        destroyerName: matchedDestroy?.destroyer_name,
        destroyerKind: matchedDestroy?.destroyer_kind,
        destroyerTeam: matchedDestroy?.destroyer_team,
        destroyerLabel: removalKind === 'destroyed' ? getWardDestroyerLabel(matchedDestroy) : '自然到时',
        lifetimeSeconds: Math.max(0, removalSourceTime - placedSourceTime),
        placerHeroName:
          ('placer_name' in placedWard && typeof placedWard.placer_name === 'string'
            ? placedWard.placer_name
            : undefined)
          ?? ('placer_name' in (matchedDestroy ?? {}) && typeof matchedDestroy?.placer_name === 'string'
            ? matchedDestroy?.placer_name
            : undefined),
        placerHandle:
          ('placer_handle' in placedWard && typeof placedWard.placer_handle === 'number'
            ? placedWard.placer_handle
            : undefined)
          ?? ('placer_handle' in (matchedDestroy ?? {}) && typeof matchedDestroy?.placer_handle === 'number'
            ? matchedDestroy?.placer_handle
            : undefined),
        placerSource:
          (('placer_name' in placedWard && typeof placedWard.placer_name === 'string')
            || ('placer_name' in (matchedDestroy ?? {}) && typeof matchedDestroy?.placer_name === 'string'))
            ? 'parser'
            : undefined,
      };
    });
}

function findTicksForSourceTime(
  ticks: TickData[],
  mapper: Pick<GameClockMapper, 'getSourceTime'>,
  sourceTime: number
): { prev: TickData | null; next: TickData | null; t: number } {
  if (ticks.length === 0) {
    return { prev: null, next: null, t: 0 };
  }

  if (sourceTime <= mapper.getSourceTime(ticks[0])) {
    return { prev: ticks[0], next: ticks[0], t: 0 };
  }

  if (sourceTime >= mapper.getSourceTime(ticks[ticks.length - 1])) {
    return { prev: ticks[ticks.length - 1], next: ticks[ticks.length - 1], t: 0 };
  }

  let left = 0;
  let right = ticks.length - 1;

  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2);
    if (mapper.getSourceTime(ticks[mid]) <= sourceTime) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  const prevTick = ticks[left];
  const nextTick = ticks[Math.min(left + 1, ticks.length - 1)];
  const prevTime = mapper.getSourceTime(prevTick);
  const nextTime = mapper.getSourceTime(nextTick);
  const timeDiff = nextTime - prevTime;

  return {
    prev: prevTick,
    next: nextTick,
    t: timeDiff > 0 ? (sourceTime - prevTime) / timeDiff : 0,
  };
}

function inferWardPlacer(
  record: WardPlacementRecord,
  ticks: TickData[],
  mapper: Pick<GameClockMapper, 'getSourceTime'>
): Pick<WardPlacementRecord, 'placerHeroName' | 'placerHandle' | 'placerSource' | 'placerDistance'> | null {
  const { prev, next, t } = findTicksForSourceTime(ticks, mapper, record.placedSourceTime);
  if (!prev) {
    return null;
  }

  const candidates = prev.heroes
    .filter((hero) => (
      (hero.team === 2 ? 'radiant' : hero.team === 3 ? 'dire' : null) === record.team
    ))
    .map((prevHero) => {
      const nextHero = next?.heroes.find((hero) => hero.handle === prevHero.handle) ?? prevHero;
      const x = prev === next ? prevHero.x : lerp(prevHero.x, nextHero.x, t);
      const y = prev === next ? prevHero.y : lerp(prevHero.y, nextHero.y, t);
      const hp = prev === next
        ? (prevHero.hp ?? 0)
        : lerp(prevHero.hp ?? 0, nextHero.hp ?? 0, t);
      const dx = x - record.x;
      const dy = y - record.y;

      return {
        handle: prevHero.handle,
        heroName: prevHero.hero,
        distance: Math.sqrt(dx * dx + dy * dy),
        hp,
      };
    })
    .filter((candidate) => candidate.hp > 0)
    .sort((left, right) => left.distance - right.distance);

  const bestCandidate = candidates[0];
  if (!bestCandidate) {
    return null;
  }

  return {
    placerHeroName: bestCandidate.heroName,
    placerHandle: bestCandidate.handle,
    placerSource: 'inferred',
    placerDistance: bestCandidate.distance,
  };
}

function enrichWardPlacementRecordsWithPlacers(
  records: WardPlacementRecord[],
  ticks: TickData[],
  mapper: Pick<GameClockMapper, 'getSourceTime'>
): WardPlacementRecord[] {
  return records.map((record) => {
    if (record.placerHeroName) {
      return record;
    }

    const inferredPlacer = inferWardPlacer(record, ticks, mapper);
    return inferredPlacer ? { ...record, ...inferredPlacer } : record;
  });
}

function isWardActiveAtTime(record: WardPlacementRecord, sourceTime: number): boolean {
  return sourceTime >= record.placedSourceTime && sourceTime < record.removalSourceTime;
}

function getWardPlacementLabel(record: Pick<WardPlacementRecord, 'team' | 'type'>): string {
  const teamLabel = record.team === 'radiant' ? '天辉' : '夜魇';
  const wardLabel = record.type === 'observer' ? '假眼' : '真眼';
  return `${teamLabel}${wardLabel}`;
}

function getWardCoordinateLabel(record: Pick<WardPlacementRecord, 'x' | 'y'>): string {
  return `${Math.round(record.x)}, ${Math.round(record.y)}`;
}

function getWardRemovalLabel(record: WardPlacementRecord): string {
  if (record.removalKind === 'expired') {
    return `${formatGameClockTime(record.removalGameTime)} 自然到时`;
  }
  return `${formatGameClockTime(record.removalGameTime)} ${record.destroyerLabel}`;
}

function toMapWard(record: WardPlacementRecord, currentSourceTime: number): Ward {
  const isActive = isWardActiveAtTime(record, currentSourceTime);
  return {
    instanceKey: record.instanceKey,
    type: record.type,
    team: record.team,
    x: record.x,
    y: record.y,
    handle: record.handle,
    placed: isActive,
    placedSourceTime: record.placedSourceTime,
    placedGameTime: record.placedGameTime,
    removalSourceTime: record.removalSourceTime,
    removalGameTime: record.removalGameTime,
    removalKind: record.removalKind,
    destroyerName: record.destroyerName,
    destroyerKind: record.destroyerKind,
    destroyerTeam: record.destroyerTeam,
    destroyerLabel: record.destroyerLabel,
    lifetimeSeconds: record.lifetimeSeconds,
    activeAtCurrentTime: isActive,
  };
}

function getWardPopoverPosition(anchorX: number, anchorY: number, wardCount: number): {
  left: number;
  top: number;
  placeAbove: boolean;
  alignRight: boolean;
  maxWidth: number;
} {
  if (typeof window === 'undefined') {
    return {
      left: anchorX,
      top: anchorY,
      placeAbove: false,
      alignRight: false,
      maxWidth: 360,
    };
  }

  const viewportPadding = 16;
  const estimatedWidth = Math.min(
    wardCount > 1 ? 660 : 360,
    Math.max(320, window.innerWidth - viewportPadding * 2)
  );
  const estimatedHeight = Math.min(wardCount > 1 ? 440 : 280, window.innerHeight - viewportPadding * 2);
  const placeAbove = anchorY + estimatedHeight + WARD_TOOLTIP_OFFSET_PX > window.innerHeight - viewportPadding;
  const alignRight = anchorX + estimatedWidth + WARD_TOOLTIP_OFFSET_PX > window.innerWidth - viewportPadding;
  const left = alignRight
    ? clamp(anchorX - estimatedWidth - WARD_TOOLTIP_OFFSET_PX, viewportPadding, window.innerWidth - estimatedWidth - viewportPadding)
    : clamp(anchorX + WARD_TOOLTIP_OFFSET_PX, viewportPadding, window.innerWidth - estimatedWidth - viewportPadding);
  const top = placeAbove
    ? clamp(anchorY - WARD_TOOLTIP_OFFSET_PX, estimatedHeight + viewportPadding, window.innerHeight - viewportPadding)
    : clamp(anchorY + WARD_TOOLTIP_OFFSET_PX, viewportPadding, window.innerHeight - estimatedHeight - viewportPadding);

  return {
    left,
    top,
    placeAbove,
    alignRight,
    maxWidth: estimatedWidth,
  };
}

function getPreferredPlayerDisplayName(
  hero: Pick<TeamHeroPortrait, 'displayName' | 'proName' | 'personaName' | 'playerName' | 'accountId'>,
  isProfessionalMatch: boolean
): string | null {
  if (isProfessionalMatch) {
    return (
      hero.displayName?.trim() ||
      hero.proName?.trim() ||
      hero.playerName?.trim() ||
      (typeof hero.accountId === 'number' ? String(hero.accountId) : null)
    );
  }

  return (
    hero.displayName?.trim() ||
    hero.personaName?.trim() ||
    hero.playerName?.trim() ||
    (typeof hero.accountId === 'number' ? String(hero.accountId) : null)
  );
}

function isNumericDisplayName(value: string | null | undefined): boolean {
  return Boolean(value?.trim() && /^\d+$/.test(value.trim()));
}

function getPlayerDisplayTypeLabel(displayType: string | null | undefined, isProfessionalMatch: boolean): string {
  const normalizedDisplayType = displayType?.trim().toLowerCase();

  if (normalizedDisplayType === 'pro_name') {
    return '职业名';
  }
  if (normalizedDisplayType === 'persona_name') {
    return '玩家昵称';
  }

  return isProfessionalMatch ? '职业标识' : '玩家标识';
}

function getPlayerDisplayMeta(
  hero: Pick<TeamHeroPortrait, 'displayType' | 'accountId'>,
  isProfessionalMatch: boolean,
  playerDisplayName: string | null
): string | null {
  const normalizedPlayerDisplayName = playerDisplayName?.trim() || null;
  const normalizedDisplayType = hero.displayType?.trim().toLowerCase();

  if (
    normalizedPlayerDisplayName &&
    isNumericDisplayName(normalizedPlayerDisplayName) &&
    (normalizedDisplayType === 'pro_name' || normalizedDisplayType === 'persona_name')
  ) {
    return `玩家 ID ${normalizedPlayerDisplayName}`;
  }

  const metaParts: string[] = [getPlayerDisplayTypeLabel(hero.displayType, isProfessionalMatch)];

  if (typeof hero.accountId === 'number') {
    const accountIdText = `玩家 ID ${hero.accountId}`;
    if (normalizedPlayerDisplayName !== String(hero.accountId)) {
      metaParts.push(accountIdText);
    }
  }

  return metaParts.join(' · ');
}

function ItemIcon({ itemName, className = 'h-full w-full' }: { itemName: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const normalizedItemName = normalizeItemName(itemName);
  const label = getItemLabel(itemName);
  const iconCandidates = getItemIconCandidates(itemName);

  useEffect(() => {
    setBroken(false);
    setCandidateIndex(0);
  }, [itemName]);

  if (!normalizedItemName) {
    return (
      <div className={`flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-700 bg-slate-900/70 text-[10px] font-semibold text-slate-500 ${className}`}>
        --
      </div>
    );
  }

  if (broken) {
    return (
      <div
        title={label}
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-900/80 px-1 text-[10px] font-semibold text-slate-200 ${className}`}
      >
        {getItemFallbackShortLabel(itemName)}
      </div>
    );
  }

  return (
    <img
      src={iconCandidates[candidateIndex]}
      alt={`${label} 图标`}
      title={label}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => {
        if (candidateIndex < iconCandidates.length - 1) {
          setCandidateIndex((current) => current + 1);
          return;
        }
        setBroken(true);
      }}
      className={`block h-full w-full overflow-hidden rounded-md border border-slate-700/80 bg-slate-950/95 object-contain p-0 shadow-[0_4px_12px_rgba(2,6,23,0.28)] ${className}`}
    />
  );
}

function ItemTooltipCard({
  slotId,
  tooltipData,
}: {
  slotId: string;
  tooltipData: NonNullable<ReturnType<typeof getItemTooltipData>>;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/90 bg-slate-950/96 p-3 shadow-[0_24px_48px_rgba(2,6,23,0.65)] backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-50">{tooltipData.name}</p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5 text-slate-200">
              {tooltipData.categoryLabel}
            </span>
            {tooltipData.tierLabel && (
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                {tooltipData.tierLabel}
              </span>
            )}
            {tooltipData.enhancement && (
              <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                附魔：{tooltipData.enhancement.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 text-[10px] text-slate-300">
          {tooltipData.costLabel && (
            <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5">
              售价 {tooltipData.costLabel}
            </span>
          )}
          {tooltipData.manaCostLabel && (
            <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5">
              法力 {tooltipData.manaCostLabel}
            </span>
          )}
          {tooltipData.cooldownLabel && (
            <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2 py-0.5">
              冷却 {tooltipData.cooldownLabel}
            </span>
          )}
        </div>
      </div>

      {tooltipData.attributes.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">属性</p>
          <div className="mt-1.5 space-y-1">
            {tooltipData.attributes.map((line) => (
              <p key={`${slotId}-${line}`} className="text-[11px] leading-5 text-slate-200">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {tooltipData.abilities.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">效果</p>
          <div className="mt-1.5 space-y-2">
            {tooltipData.abilities.map((ability) => (
              <div key={`${slotId}-${ability.typeLabel}-${ability.title}`}>
                <p className="text-[11px] font-medium text-slate-100">
                  {ability.typeLabel} · {ability.title}
                </p>
                {ability.summary && <p className="mt-1 text-[11px] leading-5 text-slate-300">{ability.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tooltipData.enhancement && (
        <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-2.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
              附魔
            </span>
            <p className="text-[12px] font-semibold text-amber-50">{tooltipData.enhancement.name}</p>
          </div>
          {tooltipData.enhancement.attributes.length > 0 && (
            <div className="mt-2 space-y-1">
              {tooltipData.enhancement.attributes.map((line) => (
                <p key={`${slotId}-${tooltipData.enhancement?.name}-${line}`} className="text-[11px] leading-5 text-amber-50/90">
                  {line}
                </p>
              ))}
            </div>
          )}
          {tooltipData.enhancement.abilities.length > 0 && (
            <div className="mt-2 space-y-2">
              {tooltipData.enhancement.abilities.map((ability) => (
                <div key={`${slotId}-${tooltipData.enhancement?.name}-${ability.title}`}>
                  <p className="text-[11px] font-medium text-amber-50">
                    {ability.typeLabel} · {ability.title}
                  </p>
                  {ability.summary && <p className="mt-1 text-[11px] leading-5 text-amber-50/85">{ability.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tooltipData.notes.length > 0 && (
        <div className="mt-3 border-t border-slate-800/80 pt-2">
          {tooltipData.notes.map((note) => (
            <p key={`${slotId}-${note}`} className="text-[10px] leading-5 text-slate-500">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemSlot({
  itemName,
  slotId,
  enhancementName,
  sizeClass = 'w-full aspect-[3/2]',
  variant = 'inventory',
}: {
  itemName?: string;
  slotId: string;
  enhancementName?: string;
  sizeClass?: string;
  variant?: 'inventory' | 'backpack' | 'neutral';
}) {
  const label = itemName ? getItemLabel(itemName) : '空位';
  const hiddenReplayItem = itemName ? isHiddenReplayItem(itemName) : false;
  const hiddenReplayId = itemName ? normalizeItemName(itemName) : '';
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number; placeAbove: boolean } | null>(
    null
  );
  const tooltipData =
    itemName && !hiddenReplayItem
      ? getItemTooltipData(itemName, {
          enhancementName: variant === 'neutral' ? enhancementName ?? null : null,
        })
      : null;
  const shellClass =
    variant === 'neutral'
      ? enhancementName
        ? 'border-amber-400/35 bg-amber-500/8 shadow-[0_0_0_1px_rgba(251,191,36,0.14)]'
        : 'border-amber-500/25 bg-amber-500/5'
      : variant === 'backpack'
        ? 'border-slate-700/70 bg-slate-950/70'
        : 'border-slate-700/80 bg-slate-950/80';
  const emptyShellClass =
    variant === 'neutral'
      ? 'border-amber-500/20 bg-slate-950/65'
      : 'border-slate-700/70 bg-slate-950/55';

  useEffect(() => {
    if (!tooltipOpen || !tooltipData || !slotRef.current || typeof window === 'undefined') {
      setTooltipPosition(null);
      return;
    }

    const updateTooltipPosition = () => {
      if (!slotRef.current) {
        return;
      }

      const rect = slotRef.current.getBoundingClientRect();
      const tooltipWidth = 320;
      const viewportPadding = 12;
      const verticalOffset = 12;
      const estimatedTooltipHeight = tooltipData.enhancement ? 380 : 300;
      const nextLeft = Math.min(
        Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, viewportPadding),
        window.innerWidth - tooltipWidth - viewportPadding
      );
      const placeAbove =
        rect.bottom + verticalOffset + estimatedTooltipHeight > window.innerHeight - viewportPadding &&
        rect.top > estimatedTooltipHeight + viewportPadding;

      setTooltipPosition({
        left: nextLeft,
        top: placeAbove ? rect.top - verticalOffset : rect.bottom + verticalOffset,
        placeAbove,
      });
    };

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);

    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [tooltipData, tooltipOpen]);

  if (!itemName) {
    return (
      <div
        key={slotId}
        title={label}
        className={`min-w-0 rounded-lg border border-dashed ${emptyShellClass} p-0.5`}
      >
        <div className={sizeClass}>
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-700/70 bg-slate-950/80 text-[10px] font-semibold text-slate-500">
            --
          </div>
        </div>
      </div>
    );
  }

  if (hiddenReplayItem) {
    return (
      <div
        key={slotId}
        title={label}
        className="min-w-0 rounded-lg border border-amber-500/30 bg-amber-500/5 p-1"
      >
        <div className={sizeClass}>
          <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-md border border-amber-500/20 bg-slate-950/90 px-2 text-center">
            <span className="text-[9px] uppercase tracking-[0.16em] text-amber-200/75">隐藏 ID</span>
            <span className="mt-1 break-all font-mono text-[10px] leading-4 text-amber-100">{hiddenReplayId}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={slotRef}
      key={slotId}
      title={label}
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
      className={`relative min-w-0 rounded-lg border p-0.5 transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(8,15,34,0.3)] ${shellClass}`}
    >
      <div className={sizeClass}>
        <ItemIcon itemName={itemName} className="h-full w-full" />
      </div>
      {tooltipData &&
        tooltipOpen &&
        tooltipPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid={`item-tooltip-${slotId}`}
            className="pointer-events-none fixed z-[200] w-80"
            style={{
              left: tooltipPosition.left,
              top: tooltipPosition.top,
              transform: tooltipPosition.placeAbove ? 'translateY(-100%)' : undefined,
            }}
          >
            <ItemTooltipCard slotId={slotId} tooltipData={tooltipData} />
          </div>,
          document.body
        )}
    </div>
  );
}

function HeroMultiSelect({
  options,
  selectedHeroes,
  onToggleHero,
  onClear,
  dataTestIdPrefix,
  allLabel,
}: {
  options: HeroSelectionOption[];
  selectedHeroes: string[];
  onToggleHero: (heroName: string) => void;
  onClear: () => void;
  dataTestIdPrefix: string;
  allLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">英雄筛选</p>
        <button
          type="button"
          data-testid={`${dataTestIdPrefix}-hero-clear`}
          aria-pressed={selectedHeroes.length === 0}
          onClick={onClear}
          className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
            selectedHeroes.length === 0
              ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
              : 'border-slate-700 bg-slate-950/80 text-slate-300 hover:border-slate-500 hover:text-slate-100'
          }`}
        >
          {allLabel}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedHeroes.includes(option.value);
          const teamAccentClass =
            option.team === 'radiant'
              ? selected
                ? 'border-emerald-400/55 bg-emerald-500/12 text-emerald-50'
                : 'border-emerald-500/20 bg-slate-950/75 text-slate-200 hover:border-emerald-400/40'
              : selected
                ? 'border-rose-400/55 bg-rose-500/12 text-rose-50'
                : 'border-rose-500/20 bg-slate-950/75 text-slate-200 hover:border-rose-400/40';

          return (
            <button
              key={`${dataTestIdPrefix}-${option.value}`}
              type="button"
              data-testid={`${dataTestIdPrefix}-hero-${normalizeHeroLookupKey(option.value)}`}
              aria-pressed={selected}
              onClick={() => onToggleHero(option.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] transition ${teamAccentClass}`}
            >
              <span className="h-6 w-6 overflow-hidden rounded-full border border-slate-700/80 bg-slate-950/95">
                <img src={option.portraitUrl} alt={option.label} className="h-full w-full object-contain" />
              </span>
              <span className="max-w-[84px] truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function extractHudItemSlots(items: Array<string | null | undefined>): HudItemSlots {
  const normalizedItems = items.map((item) => {
    if (typeof item !== 'string') {
      return null;
    }
    const trimmed = item.trim();
    return trimmed ? trimmed : null;
  });

  const inventory = Array.from({ length: 6 }, (_, index) => normalizedItems[index] ?? null);
  const backpack = Array.from({ length: 3 }, (_, index) => normalizedItems[index + 6] ?? null);

  const hasExplicitNeutralSlot =
    normalizedItems.length > 16 ||
    normalizedItems.some((item, index) => index === 16 && item !== undefined);
  const explicitNeutral = hasExplicitNeutralSlot ? normalizedItems[16] ?? null : null;
  const explicitEnhancement =
    normalizedItems.length > 17 && normalizedItems[17] && isEnhancementItem(normalizedItems[17])
      ? normalizedItems[17]
      : null;

  let inferredNeutralIndex = -1;
  if (!hasExplicitNeutralSlot) {
    for (let index = normalizedItems.length - 1; index >= 9; index -= 1) {
      const candidate = normalizedItems[index];
      if (!candidate || isEnhancementItem(candidate)) {
        continue;
      }
      if (isLikelyNeutralItem(candidate)) {
        inferredNeutralIndex = index;
        break;
      }
    }
  }

  const neutral =
    explicitNeutral ??
    (inferredNeutralIndex >= 0 ? normalizedItems[inferredNeutralIndex] ?? null : null);

  const extraStashCount = normalizedItems.filter((item, index) => {
    if (!item || index < 9) {
      return false;
    }
    if (index === inferredNeutralIndex) {
      return false;
    }
    if (hasExplicitNeutralSlot && index === 16) {
      return false;
    }
    if (index === 17 && isEnhancementItem(item)) {
      return false;
    }
    return true;
  }).length;

  return {
    inventory,
    backpack,
    neutral,
    enhancement: explicitEnhancement,
    extraStashCount,
  };
}

function formatGameClockInput(value: number): string {
  if (!Number.isFinite(value)) {
    return '0:00';
  }

  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  const minutes = Math.floor(absolute / 60);
  const seconds = absolute % 60;

  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parseGameClockInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const sign = trimmed.startsWith('-') ? -1 : 1;
  const raw = trimmed.replace(/^[+-]/, '');

  if (raw.includes(':')) {
    const [minutesPart, secondsPart] = raw.split(':');
    if (!minutesPart || secondsPart === undefined) {
      return null;
    }

    const minutes = Number(minutesPart);
    const seconds = Number(secondsPart);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds < 0 || seconds >= 60) {
      return null;
    }

    return sign * (Math.abs(minutes) * 60 + seconds);
  }

  const numericMinutes = Number(raw);
  if (!Number.isFinite(numericMinutes)) {
    return null;
  }

  return sign * Math.round(Math.abs(numericMinutes) * 60);
}

function resolveVisualizationTimeRange(
  preset: VisualizationRangePreset,
  minSourceTime: number,
  maxSourceTime: number,
  mapper: GameClockMapper,
  customRange?: CustomVisualizationRange
): { startTime: number; endTime: number; error?: string | null } {
  const safeMin = Number.isFinite(minSourceTime) ? minSourceTime : 0;
  const safeMax = Number.isFinite(maxSourceTime) && maxSourceTime >= safeMin
    ? maxSourceTime
    : safeMin;

  const clampSourceTime = (value: number) => clamp(value, safeMin, safeMax);
  const toSourceRange = (startClock: number, endClock: number) => {
    const startTime = clampSourceTime(mapper.gameClockToSource(startClock));
    const endTime = clampSourceTime(mapper.gameClockToSource(endClock));
    return {
      startTime: Math.min(startTime, endTime),
      endTime: Math.max(startTime, endTime),
    };
  };

  if (preset === 'opening5') {
    return toSourceRange(0, 300);
  }

  if (preset === 'opening10') {
    return toSourceRange(0, 600);
  }

  if (preset === 'opening15') {
    return toSourceRange(0, 900);
  }

  if (preset === 'midgame15to25') {
    return toSourceRange(900, 1500);
  }

  if (preset === 'custom') {
    const startClock = parseGameClockInput(customRange?.start ?? '');
    const endClock = parseGameClockInput(customRange?.end ?? '');

    if (startClock === null || endClock === null) {
      return {
        startTime: safeMin,
        endTime: safeMax,
        error: '自定义区间格式不正确，请输入 mm:ss，例如 12:30 或 -1:30。',
      };
    }

    if (endClock <= startClock) {
      return {
        startTime: safeMin,
        endTime: safeMax,
        error: '自定义区间结束时间必须晚于开始时间。',
      };
    }

    return toSourceRange(startClock, endClock);
  }

  return { startTime: safeMin, endTime: safeMax };
}

function buildDenseHeatmapGrid(
  gridSize: number,
  maxDensity: number,
  cells: Array<{ grid_x: number; grid_y: number; density: number }>
): number[][] {
  const safeSize = Math.max(1, gridSize);
  const grid = Array.from({ length: safeSize }, () => Array(safeSize).fill(0));
  const normalizer = maxDensity > 0 ? maxDensity : 1;

  for (const cell of cells) {
    if (
      cell.grid_y < 0 ||
      cell.grid_y >= safeSize ||
      cell.grid_x < 0 ||
      cell.grid_x >= safeSize
    ) {
      continue;
    }
    grid[cell.grid_y][cell.grid_x] = cell.density / normalizer;
  }

  return grid;
}

function toPathOverlays(
  paths: Array<{ hero: string; team: number; points: Array<{ x: number; y: number }> }>
): PathOverlay[] {
  return paths
    .filter((path) => Array.isArray(path.points) && path.points.length > 1)
    .map((path) => ({
      hero_name: path.hero,
      team: path.team === 2 ? 'radiant' : 'dire',
      points: path.points.map((point) => ({
        x: point.x,
        y: point.y,
      })),
    }));
}

function extractTeamLineups(ticks: TickData[], players: MatchPlayer[] = []): TeamLineups {
  const radiantByHandle = new Map<number, TeamHeroPortrait>();
  const direByHandle = new Map<number, TeamHeroPortrait>();
  const playerLookup = buildMatchPlayerLookup(players);

  for (const tick of ticks) {
    for (const hero of tick.heroes) {
      const team = normalizeTeamSide(hero.team);
      if (!team) {
        continue;
      }

      const targetMap = team === 'radiant' ? radiantByHandle : direByHandle;
      if (targetMap.has(hero.handle) || targetMap.size >= 5) {
        continue;
      }

      const heroData = getHeroByName(hero.hero);
      const player = playerLookup.get(getTeamHeroKey(team, hero.hero));
      targetMap.set(hero.handle, {
        key: hero.handle,
        heroName: hero.hero,
        portraitUrl: heroData ? getHeroPortraitUrl(heroData.id) : DEFAULT_HERO_PORTRAIT_URL,
        team,
        displayName: player?.display_name ?? null,
        displayType: player?.display_type ?? null,
        proName: player?.pro_name ?? null,
        personaName: player?.persona_name ?? null,
        accountId: player?.account_id ?? null,
        playerName: player?.player_name ?? null,
      });
    }

    if (radiantByHandle.size >= 5 && direByHandle.size >= 5) {
      break;
    }
  }

  return {
    radiant: Array.from(radiantByHandle.values()).slice(0, TEAM_HERO_COUNT),
    dire: Array.from(direByHandle.values()).slice(0, TEAM_HERO_COUNT),
  };
}

function buildDeathIntervalsByHandle(
  ticks: TickData[],
  mapper: Pick<GameClockMapper, 'getSourceTime'>
): Map<number, DeathInterval[]> {
  const intervalsByHandle = new Map<number, DeathInterval[]>();
  const activeDeathStartByHandle = new Map<number, number>();
  const lastAliveByHandle = new Map<number, boolean>();
  const sortedTicks = [...ticks].sort((a, b) => mapper.getSourceTime(a) - mapper.getSourceTime(b));

  for (const tick of sortedTicks) {
    const sourceTime = mapper.getSourceTime(tick);
    if (!Number.isFinite(sourceTime)) {
      continue;
    }

    for (const hero of tick.heroes) {
      const isAlive = (hero.hp ?? 0) > 0;
      const hasLastAlive = lastAliveByHandle.has(hero.handle);
      const lastAlive = lastAliveByHandle.get(hero.handle) ?? isAlive;

      if (!hasLastAlive) {
        lastAliveByHandle.set(hero.handle, isAlive);
        if (!isAlive) {
          activeDeathStartByHandle.set(hero.handle, sourceTime);
        }
        continue;
      }

      if (lastAlive && !isAlive) {
        activeDeathStartByHandle.set(hero.handle, sourceTime);
      }

      if (!lastAlive && isAlive) {
        const deathStart = activeDeathStartByHandle.get(hero.handle);
        if (deathStart !== undefined && sourceTime > deathStart) {
          const intervals = intervalsByHandle.get(hero.handle) ?? [];
          intervals.push({
            startSourceTime: deathStart,
            endSourceTime: sourceTime,
          });
          intervalsByHandle.set(hero.handle, intervals);
        }
        activeDeathStartByHandle.delete(hero.handle);
      }

      lastAliveByHandle.set(hero.handle, isAlive);
    }
  }

  return intervalsByHandle;
}

/**
 * Extract kill events from tick data by detecting HP alive→dead transitions.
 * Returns kill markers with game_time coordinates for minimap display.
 */
function extractKillMarkersFromTicks(
  ticks: TickData[],
  mapper: Pick<GameClockMapper, 'getSourceTime'>,
): KillMarkerData[] {
  const kills: KillMarkerData[] = [];
  const lastAliveByHandle = new Map<number, boolean>();
  const lastPosByHandle = new Map<number, { x: number; y: number; team: number; hero: string }>();
  const sortedTicks = [...ticks].sort((a, b) => mapper.getSourceTime(a) - mapper.getSourceTime(b));

  for (const tick of sortedTicks) {
    const gameTime = getTickGameTime(tick);
    if (gameTime === null) {
      continue;
    }

    for (const hero of tick.heroes) {
      const isAlive = (hero.hp ?? 0) > 0;
      const wasAlive = lastAliveByHandle.get(hero.handle);

      // Record position when alive (for accurate death location)
      if (isAlive) {
        lastPosByHandle.set(hero.handle, {
          x: hero.x,
          y: hero.y,
          team: hero.team,
          hero: hero.hero,
        });
      }

      // Detect death: was alive, now dead
      if (wasAlive === true && !isAlive) {
        const lastPos = lastPosByHandle.get(hero.handle);
        if (lastPos) {
          kills.push({
            time: gameTime,
            victim: lastPos.hero,
            x: hero.x || lastPos.x,
            y: hero.y || lastPos.y,
            victimTeam: lastPos.team,
          });
        }
      }

      lastAliveByHandle.set(hero.handle, isAlive);
    }
  }

  return kills;
}

/** 线性插值函数 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTickGameTime(tick: TickData): number | null {
  return typeof tick.game_time === 'number' && Number.isFinite(tick.game_time)
    ? tick.game_time
    : null;
}

function getGameClockDisplayShift(mapper: GameClockMapper, ticks: TickData[]): number {
  if (ticks.length === 0) {
    return 0;
  }

  const firstTick = ticks[0];
  const firstRawGameTime = getTickGameTime(firstTick);
  if (firstRawGameTime === null) {
    return 0;
  }

  const firstSourceTime = mapper.getSourceTime(firstTick);
  return mapper.sourceToGameClock(firstSourceTime) - firstRawGameTime;
}

export interface RealMatchViewerProps {
  initialMatchId?: number | null;
  replayEntryContext?: ReplayEntryContext | null;
}

export function RealMatchViewer({ initialMatchId, replayEntryContext }: RealMatchViewerProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchDetail, setSelectedMatchDetail] = useState<MatchDetail | null>(null);
  const { selectedMatch, setSelectedMatch, currentTime, setCurrentTime, currentDisplayGameTime, setCurrentDisplayGameTime, isPauseActive, setIsPauseActive, loading, setLoading, error, setError } = usePlaybackStore();

  const [heroPositions, setHeroPositions] = useState<HeroPosition[]>([]);
  const [wardsResponse, setWardsResponse] = useState<WardsResponse | null>(null);
  const [objectivesResponse, setObjectivesResponse] = useState<ObjectivesResponse | null>(null);
  const [activeKillMarkers, setActiveKillMarkers] = useState<KillMarkerData[]>([]);
  const [showPaths, setShowPaths] = useState(false);


  const [timelineMinTime, setTimelineMinTime] = useState(0);
  const [timelineMaxTime, setTimelineMaxTime] = useState(DEFAULT_DURATION);



  const [showCalibration] = useState(false);
  const [timeBasisSource, setTimeBasisSource] = useState<'game_time' | 'fallback'>('fallback');
  const [, setTimeBasisStrategy] = useState<GameClockMapper['strategy']>('fallback_pre_game_anchor');
  const [timeBasisOffsetSeconds, setTimeBasisOffsetSeconds] = useState(0);
  const [teamLineups, setTeamLineups] = useState<TeamLineups>({ radiant: [], dire: [] });
  const [hudHeroStatus, setHudHeroStatus] = useState<Record<number, HudHeroStatus>>({});


  const [hudMetrics, setHudMetrics] = useState<HudHeroMetric[]>([]);
  const [hudMetricsLoading, setHudMetricsLoading] = useState(false);
  const [hudMetricsError, setHudMetricsError] = useState<string | null>(null);
  const [hudMetricsWarnings, setHudMetricsWarnings] = useState<string[]>([]);
  const [heatmapType, setHeatmapType] = useState<'none' | 'movement' | 'kill' | 'death'>('none');
  const [heatmapRangePreset, setHeatmapRangePreset] = useState<VisualizationRangePreset>('full');
  const [heatmapCustomRange, setHeatmapCustomRange] = useState<CustomVisualizationRange>({ start: '-1:30', end: '10:00' });
  const [heatmapHeroFilter, setHeatmapHeroFilter] = useState<string[]>([]);
  const [heatmapTeamFilter, setHeatmapTeamFilter] = useState<'all' | 'radiant' | 'dire'>('all');
  const [heatmapGrid, setHeatmapGrid] = useState<number[][] | null>(null);
  const [heatmapBounds, setHeatmapBounds] = useState<HeatmapBounds | null>(null);
  const [heatmapSummary, setHeatmapSummary] = useState<HeatmapSummary | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [pathOverlays, setPathOverlays] = useState<PathOverlay[] | null>(null);
  const [pathRangePreset, setPathRangePreset] = useState<VisualizationRangePreset>('full');
  const [pathCustomRange, setPathCustomRange] = useState<CustomVisualizationRange>({ start: '-1:30', end: '10:00' });
  const [pathHeroFilter, setPathHeroFilter] = useState<string[]>([]);
  const [pathSimplify, setPathSimplify] = useState(true);
  const [pathEpsilon, setPathEpsilon] = useState(100);
  const [pathSummary, setPathSummary] = useState<PathSummary | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [visionRangePreset, setVisionRangePreset] = useState<VisualizationRangePreset>('full');
  const [visionCustomRange, setVisionCustomRange] = useState<CustomVisualizationRange>({ start: '-1:30', end: '10:00' });
  const [visionTeamFilter, setVisionTeamFilter] = useState<WardTeamFilter>('all');
  const [visionWardTypeFilter, setVisionWardTypeFilter] = useState<WardTypeFilter>('all');
  const [visionMapMode, setVisionMapMode] = useState<WardMapMode>('current');
  const [hoveredWardPreview, setHoveredWardPreview] = useState<WardPopoverState | null>(null);
  const [pinnedWardPreview, setPinnedWardPreview] = useState<WardPopoverState | null>(null);
  const [cleanMapForHeroFocus, setCleanMapForHeroFocus] = useState(true);
  const [mapWorkbenchExpanded, setMapWorkbenchExpanded] = useState(false);
  const [mapWorkbenchRendered, setMapWorkbenchRendered] = useState(false);
  const [matchPickerOpen, setMatchPickerOpen] = useState(false);
  const [matchPickerQuery, setMatchPickerQuery] = useState('');
  const [replayContextWarning, setReplayContextWarning] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );
  const [mapOverlayPanels, setMapOverlayPanels] = useState<Record<MapOverlayPanelKey, MapOverlayPanelState>>(
    () => createDefaultMapOverlayPanels(620)
  );
  const [draggingMapOverlayPanel, setDraggingMapOverlayPanel] = useState<MapOverlayPanelKey | null>(null);
  const [reparseTask, setReparseTask] = useState<ParseTask | null>(null);
  const [reparseFeedback, setReparseFeedback] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  const allTicksRef = useRef<TickData[]>([]);
  const allWardsRef = useRef<WardsResponse | null>(null);
  const gameClockMapperRef = useRef<GameClockMapper>(createGameClockMapper([]));
  const deathIntervalsRef = useRef<Map<number, DeathInterval[]>>(new Map());
  const killMarkersRef = useRef<KillMarkerData[]>([]);
  const selectedMatchRef = useRef<number | null>(selectedMatch ?? null);
  const currentTimeRef = useRef<number>(currentTime);
  const preferredMatchIdRef = useRef<number | null>(initialMatchId ?? null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hudRequestAbortControllerRef = useRef<AbortController | null>(null);
  const hudThrottleTimeoutRef = useRef<number | null>(null);
  const pendingHudSourceTimeRef = useRef<number | null>(null);
  const lastHudRequestAtRef = useRef(0);
  const hudRequestSequenceRef = useRef(0);
  const hasHudMetricsDataRef = useRef(false);
  const mapOverlayContainerRef = useRef<HTMLDivElement | null>(null);
  const matchPickerRef = useRef<HTMLDivElement | null>(null);
  const mapOverlayPanelRefs = useRef<Record<MapOverlayPanelKey, HTMLDivElement | null>>({
    insight: null,
    legend: null,
  });
  const mapOverlayDragStateRef = useRef<MapOverlayPanelDragState | null>(null);
  const hasInitializedMapOverlayPanelsRef = useRef(false);

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (mapWorkbenchExpanded) {
      setMapWorkbenchRendered(true);
      return;
    }

    if (!mapWorkbenchRendered) {
      return;
    }

    const timeoutId = window.setTimeout(() => setMapWorkbenchRendered(false), 240);
    return () => window.clearTimeout(timeoutId);
  }, [mapWorkbenchExpanded, mapWorkbenchRendered]);

  useEffect(() => {
    if (!matchPickerOpen || typeof window === 'undefined') {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!matchPickerRef.current?.contains(event.target as Node)) {
        setMatchPickerOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMatchPickerOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [matchPickerOpen]);

  useEffect(() => {
    selectedMatchRef.current = selectedMatch ?? null;
  }, [selectedMatch]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (initialMatchId === undefined || initialMatchId === null) {
      return;
    }

    preferredMatchIdRef.current = initialMatchId;
    selectedMatchRef.current = initialMatchId;
    setSelectedMatch(initialMatchId);
  }, [initialMatchId, setSelectedMatch]);

  useEffect(() => {
    if (
      replayEntryContext?.source === 'match_database' ||
      replayEntryContext?.source === 'replay_library'
    ) {
      preferredMatchIdRef.current = replayEntryContext.matchId;
      selectedMatchRef.current = replayEntryContext.matchId;
      setSelectedMatch(replayEntryContext.matchId);
    }
  }, [replayEntryContext, setSelectedMatch]);

  const replaySourceStatusText = replayEntryContext?.downloadStatus
    ? replayEntryContext.downloadStatus
    : null;

  const clearPendingHudRequest = useCallback(() => {
    if (hudThrottleTimeoutRef.current !== null) {
      window.clearTimeout(hudThrottleTimeoutRef.current);
      hudThrottleTimeoutRef.current = null;
    }
    pendingHudSourceTimeRef.current = null;
    hudRequestAbortControllerRef.current?.abort();
    hudRequestAbortControllerRef.current = null;
  }, []);

  const fetchHudMetricsForSourceTime = useCallback(async (sourceTime: number) => {
    if (!selectedMatch) {
      return;
    }

    const mapper = gameClockMapperRef.current;
    const gameTime = mapper.sourceToGameClock(sourceTime);
    if (!Number.isFinite(gameTime)) {
      return;
    }

    hudRequestAbortControllerRef.current?.abort();
    const requestController = new AbortController();
    hudRequestAbortControllerRef.current = requestController;
    const requestSequence = ++hudRequestSequenceRef.current;

    const shouldShowHudMetricsLoading = !hasHudMetricsDataRef.current;
    if (shouldShowHudMetricsLoading) {
      setHudMetricsLoading(true);
    }

    try {
      const response = await backendAPI.getHudMetrics(selectedMatch, {
        gameTime,
        signal: requestController.signal,
      });

      if (requestController.signal.aborted || requestSequence !== hudRequestSequenceRef.current) {
        return;
      }

      if (!response || !Array.isArray(response.heroes)) {
        setHudMetricsError('HUD 指标请求失败，不影响主回放。');
        return;
      }

      hasHudMetricsDataRef.current = true;
      setHudMetrics(response.heroes.slice(0, HUD_VISIBLE_ROW_COUNT));
      setHudMetricsError(null);
      setHudMetricsWarnings([
        ...(Array.isArray(response.warnings) ? response.warnings : []),
        ...(typeof response.message === 'string' && response.message.trim() ? [response.message.trim()] : []),
      ].filter((warning, index, array) => array.indexOf(warning) === index));
    } catch (error) {
      if (requestController.signal.aborted || requestSequence !== hudRequestSequenceRef.current) {
        return;
      }

      setHudMetricsError('HUD 指标请求失败，不影响主回放。');
      console.error('Failed to fetch HUD metrics:', error);
    } finally {
      if (
        shouldShowHudMetricsLoading &&
        !requestController.signal.aborted &&
        requestSequence === hudRequestSequenceRef.current
      ) {
        setHudMetricsLoading(false);
      }
    }
  }, [selectedMatch]);

  const scheduleHudMetricsFetch = useCallback((sourceTime: number) => {
    if (!selectedMatch || !Number.isFinite(sourceTime)) {
      return;
    }

    pendingHudSourceTimeRef.current = sourceTime;
    const now = Date.now();
    const elapsed = now - lastHudRequestAtRef.current;

    if (elapsed >= HUD_REQUEST_THROTTLE_MS) {
      lastHudRequestAtRef.current = now;
      const immediateSourceTime = pendingHudSourceTimeRef.current;
      pendingHudSourceTimeRef.current = null;
      if (immediateSourceTime !== null) {
        void fetchHudMetricsForSourceTime(immediateSourceTime);
      }
      return;
    }

    if (hudThrottleTimeoutRef.current !== null) {
      return;
    }

    hudThrottleTimeoutRef.current = window.setTimeout(() => {
      hudThrottleTimeoutRef.current = null;
      lastHudRequestAtRef.current = Date.now();
      const nextSourceTime = pendingHudSourceTimeRef.current;
      pendingHudSourceTimeRef.current = null;
      if (nextSourceTime !== null) {
        void fetchHudMetricsForSourceTime(nextSourceTime);
      }
    }, HUD_REQUEST_THROTTLE_MS - elapsed);
  }, [fetchHudMetricsForSourceTime, selectedMatch]);

  const resolvePreferredMatchId = (matchList: Match[]): number | null => {
    if (matchList.length === 0) {
      return null;
    }

    const candidateIds = [
      preferredMatchIdRef.current,
      selectedMatchRef.current,
    ].filter((matchId): matchId is number => typeof matchId === 'number' && Number.isFinite(matchId));

    for (const matchId of candidateIds) {
      if (matchList.some((match) => match.match_id === matchId)) {
        return matchId;
      }
    }

    return matchList[0]?.match_id ?? null;
  };

  const loadMatches = async () => {
    setLoading(true);
    try {
      const matchList = await backendAPI.getMatchList(100, 0);
      setMatches(matchList);

      const nextSelectedMatchId = resolvePreferredMatchId(matchList);
      const preferredMatchId = preferredMatchIdRef.current;
      const preferredMatchAvailable =
        typeof preferredMatchId === 'number' &&
        matchList.some((match) => match.match_id === preferredMatchId);

      if (
        replayEntryContext &&
        typeof preferredMatchId === 'number' &&
        !preferredMatchAvailable &&
        matchList.length > 0
      ) {
        setReplayContextWarning(
          `目标比赛 ${preferredMatchId} 当前不在本地已解析列表中，已切换到最近可用回放。`
        );
      } else {
        setReplayContextWarning(null);
      }

      if (nextSelectedMatchId !== null && nextSelectedMatchId !== selectedMatchRef.current) {
        selectedMatchRef.current = nextSelectedMatchId;
        setSelectedMatch(nextSelectedMatchId);
      }
    } catch (err) {
      setError('加载比赛列表失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllMatchData = async (matchId: number, options?: LoadMatchDataOptions) => {
    const preserveAnalysisState = options?.preserveAnalysisState ?? false;
    const preserveCurrentTime = options?.preserveCurrentTime ?? false;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setSelectedMatchDetail(null);
    setTimeBasisSource('fallback');
    setTimeBasisStrategy('fallback_pre_game_anchor');
    setTimeBasisOffsetSeconds(0);
    setTeamLineups({ radiant: [], dire: [] });
    setHudHeroStatus({});
    setIsPauseActive(false);
    setCurrentDisplayGameTime(DEFAULT_INITIAL_GAME_CLOCK_SECONDS);
    setHudMetrics([]);
    setHudMetricsError(null);
    setHudMetricsWarnings([]);
    setHudMetricsLoading(false);
    setWardsResponse(null);
    setObjectivesResponse(null);
    setHoveredWardPreview(null);
    setPinnedWardPreview(null);
    hasHudMetricsDataRef.current = false;
    clearPendingHudRequest();
    allTicksRef.current = [];
    allWardsRef.current = null;
    deathIntervalsRef.current = new Map();
    killMarkersRef.current = [];
    if (!preserveAnalysisState) {
      setHeatmapType('none');
      setHeatmapHeroFilter([]);
      setHeatmapTeamFilter('all');
      setPathHeroFilter([]);
      setHeatmapGrid(null);
      setHeatmapBounds(null);
      setHeatmapSummary(null);
      setPathSummary(null);
    }

    try {
      const [matchDetail, matchPlayers] = await Promise.all([
        backendAPI.getMatchDetail(matchId),
        backendAPI.getMatchPlayers(matchId),
      ]);
      setSelectedMatchDetail(matchDetail);
      const duration = matchDetail?.duration || DEFAULT_DURATION;

      console.log(`[RealMatchViewer] 加载比赛 ${matchId} 的完整数据...`);
      const fullData = await backendAPI.getHeroPositions(
        matchId,
        -PRE_GAME_FETCH_SECONDS,
        duration + POST_GAME_FETCH_BUFFER_SECONDS
      );

      if (fullData?.ticks) {
        allTicksRef.current = fullData.ticks;
        setTeamLineups(extractTeamLineups(fullData.ticks, matchPlayers));
        console.log(`[RealMatchViewer] 已加载 ${fullData.ticks.length} 个 tick`);
      }

      const [wardsData, objectivesData] = await Promise.all([
        backendAPI.getWards(matchId),
        backendAPI.getObjectives(matchId),
      ]);
      allWardsRef.current = wardsData;
      setWardsResponse(wardsData);
      setObjectivesResponse(objectivesData);

      const resolveTimeBasis = (
        ticksBasis?: PlaybackTimeBasis,
        wardsBasis?: PlaybackTimeBasis,
        objectivesBasis?: PlaybackTimeBasis
      ): PlaybackTimeBasis | undefined => {
        if (ticksBasis) {
          return ticksBasis;
        }
        if (wardsBasis) {
          return wardsBasis;
        }
        if (objectivesBasis) {
          return objectivesBasis;
        }
        return undefined;
      };

      const timeBasis = resolveTimeBasis(
        fullData?.time_basis,
        wardsData?.time_basis,
        objectivesData?.time_basis,
      );

      const mapperRecords = [
        ...allTicksRef.current,
        ...(wardsData?.wards ?? []),
        ...(objectivesData?.objectives ?? []),
      ];
      const mapper = createGameClockMapper(mapperRecords, timeBasis);
      gameClockMapperRef.current = mapper;
      deathIntervalsRef.current = buildDeathIntervalsByHandle(allTicksRef.current, mapper);
      killMarkersRef.current = extractKillMarkersFromTicks(allTicksRef.current, mapper);
      console.log(`[RealMatchViewer] Extracted ${killMarkersRef.current.length} kill markers from tick data`);
      setTimeBasisSource(mapper.timeBasisSource);
      setTimeBasisStrategy(mapper.strategy);
      setTimeBasisOffsetSeconds(mapper.offsetSeconds);

      if (allTicksRef.current.length > 0) {
        const combinedTimePoints = mapperRecords
          .map((record) => mapper.getSourceTime(record))
          .filter((value) => Number.isFinite(value));
        const rawMinSourceTime = combinedTimePoints.length > 0
          ? Math.min(...combinedTimePoints)
          : mapper.gameClockToSource(DEFAULT_INITIAL_GAME_CLOCK_SECONDS);
        const matchDurationSourceTime = mapper.gameClockToSource(duration);
        const maxSourceTime = Math.max(
          combinedTimePoints.length > 0 ? Math.max(...combinedTimePoints) : rawMinSourceTime,
          Number.isFinite(matchDurationSourceTime) ? matchDurationSourceTime : rawMinSourceTime
        );
        const minSourceTime = mapper.timeBasisSource === 'game_time'
          ? Math.max(rawMinSourceTime, DEFAULT_INITIAL_GAME_CLOCK_SECONDS)
          : rawMinSourceTime;
        setTimelineMinTime(minSourceTime);
        setTimelineMaxTime(maxSourceTime);

        const gameStartSourceTime = clamp(
          mapper.gameClockToSource(DEFAULT_INITIAL_GAME_CLOCK_SECONDS),
          minSourceTime,
          maxSourceTime
        );
        const nextSourceTime = preserveCurrentTime
          ? clamp(currentTimeRef.current, minSourceTime, maxSourceTime)
          : gameStartSourceTime;
        setCurrentTime(nextSourceTime);
        updateDisplayForTime(nextSourceTime);
        scheduleHudMetricsFetch(nextSourceTime);
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError('加载比赛数据失败');
      setSelectedMatchDetail(null);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMatch) {
      setCurrentTime(0);
      setTimelineMinTime(0);
      setTimelineMaxTime(DEFAULT_DURATION);
      loadAllMatchData(selectedMatch);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      clearPendingHudRequest();
    };
  }, [clearPendingHudRequest, selectedMatch]);

  useEffect(() => () => {
    clearPendingHudRequest();
  }, [clearPendingHudRequest]);

  useEffect(() => {
    setReparseTask(null);
    setReparseFeedback(null);
  }, [selectedMatch]);

  const handleRefreshCurrentMatch = () => {
    if (!selectedMatch) {
      return;
    }

    setReparseFeedback(null);
    void loadAllMatchData(selectedMatch, {
      preserveAnalysisState: true,
      preserveCurrentTime: true,
    });
  };

  const handleReparseCurrentMatch = async () => {
    const replayPath = selectedMatchDetail?.replay_path;
    if (!selectedMatch || !replayPath) {
      setReparseFeedback({
        type: 'error',
        message: '当前比赛没有可用的本地 .dem 路径，无法重新解析。',
      });
      return;
    }

    try {
      const task = await replayService.createParseTask(replayPath);
      setReparseTask(task);
      setReparseFeedback({
        type: 'info',
        message: `已提交重新解析任务，当前状态：${task.status}。完成后会自动刷新当前比赛。`,
      });
    } catch (reparseError) {
      console.error('Failed to create replay parse task:', reparseError);
      setReparseFeedback({
        type: 'error',
        message: '提交重新解析任务失败，请检查本地 replay 文件是否仍存在。',
      });
    }
  };

  useEffect(() => {
    if (!reparseTask || (reparseTask.status !== 'pending' && reparseTask.status !== 'running')) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const task = await replayService.getParseTask(reparseTask.task_id);
        setReparseTask(task);

        if (task.status === 'completed') {
          setReparseFeedback({
            type: 'success',
            message: '重新解析已完成，当前比赛数据已自动刷新。',
          });
          if (selectedMatch) {
            void loadAllMatchData(selectedMatch, {
              preserveAnalysisState: true,
              preserveCurrentTime: true,
            });
          }
          window.clearInterval(timer);
          return;
        }

        if (task.status === 'failed' || task.status === 'cancelled') {
          setReparseFeedback({
            type: 'error',
            message: task.error ?? `重新解析已结束，状态：${task.status}。`,
          });
          window.clearInterval(timer);
        }
      } catch (taskError) {
        console.error('Failed to poll parse task:', taskError);
        setReparseFeedback({
          type: 'error',
          message: '重新解析任务状态刷新失败，请稍后重试。',
        });
        window.clearInterval(timer);
      }
    }, PARSE_TASK_POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [reparseTask, selectedMatch]);

  /**
   * 找到指定时间前后的两个 tick，用于插值
   */
  const findTicksForInterpolation = useCallback((time: number): { prev: TickData | null; next: TickData | null; t: number } => {
    const ticks = allTicksRef.current;
    const mapper = gameClockMapperRef.current;
    if (ticks.length === 0) {
      return { prev: null, next: null, t: 0 };
    }

    // 二分查找
    let left = 0;
    let right = ticks.length - 1;

    // 边界情况
    if (time <= mapper.getSourceTime(ticks[0])) {
      return { prev: ticks[0], next: ticks[0], t: 0 };
    }
    if (time >= mapper.getSourceTime(ticks[ticks.length - 1])) {
      return { prev: ticks[ticks.length - 1], next: ticks[ticks.length - 1], t: 0 };
    }

    // 找到 time 之前的最大 tick
    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      if (mapper.getSourceTime(ticks[mid]) <= time) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }

    const prevTick = ticks[left];
    const nextTick = ticks[Math.min(left + 1, ticks.length - 1)];

    // 计算插值系数
    const prevTime = mapper.getSourceTime(prevTick);
    const nextTime = mapper.getSourceTime(nextTick);
    const timeDiff = nextTime - prevTime;
    const t = timeDiff > 0 ? (time - prevTime) / timeDiff : 0;

    return { prev: prevTick, next: nextTick, t };
  }, []);

  /**
   * 根据时间更新显示，支持插值
   */
  const updateDisplayForTime = useCallback((time: number) => {
    const mapper = gameClockMapperRef.current;
    const gameClockDisplayShift = getGameClockDisplayShift(mapper, allTicksRef.current);
    const { prev, next, t } = findTicksForInterpolation(time);

    if (!prev) {
      return;
    }

    // 如果 prev 和 next 相同，或者 t 为 0，直接使用 prev
    if (prev === next || t === 0 || !next) {
      const positions = prev.heroes.map((hero) => ({
        hero_id: hero.handle,
        hero_name: hero.hero,
        team: hero.team === 2 ? 'radiant' as const : 'dire' as const,
        x: hero.x,
        y: hero.y,
        hp: hero.hp || 0,
        mana: hero.mana || 0,
        level: hero.level || 1,
      }));
      // 过滤掉已阵亡的英雄 (hp <= 0)
      const alivePositions = positions.filter(p => p.hp > 0);
      setHeroPositions(alivePositions);
    } else {
      // 插值计算位置
      const positions: HeroPosition[] = [];

      for (const prevHero of prev.heroes) {
        // 在 next 中找到对应的英雄
        const nextHero = next.heroes.find(h => h.handle === prevHero.handle);

        if (nextHero) {
          // 插值计算
          positions.push({
            hero_id: prevHero.handle,
            hero_name: prevHero.hero,
            team: prevHero.team === 2 ? 'radiant' as const : 'dire' as const,
            x: lerp(prevHero.x, nextHero.x, t),
            y: lerp(prevHero.y, nextHero.y, t),
            hp: Math.round(lerp(prevHero.hp || 0, nextHero.hp || 0, t)),
            mana: Math.round(lerp(prevHero.mana || 0, nextHero.mana || 0, t)),
            level: prevHero.level || 1,
          });
        } else {
          // 没找到对应英雄，使用 prev 的数据
          positions.push({
            hero_id: prevHero.handle,
            hero_name: prevHero.hero,
            team: prevHero.team === 2 ? 'radiant' as const : 'dire' as const,
            x: prevHero.x,
            y: prevHero.y,
            hp: prevHero.hp || 0,
            mana: prevHero.mana || 0,
            level: prevHero.level || 1,
          });
        }
      }

      // 过滤掉已阵亡的英雄 (hp <= 0)
      const alivePositions = positions.filter(p => p.hp > 0);
      setHeroPositions(alivePositions);
    }

    const resolveGameClockAtSourceTime = (sourceTime: number): number => {
      const { prev: clockPrev, next: clockNext, t: clockT } = findTicksForInterpolation(sourceTime);
      if (!clockPrev) {
        return mapper.sourceToGameClock(sourceTime);
      }

      const prevGameTime = getTickGameTime(clockPrev);
      if (!clockNext || clockPrev === clockNext) {
        if (prevGameTime === null) {
          return mapper.sourceToGameClock(sourceTime);
        }
        return prevGameTime + gameClockDisplayShift;
      }

      const nextGameTime = getTickGameTime(clockNext);
      if (prevGameTime === null || nextGameTime === null) {
        return mapper.sourceToGameClock(sourceTime);
      }

      return lerp(prevGameTime, nextGameTime, clockT) + gameClockDisplayShift;
    };

    const currentGameClock = resolveGameClockAtSourceTime(time);

    const prevGameTime = getTickGameTime(prev);
    const nextGameTime = next ? getTickGameTime(next) : null;

    const pauseActiveFromSamples = prevGameTime !== null
      && nextGameTime !== null
      && Math.abs(nextGameTime - prevGameTime) <= 1e-4;
    const pauseActive = pauseActiveFromSamples || mapper.isPausedAtSourceTime(time);
    setCurrentDisplayGameTime(currentGameClock);
    setIsPauseActive(pauseActive);
    // Filter kill markers within ±5s window of current game time
    const KILL_DISPLAY_WINDOW = 5;
    const filteredKills = killMarkersRef.current.filter(
      (k) => Math.abs(k.time - currentGameClock) <= KILL_DISPLAY_WINDOW
    );
    setActiveKillMarkers(filteredKills);
    const prevHeroesByHandle = new Map(prev.heroes.map((hero) => [hero.handle, hero]));
    const nextHeroesByHandle = new Map((next?.heroes ?? []).map((hero) => [hero.handle, hero]));
    const lineupHeroes = [...teamLineups.radiant, ...teamLineups.dire];
    const nextHudStatus: Record<number, HudHeroStatus> = {};
    for (const hero of lineupHeroes) {
      const prevHero = prevHeroesByHandle.get(hero.key);
      const nextHero = nextHeroesByHandle.get(hero.key) ?? prevHero;
      const hpInterpolationFactor = !next || prev === next ? 0 : t;
      const interpolatedHp = Math.max(
        0,
        Math.round(lerp(prevHero?.hp ?? 0, nextHero?.hp ?? prevHero?.hp ?? 0, hpInterpolationFactor))
      );
      const interpolatedMaxHp = Math.max(
        0,
        Math.round(lerp(prevHero?.max_hp ?? 0, nextHero?.max_hp ?? prevHero?.max_hp ?? 0, hpInterpolationFactor))
      );
      const hpRatio = interpolatedMaxHp > 0
        ? clamp(interpolatedHp / interpolatedMaxHp, 0, 1)
        : 0;

      const intervals = deathIntervalsRef.current.get(hero.key) ?? [];
      const activeDeath = intervals.find(
        (interval) => time >= interval.startSourceTime && time < interval.endSourceTime
      );

      if (!activeDeath) {
        nextHudStatus[hero.key] = {
          isAlive: true,
          hp: interpolatedHp,
          maxHp: interpolatedMaxHp,
          hpRatio,
        };
        continue;
      }

      const respawnGameClock = resolveGameClockAtSourceTime(activeDeath.endSourceTime);
      nextHudStatus[hero.key] = {
        isAlive: false,
        respawnRemainingSeconds: Math.max(0, Math.ceil(respawnGameClock - currentGameClock)),
        hp: 0,
        maxHp: interpolatedMaxHp,
        hpRatio: 0,
      };
    }
    setHudHeroStatus(nextHudStatus);
  }, [findTicksForInterpolation, teamLineups]);

  useEffect(() => {
    if (teamLineups.radiant.length === 0 && teamLineups.dire.length === 0) {
      return;
    }
    updateDisplayForTime(currentTime);
  }, [teamLineups, updateDisplayForTime]);

  useEffect(() => {
    const availableHeroes = new Set(
      [...teamLineups.radiant, ...teamLineups.dire].map((hero) => hero.heroName)
    );

    setHeatmapHeroFilter((current) => current.filter((hero) => availableHeroes.has(hero)));
    setPathHeroFilter((current) => current.filter((hero) => availableHeroes.has(hero)));
  }, [teamLineups]);

  const toggleHeatmapHeroFilter = useCallback((heroName: string) => {
    setHeatmapHeroFilter((current) => {
      if (current.includes(heroName)) {
        return current.filter((hero) => hero !== heroName);
      }
      return [...current, heroName];
    });
  }, []);

  const togglePathHeroFilter = useCallback((heroName: string) => {
    setPathHeroFilter((current) => {
      if (current.includes(heroName)) {
        return current.filter((hero) => hero !== heroName);
      }
      return [...current, heroName];
    });
  }, []);

  useEffect(() => {
    if (!selectedMatch) {
      return;
    }

    const mapper = gameClockMapperRef.current;
    const defaultRange = {
      start: formatGameClockInput(mapper.sourceToGameClock(timelineMinTime)),
      end: formatGameClockInput(mapper.sourceToGameClock(timelineMaxTime)),
    };

    setHeatmapCustomRange(defaultRange);
    setPathCustomRange(defaultRange);
    setVisionCustomRange(defaultRange);
  }, [selectedMatch, timelineMaxTime, timelineMinTime]);

  // Fetch heatmap data when type changes
  useEffect(() => {
    if (heatmapType === 'none' || !selectedMatch) {
      setHeatmapGrid(null);
      setHeatmapBounds(null);
      setHeatmapSummary(null);
      setHeatmapLoading(false);
      setHeatmapError(null);
      return;
    }

    const controller = new AbortController();
    const resolvedRange = resolveVisualizationTimeRange(
      heatmapRangePreset,
      timelineMinTime,
      timelineMaxTime,
      gameClockMapperRef.current,
      heatmapCustomRange
    );
    if (resolvedRange.error) {
      setHeatmapGrid(null);
      setHeatmapBounds(null);
      setHeatmapSummary(null);
      setHeatmapLoading(false);
      setHeatmapError(resolvedRange.error);
      return () => {
        controller.abort();
      };
    }

    const { startTime, endTime } = resolvedRange;

    setHeatmapLoading(true);
    setHeatmapError(null);

    backendAPI
      .getMatchHeatmap(selectedMatch, {
        heatmapType,
        gridSize: DEFAULT_HEATMAP_GRID_SIZE,
        heroes: heatmapHeroFilter.length > 0 ? dedupeHeroSelections(heatmapHeroFilter) : undefined,
        team: heatmapTeamFilter === 'radiant' ? 2 : heatmapTeamFilter === 'dire' ? 3 : undefined,
        startTime,
        endTime,
        signal: controller.signal,
      })
      .then((response: MatchHeatmapResponse | null) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!response?.data) {
          setHeatmapGrid(null);
          setHeatmapBounds(null);
          setHeatmapSummary(null);
          setHeatmapError('热力图请求失败。');
          return;
        }

        const denseGrid = buildDenseHeatmapGrid(
          response.data.grid_size,
          response.data.max_density,
          response.data.grid_data
        );
        setHeatmapGrid(denseGrid);
        setHeatmapBounds(response.data.map_bounds);
        setHeatmapSummary({
          hero: response.data.hero,
          heroes: response.data.heroes ?? null,
          team: response.data.team,
          totalSamples: response.data.total_samples,
          maxDensity: response.data.max_density,
          timeRange: response.data.time_range,
        });
        if (response.data.total_samples === 0) {
          setHeatmapError('当前时间范围没有热力图数据。');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHeatmapLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    heatmapCustomRange,
    heatmapHeroFilter,
    heatmapRangePreset,
    heatmapTeamFilter,
    heatmapType,
    selectedMatch,
    timelineMinTime,
    timelineMaxTime,
  ]);

  useEffect(() => {
    if (!showPaths || !selectedMatch) {
      setPathOverlays(null);
      setPathSummary(null);
      setPathLoading(false);
      setPathError(null);
      return;
    }

    const controller = new AbortController();
    const resolvedRange = resolveVisualizationTimeRange(
      pathRangePreset,
      timelineMinTime,
      timelineMaxTime,
      gameClockMapperRef.current,
      pathCustomRange
    );
    if (resolvedRange.error) {
      setPathOverlays(null);
      setPathSummary(null);
      setPathLoading(false);
      setPathError(resolvedRange.error);
      return () => {
        controller.abort();
      };
    }

    const { startTime, endTime } = resolvedRange;

    setPathLoading(true);
    setPathError(null);

    backendAPI
      .getMovementPaths(selectedMatch, {
        heroes: pathHeroFilter.length > 0 ? dedupeHeroSelections(pathHeroFilter) : undefined,
        startTime,
        endTime,
        simplify: pathSimplify,
        epsilon: pathEpsilon,
        signal: controller.signal,
      })
      .then((response: MovementPathsResponse | null) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!response?.data) {
          setPathOverlays(null);
          setPathSummary(null);
          setPathError('路径分析请求失败。');
          return;
        }

        const overlays = toPathOverlays(response.data.paths);
        setPathOverlays(overlays);
        setPathSummary({
          heroCount: response.data.hero_count,
          timeRange: response.data.time_range,
          simplification: response.data.simplification,
        });
        if (overlays.length === 0) {
          setPathError('当前筛选范围没有路径数据。');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPathLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    pathCustomRange,
    pathEpsilon,
    pathHeroFilter,
    pathRangePreset,
    pathSimplify,
    selectedMatch,
    showPaths,
    timelineMaxTime,
    timelineMinTime,
  ]);

  const handleTimeChange = useCallback((newTime: number) => {
    setCurrentTime(newTime);
    updateDisplayForTime(newTime);
    scheduleHudMetricsFetch(newTime);
  }, [scheduleHudMetricsFetch, updateDisplayForTime]);

  const formatTimeDisplay = (seconds: number): string => {
    const { prev, next, t } = findTicksForInterpolation(seconds);
    const mapper = gameClockMapperRef.current;
    const gameClockDisplayShift = getGameClockDisplayShift(mapper, allTicksRef.current);

    if (!prev) {
      return formatGameClockTime(mapper.sourceToGameClock(seconds));
    }

    const prevGameTime = getTickGameTime(prev);
    if (!next || prev === next) {
      if (prevGameTime === null) {
        return formatGameClockTime(mapper.sourceToGameClock(seconds));
      }
      return formatGameClockTime(prevGameTime + gameClockDisplayShift);
    }

    const nextGameTime = getTickGameTime(next);
    if (prevGameTime === null || nextGameTime === null) {
      return formatGameClockTime(mapper.sourceToGameClock(seconds));
    }

    const gameClockTime = lerp(prevGameTime, nextGameTime, t) + gameClockDisplayShift;
    return formatGameClockTime(gameClockTime);
  };

  const currentGameClockLabel = isPauseActive
    ? `暂停中 · ${formatGameClockTime(currentDisplayGameTime)}`
    : formatGameClockTime(currentDisplayGameTime);
  const matchDurationClockLabel = formatGameClockTime(
    Math.max(0, gameClockMapperRef.current.sourceToGameClock(timelineMaxTime))
  );

  const selectedMatchRecord = matches.find((match) => match.match_id === selectedMatch) ?? null;
  const selectedReplayPath = selectedMatchDetail?.replay_path ?? selectedMatchRecord?.replay_path ?? null;
  const selectedReplayFileName = selectedReplayPath
    ? selectedReplayPath.split(/[\\/]/).filter(Boolean).pop() ?? selectedReplayPath
    : null;
  const formatMatchPickerOption = useCallback((match: Match) => {
    const optionRadiantName = match.radiant_team_name || match.radiant_team || '天辉';
    const optionDireName = match.dire_team_name || match.dire_team || '夜魇';
    const sourceLabel = match.source ? String(match.source).toUpperCase() : 'LOCAL';
    const statusParts = [
      match.is_professional ? '职业' : null,
      match.duration ? formatGameClockTime(match.duration) : null,
      match.parsed_at ? new Date(match.parsed_at).toLocaleDateString() : null,
    ].filter(Boolean);

    return {
      id: match.match_id,
      label: `${optionRadiantName} vs ${optionDireName}`,
      meta: statusParts.length > 0 ? statusParts.join(' · ') : sourceLabel,
      sourceLabel,
      searchText: `${optionRadiantName} ${optionDireName} ${match.match_id} ${sourceLabel} ${statusParts.join(' ')}`.toLowerCase(),
    };
  }, []);
  const selectedMatchPickerOption = selectedMatchRecord
    ? formatMatchPickerOption(selectedMatchRecord)
    : selectedMatch
      ? {
          id: selectedMatch,
          label: `比赛 ${selectedMatch}`,
          meta: '当前选择',
          sourceLabel: 'LOCAL',
          searchText: `${selectedMatch}`,
        }
      : null;
  const filteredMatchPickerOptions = useMemo(() => {
    const normalizedQuery = matchPickerQuery.trim().toLowerCase();
    return matches
      .map(formatMatchPickerOption)
      .filter((option) => !normalizedQuery || option.searchText.includes(normalizedQuery))
      .slice(0, 80);
  }, [formatMatchPickerOption, matchPickerQuery, matches]);
  const selectReplayMatch = useCallback((nextMatchId: number) => {
    selectedMatchRef.current = nextMatchId;
    preferredMatchIdRef.current = nextMatchId;
    setReplayContextWarning(null);
    setSelectedMatch(nextMatchId);
    setMatchPickerOpen(false);
    setMatchPickerQuery('');
  }, [setSelectedMatch]);
  const hasLegacyItemSlotWarning = hudMetricsWarnings.some((warning) =>
    warning.toLowerCase().includes(LEGACY_ITEM_SLOT_WARNING_SNIPPET)
  );
  const isReparseTaskActive = reparseTask?.status === 'pending' || reparseTask?.status === 'running';

  const mapViewportSize = (() => {
    if (viewportWidth >= 1600) {
      return 760;
    }
    if (viewportWidth >= 1500) {
      return 700;
    }
    if (viewportWidth >= 1400) {
      return 660;
    }
    if (viewportWidth >= 1200) {
      return 580;
    }
    if (viewportWidth >= 1024) {
      return 500;
    }
    return Math.max(320, Math.min(680, viewportWidth - 48));
  })();
  const floatingOverlayEnabled = viewportWidth >= 1024;

  const wardPlacementRecords = useMemo(
    () => enrichWardPlacementRecordsWithPlacers(
      buildWardPlacementRecords(wardsResponse, gameClockMapperRef.current),
      allTicksRef.current,
      gameClockMapperRef.current
    ),
    [selectedMatch, teamLineups, timeBasisOffsetSeconds, timelineMaxTime, timelineMinTime, wardsResponse]
  );
  const visionTimeRange = useMemo(
    () => resolveVisualizationTimeRange(
      visionRangePreset,
      timelineMinTime,
      timelineMaxTime,
      gameClockMapperRef.current,
      visionCustomRange
    ),
    [timelineMaxTime, timelineMinTime, visionCustomRange, visionRangePreset]
  );
  const allVisionPlacements = useMemo(
    () => wardPlacementRecords.filter((record) => {
      if (visionTeamFilter !== 'all' && record.team !== visionTeamFilter) {
        return false;
      }
      if (visionWardTypeFilter !== 'all' && record.type !== visionWardTypeFilter) {
        return false;
      }
      return true;
    }),
    [visionTeamFilter, visionWardTypeFilter, wardPlacementRecords]
  );
  const filteredWardPlacements = useMemo(() => {
    if (visionTimeRange.error) {
      return [];
    }

    return allVisionPlacements.filter((record) => (
      record.placedSourceTime >= visionTimeRange.startTime &&
      record.placedSourceTime <= visionTimeRange.endTime
    ));
  }, [allVisionPlacements, visionTimeRange]);
  const currentTimelineWardPlacements = useMemo(
    () => allVisionPlacements.filter((record) => isWardActiveAtTime(record, currentTime)),
    [allVisionPlacements, currentTime]
  );
  const survivingWardPlacementsAtRangeEnd = useMemo(() => {
    if (visionTimeRange.error) {
      return [];
    }

    return filteredWardPlacements.filter((record) => isWardActiveAtTime(record, visionTimeRange.endTime));
  }, [filteredWardPlacements, visionTimeRange]);
  const destroyedWardPlacements = useMemo(() => {
    if (visionTimeRange.error) {
      return [];
    }

    return filteredWardPlacements.filter((record) => (
      record.removalKind === 'destroyed' &&
      record.removalSourceTime >= visionTimeRange.startTime &&
      record.removalSourceTime <= visionTimeRange.endTime
    ));
  }, [filteredWardPlacements, visionTimeRange]);
  const expiredWardPlacements = useMemo(() => {
    if (visionTimeRange.error) {
      return [];
    }

    return filteredWardPlacements.filter((record) => (
      record.removalKind === 'expired' &&
      record.removalSourceTime >= visionTimeRange.startTime &&
      record.removalSourceTime <= visionTimeRange.endTime
    ));
  }, [filteredWardPlacements, visionTimeRange]);
  const recentWardEvents = useMemo(
    () => [...filteredWardPlacements]
      .sort((left, right) => right.removalSourceTime - left.removalSourceTime)
      .slice(0, 6),
    [filteredWardPlacements]
  );
  const averageWardLifetimeSeconds = useMemo(() => {
    if (filteredWardPlacements.length === 0) {
      return 0;
    }
    const total = filteredWardPlacements.reduce((sum, record) => sum + record.lifetimeSeconds, 0);
    return total / filteredWardPlacements.length;
  }, [filteredWardPlacements]);
  const allDestroyedWardPlacements = useMemo(
    () => allVisionPlacements.filter((record) => record.removalKind === 'destroyed'),
    [allVisionPlacements]
  );
  const fullMatchWardPlacementsSorted = useMemo(
    () => [...allVisionPlacements].sort((left, right) => left.placedSourceTime - right.placedSourceTime),
    [allVisionPlacements]
  );
  const fullMatchDestroyedPlacementsSorted = useMemo(
    () => [...allDestroyedWardPlacements].sort((left, right) => right.removalSourceTime - left.removalSourceTime),
    [allDestroyedWardPlacements]
  );
  const destroyedByHeroCount = allDestroyedWardPlacements.filter((record) => record.destroyerKind === 'hero').length;
  const destroyedBySummonCount = allDestroyedWardPlacements.filter((record) => record.destroyerKind === 'hero_summon').length;
  const destroyedByLaneCreepCount = allDestroyedWardPlacements.filter((record) => record.destroyerKind === 'lane_creep').length;
  const destroyedByNeutralCount = allDestroyedWardPlacements.filter((record) => record.destroyerKind === 'neutral_creep').length;
  const destroyedByUnitCount = allDestroyedWardPlacements.filter((record) => record.destroyerKind === 'unit').length;
  const destroyedUnknownCount = allDestroyedWardPlacements.filter((record) => (
    !record.destroyerKind || record.destroyerLabel.includes('未明') || record.destroyerLabel.includes('未知')
  )).length;
  const currentRealtimeObserverWardCount = currentTimelineWardPlacements.filter((record) => record.type === 'observer').length;
  const currentRealtimeSentryWardCount = currentTimelineWardPlacements.filter((record) => record.type === 'sentry').length;
  const visionMapRecords = useMemo(() => {
    if (visionMapMode === 'current') {
      return currentTimelineWardPlacements;
    }
    if (visionMapMode === 'range') {
      return filteredWardPlacements;
    }
    return allVisionPlacements;
  }, [allVisionPlacements, currentTimelineWardPlacements, filteredWardPlacements, visionMapMode]);
  const activeWardPreview = pinnedWardPreview ?? hoveredWardPreview;
  const selectedWardKeys = activeWardPreview?.wards.map((record) => record.instanceKey) ?? [];

  const resolveWardPopoverAnchor = useCallback((payload: WardInteractionPayload | null) => {
    if (!payload) {
      return null;
    }

    const containerRect = mapOverlayContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      return null;
    }

    return {
      wards: payload.wards
        .map((ward) => wardPlacementRecords.find((record) => record.instanceKey === ward.instanceKey))
        .filter((record): record is WardPlacementRecord => Boolean(record)),
      anchorX: containerRect.left + payload.localX,
      anchorY: containerRect.top + payload.localY,
    };
  }, [wardPlacementRecords]);

  const handleWardHoverChange = useCallback((payload: WardInteractionPayload | null) => {
    if (pinnedWardPreview) {
      return;
    }

    const nextPreview = resolveWardPopoverAnchor(payload);
    if (!nextPreview || nextPreview.wards.length === 0) {
      setHoveredWardPreview(null);
      return;
    }

    setHoveredWardPreview(nextPreview);
  }, [pinnedWardPreview, resolveWardPopoverAnchor]);

  const handleWardClick = useCallback((payload: WardInteractionPayload | null) => {
    const nextPreview = resolveWardPopoverAnchor(payload);
    if (!nextPreview || nextPreview.wards.length === 0) {
      setPinnedWardPreview(null);
      setHoveredWardPreview(null);
      return;
    }

    setPinnedWardPreview(nextPreview);
    setHoveredWardPreview(null);
  }, [resolveWardPopoverAnchor]);

  const handleUnpinWardPreview = useCallback(() => {
    setPinnedWardPreview(null);
  }, []);

  const radiantTeamName =
    selectedMatchDetail?.radiant_team_name ||
    selectedMatchRecord?.radiant_team_name ||
    selectedMatchDetail?.radiant_team ||
    selectedMatchRecord?.radiant_team ||
    '天辉';
  const direTeamName =
    selectedMatchDetail?.dire_team_name ||
    selectedMatchRecord?.dire_team_name ||
    selectedMatchDetail?.dire_team ||
    selectedMatchRecord?.dire_team ||
    '夜魇';
  const winnerTeam = getWinnerTeam(
    selectedMatchDetail?.winner_team ?? selectedMatchRecord?.winner_team,
    selectedMatchDetail?.radiant_win ?? selectedMatchRecord?.radiant_win
  );
  const winnerLabel = winnerTeam === 'radiant' ? radiantTeamName : winnerTeam === 'dire' ? direTeamName : null;
  const isProfessionalMatch = Boolean(
    selectedMatchDetail?.is_professional ?? selectedMatchRecord?.is_professional
  );
  const matchSourceLabel = selectedMatchDetail?.source ?? selectedMatchRecord?.source ?? null;
  const lineupHeroLookup = useMemo(() => {
    const lookup = new Map<string, TeamHeroPortrait>();

    for (const hero of [...teamLineups.radiant, ...teamLineups.dire]) {
      lookup.set(getTeamHeroKey(hero.team, hero.heroName), hero);
    }

    return lookup;
  }, [teamLineups]);
  const getWardPlacerFieldLabel = useCallback((record: WardPlacementRecord): string => {
    if (record.placerSource === 'parser') {
      return '插眼英雄';
    }
    if (record.placerSource === 'inferred') {
      return '疑似插眼英雄';
    }
    return '插眼归属';
  }, []);
  const getWardPlacerDisplayName = useCallback((record: WardPlacementRecord): string => {
    if (!record.placerHeroName) {
      return '待确认';
    }

    const lineupHero = lineupHeroLookup.get(getTeamHeroKey(record.team, record.placerHeroName));
    const heroLabel = formatWardEntityName(record.placerHeroName);
    const playerDisplayName = lineupHero
      ? getPreferredPlayerDisplayName(lineupHero, isProfessionalMatch)
      : null;

    return playerDisplayName ? `${playerDisplayName} · ${heroLabel}` : heroLabel;
  }, [isProfessionalMatch, lineupHeroLookup]);
  const getWardPlacerSummary = useCallback((record: WardPlacementRecord): string => (
    `${getWardPlacerFieldLabel(record)}：${getWardPlacerDisplayName(record)}`
  ), [getWardPlacerDisplayName, getWardPlacerFieldLabel]);

  useEffect(() => {
    const defaultPanels = createDefaultMapOverlayPanels(mapViewportSize);

    setMapOverlayPanels((current) => {
      if (!hasInitializedMapOverlayPanelsRef.current) {
        hasInitializedMapOverlayPanelsRef.current = true;
        return defaultPanels;
      }

      return {
        insight: {
          ...current.insight,
          ...clampMapOverlayPosition(
            current.insight.x,
            current.insight.y,
            mapViewportSize,
            mapViewportSize,
            mapOverlayPanelRefs.current.insight?.offsetWidth ?? MAP_OVERLAY_PANEL_META.insight.width,
            mapOverlayPanelRefs.current.insight?.offsetHeight ?? 260
          ),
        },
        legend: {
          ...current.legend,
          ...clampMapOverlayPosition(
            current.legend.x,
            current.legend.y,
            mapViewportSize,
            mapViewportSize,
            mapOverlayPanelRefs.current.legend?.offsetWidth ?? MAP_OVERLAY_PANEL_META.legend.width,
            mapOverlayPanelRefs.current.legend?.offsetHeight ?? 220
          ),
        },
      };
    });
  }, [mapViewportSize]);

  const getHeroLabel = (heroName: string, fallbackKey: number): string => {
    const heroData = getHeroByName(heroName || '');
    return heroData?.chineseName || heroName?.replace('npc_dota_hero_', '') || `英雄 ${fallbackKey}`;
  };

  const getHudTeamLabel = (team: string): string => {
    const normalized = String(team || '').toLowerCase();
    if (normalized === 'radiant' || normalized === '2') {
      return '天辉';
    }
    if (normalized === 'dire' || normalized === '3') {
      return '夜魇';
    }
    return team || '未知';
  };

  const formatHudValue = (value: number): string => {
    if (!Number.isFinite(value)) {
      return '-';
    }
    return Math.round(value).toLocaleString();
  };

  const formatHudStatValue = (value: number): string => {
    if (!Number.isFinite(value)) {
      return '-';
    }

    const absolute = Math.abs(value);
    if (absolute >= 1000000) {
      return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
    }
    if (absolute >= 10000) {
      return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return Math.round(value).toLocaleString();
  };

  const hudMetricsByTeamHeroKey = (() => {
    const metricsMap = new Map<string, HudHeroMetric>();
    for (const metric of hudMetrics) {
      const teamKey = getHudTeamLabel(metric.team) === '天辉' ? 'radiant' : 'dire';
      metricsMap.set(getTeamHeroKey(teamKey, metric.hero), metric);
    }
    return metricsMap;
  })();

  const renderHudLane = (team: 'radiant' | 'dire') => {
    const teamLabel = team === 'radiant' ? '天辉' : '夜魇';
    const laneClass = team === 'radiant' ? 'replay-hud-lane-radiant' : 'replay-hud-lane-dire';
    const accentTextClass = team === 'radiant' ? 'text-emerald-300' : 'text-rose-300';
    const healthBarClass = team === 'radiant' ? 'bg-emerald-400/95' : 'bg-rose-400/95';
    const laneHeroes = team === 'radiant' ? teamLineups.radiant : teamLineups.dire;
    const slots = Array.from({ length: TEAM_HERO_COUNT }, (_, index) => laneHeroes[index] ?? null);

    return (
      <div className={`replay-hud-lane ${laneClass}`}>
        <div className="replay-hud-lane-header">
          <p className={`shrink-0 text-[11px] font-semibold uppercase tracking-[0.2em] ${accentTextClass}`}>
            {teamLabel}
          </p>
        </div>

        <div className="space-y-1.5" data-testid={team === 'radiant' ? 'hud-radiant' : 'hud-dire'}>
          {slots.map((hero, index) => {
            if (!hero) {
              return (
                <div
                  key={`${team}-empty-${index}`}
                  className="h-[84px] rounded-xl border border-dashed border-slate-700/70 bg-slate-900/55"
                />
              );
            }

            const metric = hudMetricsByTeamHeroKey.get(
              getTeamHeroKey(team, hero.heroName)
            );
            const heroStatus = hudHeroStatus[hero.key];
            const heroLabel = getHeroLabel(hero.heroName, hero.key);
            const playerDisplayName = getPreferredPlayerDisplayName(hero, isProfessionalMatch);
            const playerDisplayMeta = getPlayerDisplayMeta(hero, isProfessionalMatch, playerDisplayName);
            const isDead = heroStatus ? !heroStatus.isAlive : false;
            const healthRatio = clamp(heroStatus?.hpRatio ?? (isDead ? 0 : 1), 0, 1);
            const healthPercent = Math.round(healthRatio * 100);
            const healthCurrent = Math.max(0, Math.round(heroStatus?.hp ?? 0));
            const healthMax = Math.max(0, Math.round(heroStatus?.maxHp ?? 0));
            const itemSlots = extractHudItemSlots(Array.isArray(metric?.items) ? metric.items : []);
            const heroExpanded = true;
            const isHighlighted = highlightedHudHeroKeys.has(getTeamHeroKey(team, hero.heroName));
            const respawnLabel = isDead && typeof heroStatus?.respawnRemainingSeconds === 'number'
              ? `${heroStatus.respawnRemainingSeconds}s 后复活`
              : `${healthCurrent}/${healthMax} HP`;
            const cardStateClass = 'border-cyan-500/45 bg-slate-950/96 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_18px_36px_rgba(8,15,34,0.26)]';

            return (
              <div
                key={hero.key}
                data-testid={`hud-hero-card-${team}-${hero.key}`}
                data-highlighted={isHighlighted ? 'true' : 'false'}
                aria-expanded={heroExpanded}
                role="group"
                aria-label={`${heroLabel}${playerDisplayName ? ` ${playerDisplayName}` : ''}，详情已展开`}
                title={`${heroLabel}${playerDisplayName ? ` / ${playerDisplayName}` : ''} · 详情常显`}
                className={`replay-hud-hero-row group relative w-full rounded-xl border p-2 text-left transition ${cardStateClass} ${
                  isHighlighted
                    ? team === 'radiant'
                      ? 'shadow-[0_0_0_1px_rgba(74,222,128,0.16),0_20px_40px_rgba(5,150,105,0.18)]'
                      : 'shadow-[0_0_0_1px_rgba(251,113,133,0.16),0_20px_40px_rgba(190,24,93,0.2)]'
                  : ''
                }`}
              >
                <div className="replay-hud-hero-shell">
                  <div className="relative shrink-0">
                    <div className={`h-12 w-12 overflow-hidden rounded-lg border bg-slate-950/95 ${team === 'radiant' ? 'border-emerald-500/45' : 'border-rose-500/45'}`}>
                      <img
                        src={hero.portraitUrl}
                        alt={heroLabel}
                        className={`h-full w-full object-contain ${isDead ? 'grayscale brightness-75' : ''}`}
                      />
                    </div>
                    <span className="absolute -right-1.5 -top-1.5 rounded-full border border-slate-700/90 bg-slate-900/95 px-1.5 py-[1px] text-[9px] font-semibold text-slate-100 shadow-sm">
                      Lv.{metric ? formatHudValue(metric.level) : '-'}
                    </span>
                  </div>

                  <div className="replay-hud-hero-main">
                    <div className="replay-hud-hero-summary">
                      <div className="replay-hud-hero-topline flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-50">{heroLabel}</p>
                          {playerDisplayName && (
                            <p
                              data-testid={`hud-player-display-${team}-${hero.key}`}
                              className={`mt-0.5 truncate text-[11px] font-semibold leading-tight transition-[color,filter] duration-200 ${
                                isHighlighted
                                  ? 'text-cyan-100 drop-shadow-[0_0_10px_rgba(34,211,238,0.55)]'
                                  : 'text-amber-200 drop-shadow-[0_0_7px_rgba(251,191,36,0.3)]'
                              }`}
                              title={playerDisplayName}
                            >
                              {playerDisplayName}
                            </p>
                          )}
                          <p className={`text-[10px] font-medium ${isDead ? 'text-amber-300' : 'text-slate-400'}`}>
                            {respawnLabel}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-[11px] font-semibold text-slate-100">
                            {metric ? `${formatHudValue(metric.kills)}/${formatHudValue(metric.deaths)}/${formatHudValue(metric.assists)}` : '-/-/-'}
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">KDA</p>
                        </div>
                      </div>

                      <div
                        data-testid={`hud-hero-health-${team}-${hero.key}`}
                        className="replay-hud-healthbar mt-1.5 h-1.5 overflow-hidden rounded-full border border-slate-700/80 bg-slate-900/90"
                      >
                        <div
                          className={`h-full transition-[width,opacity] duration-200 ${healthBarClass} ${isDead ? 'opacity-60' : ''}`}
                          style={{ width: `${healthPercent}%` }}
                        />
                      </div>

                      {playerDisplayMeta && (
                        <div className="replay-hud-player-meta-wrap mt-1.5">
                          <span
                            data-testid={`hud-player-meta-${team}-${hero.key}`}
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ${
                              isHighlighted
                                ? 'border-cyan-100/80 bg-cyan-400/30 text-white ring-1 ring-cyan-300/35 shadow-[0_0_20px_rgba(34,211,238,0.28)]'
                                : 'border-amber-200/65 bg-amber-300/18 text-amber-50 ring-1 ring-amber-200/20 shadow-[0_0_14px_rgba(251,191,36,0.16)]'
                            }`}
                          >
                            {playerDisplayMeta}
                          </span>
                        </div>
                      )}
                    </div>

                    {heroExpanded && (
                      <div className="replay-hud-row-details">
                        <div className="replay-hud-row-stats">
                          <div className="border border-slate-800/80 bg-slate-900/70">
                            <p className="text-slate-500">NW</p>
                            <p
                              className="mt-0.5 font-mono text-[11px] font-semibold text-slate-100"
                              title={metric ? formatHudValue(metric.net_worth) : '-'}
                            >
                              {metric ? formatHudStatValue(metric.net_worth) : '-'}
                            </p>
                          </div>
                          <div className="border border-slate-800/80 bg-slate-900/70">
                            <p className="text-slate-500">GPM</p>
                            <p
                              className="mt-0.5 font-mono text-[11px] font-semibold text-slate-100"
                              title={metric ? formatHudValue(metric.gpm) : '-'}
                            >
                              {metric ? formatHudStatValue(metric.gpm) : '-'}
                            </p>
                          </div>
                          <div className="border border-slate-800/80 bg-slate-900/70">
                            <p className="text-slate-500">XPM</p>
                            <p
                              className="mt-0.5 font-mono text-[11px] font-semibold text-slate-100"
                              title={metric ? formatHudValue(metric.xpm) : '-'}
                            >
                              {metric ? formatHudStatValue(metric.xpm) : '-'}
                            </p>
                          </div>
                        </div>

                        <div className="replay-hud-row-items rounded-xl border border-slate-800/70 bg-slate-950/50 p-1">
                          <div className="grid gap-1.5">
                            <div
                              className="grid grid-cols-3 gap-1.5"
                              data-testid={`hud-item-grid-${team}-${hero.key}-inventory`}
                            >
                              {itemSlots.inventory.map((itemName, itemIndex) => (
                                <ItemSlot
                                  key={`${hero.key}-inventory-${itemName || 'empty'}-${itemIndex}`}
                                  slotId={`${hero.key}-inventory-${itemIndex}`}
                                  itemName={itemName ?? undefined}
                                  sizeClass="w-full aspect-[5/4]"
                                  variant="inventory"
                                />
                              ))}
                            </div>

                            <div
                              className="grid grid-cols-4 gap-1.5"
                              data-testid={`hud-item-grid-${team}-${hero.key}-backpack`}
                            >
                              {itemSlots.backpack.map((itemName, itemIndex) => (
                                <ItemSlot
                                  key={`${hero.key}-backpack-${itemName || 'empty'}-${itemIndex}`}
                                  slotId={`${hero.key}-backpack-${itemIndex}`}
                                  itemName={itemName ?? undefined}
                                  sizeClass="w-full aspect-[5/4]"
                                  variant="backpack"
                                />
                              ))}
                              <ItemSlot
                                slotId={`${hero.key}-neutral`}
                                itemName={itemSlots.neutral ?? undefined}
                                enhancementName={itemSlots.enhancement ?? undefined}
                                sizeClass="w-full aspect-[5/4]"
                                variant="neutral"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const setMapOverlayOpen = useCallback((key: MapOverlayPanelKey, open: boolean) => {
    if (!open && mapOverlayDragStateRef.current?.key === key) {
      mapOverlayDragStateRef.current = null;
      setDraggingMapOverlayPanel(null);
    }

    setMapOverlayPanels((current) => ({
      ...current,
      [key]: {
        ...current[key],
        open,
      },
    }));
  }, []);

  const toggleMapOverlayOpen = useCallback((key: MapOverlayPanelKey) => {
    setMapOverlayPanels((current) => ({
      ...current,
      [key]: {
        ...current[key],
        open: !current[key].open,
      },
    }));
  }, []);

  const hideAllMapOverlays = useCallback(() => {
    setMapOverlayPanels((current) => ({
      insight: {
        ...current.insight,
        open: false,
      },
      legend: {
        ...current.legend,
        open: false,
      },
    }));
  }, []);

  const restoreDefaultMapOverlays = useCallback(() => {
    const defaultPanels = createDefaultMapOverlayPanels(mapViewportSize);
    setMapOverlayPanels({
      insight: {
        ...defaultPanels.insight,
        open: true,
      },
      legend: {
        ...defaultPanels.legend,
        open: false,
      },
    });
  }, [mapViewportSize]);

  const resetMapOverlayPositions = useCallback(() => {
    const defaultPanels = createDefaultMapOverlayPanels(mapViewportSize);

    setMapOverlayPanels((current) => ({
      insight: {
        ...defaultPanels.insight,
        open: current.insight.open,
      },
      legend: {
        ...defaultPanels.legend,
        open: current.legend.open,
      },
    }));
  }, [mapViewportSize]);

  const handleMapOverlayPointerDown = useCallback((
    key: MapOverlayPanelKey,
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0) {
      return;
    }

    const container = mapOverlayContainerRef.current;
    const panel = mapOverlayPanelRefs.current[key];
    if (!container || !panel) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    mapOverlayDragStateRef.current = {
      key,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
      containerRect,
      panelWidth: panelRect.width,
      panelHeight: panelRect.height,
    };
    setDraggingMapOverlayPanel(key);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = mapOverlayDragStateRef.current;
      if (!dragState) {
        return;
      }

      const nextPosition = clampMapOverlayPosition(
        event.clientX - dragState.containerRect.left - dragState.offsetX,
        event.clientY - dragState.containerRect.top - dragState.offsetY,
        dragState.containerRect.width,
        dragState.containerRect.height,
        dragState.panelWidth,
        dragState.panelHeight
      );

      setMapOverlayPanels((current) => ({
        ...current,
        [dragState.key]: {
          ...current[dragState.key],
          ...nextPosition,
        },
      }));
    };

    const handlePointerUp = () => {
      if (!mapOverlayDragStateRef.current) {
        return;
      }

      mapOverlayDragStateRef.current = null;
      setDraggingMapOverlayPanel(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (!floatingOverlayEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        (
          activeElement.isContentEditable ||
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT'
        )
      ) {
        return;
      }

      setMapOverlayPanels((current) => {
        if (!current.insight.open && !current.legend.open) {
          return current;
        }

        return {
          insight: {
            ...current.insight,
            open: false,
          },
          legend: {
            ...current.legend,
            open: false,
          },
        };
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [floatingOverlayEnabled]);

  const visualizationRangeOptions: Array<{ value: VisualizationRangePreset; label: string }> = [
    { value: 'full', label: '整场' },
    { value: 'opening5', label: '对线前 5 分钟' },
    { value: 'opening10', label: '对线前 10 分钟' },
    { value: 'opening15', label: '前 15 分钟' },
    { value: 'midgame15to25', label: '15 到 25 分钟' },
    { value: 'custom', label: '自定义区间' },
  ];

  const activeHeatmapLabel =
    heatmapType === 'none'
      ? '关闭'
      : heatmapType === 'movement'
        ? '移动热力图'
        : heatmapType === 'kill'
          ? '击杀热力图'
          : '死亡热力图';

  const activeRangeLabel =
    heatmapRangePreset === 'custom'
      ? `${heatmapCustomRange.start} 到 ${heatmapCustomRange.end}`
      : visualizationRangeOptions.find((option) => option.value === heatmapRangePreset)?.label ?? '整场';
  const visionRangeLabel =
    visionRangePreset === 'custom'
      ? `${visionCustomRange.start} 到 ${visionCustomRange.end}`
      : visualizationRangeOptions.find((option) => option.value === visionRangePreset)?.label ?? '整场';
  const visionMapModeLabel =
    visionMapMode === 'current'
      ? '当前存活'
      : visionMapMode === 'range'
        ? '所选区间'
        : '整场';

  const pathHeroOptions: HeroSelectionOption[] = [...teamLineups.radiant, ...teamLineups.dire].map((hero) => ({
    value: hero.heroName,
    label: getHeroLabel(hero.heroName, hero.key),
    portraitUrl: hero.portraitUrl,
    team: hero.team,
    key: hero.key,
  }));

  const heatmapHeroOptions = pathHeroOptions;
  const activeOverlayMeta = OVERLAY_MODE_META[heatmapType];
  const effectiveHeatmapHeroes =
    Array.isArray(heatmapSummary?.heroes) && heatmapSummary?.heroes.length > 0
      ? dedupeHeroSelections(heatmapSummary.heroes)
      : dedupeHeroSelections(heatmapHeroFilter);
  const heatmapFocusLabel = effectiveHeatmapHeroes.length > 0
    ? formatSelectedHeroesLabel(effectiveHeatmapHeroes, heatmapHeroOptions, '全部英雄')
    : getTeamPerspectiveLabel(
      heatmapSummary?.team ??
      (heatmapTeamFilter === 'radiant' ? 2 : heatmapTeamFilter === 'dire' ? 3 : null)
    );
  const effectiveHeatmapRange = heatmapSummary?.timeRange ?? {
    start: timelineMinTime,
    end: timelineMaxTime,
  };
  const effectivePathHeroes = dedupeHeroSelections(pathHeroFilter);
  const pathFocusLabel =
    effectivePathHeroes.length > 0
      ? formatSelectedHeroesLabel(effectivePathHeroes, pathHeroOptions, `${pathSummary?.heroCount ?? 0} 名英雄`)
      : `${pathSummary?.heroCount ?? 0} 名英雄`;
  const pathCompressionLabel = pathSummary?.simplification.enabled
    ? `${Math.round((pathSummary.simplification.reduction_ratio ?? 0) * 100)}%`
    : '未压缩';
  const activeHeatmapHeroes = heatmapType !== 'none' ? effectiveHeatmapHeroes : [];
  const activePathHeroes = showPaths ? effectivePathHeroes : [];
  const highlightedHudHeroKeys = new Set(
    [...activeHeatmapHeroes, ...activePathHeroes].map((heroName) => {
      const option = pathHeroOptions.find((item) => item.value === heroName);
      return option ? getTeamHeroKey(option.team, option.value) : heroName;
    })
  );
  const mapFocusHeroLabel = highlightedHudHeroKeys.size > 0
    ? formatSelectedHeroesLabel(
        Array.from(new Set([...activePathHeroes, ...activeHeatmapHeroes])),
        pathHeroOptions,
        '全部英雄'
      )
    : null;
  const mapFocusSourceLabel =
    activePathHeroes.length > 0 ? '路径分析' : activeHeatmapHeroes.length > 0 ? '热力图' : null;
  const isAnalysisOverlayActive = heatmapType !== 'none' || showPaths;
  const isVisionAnalysisFocusMode = mapWorkbenchExpanded && visionMapMode !== 'current';
  const isOverlayDeclutterActive = cleanMapForHeroFocus && isAnalysisOverlayActive && !isVisionAnalysisFocusMode;
  const isMapDeclutterActive = isOverlayDeclutterActive || isVisionAnalysisFocusMode;
  const visibleHeroPositions = isMapDeclutterActive ? [] : heroPositions;
  const visibleWards = isOverlayDeclutterActive
    ? []
    : visionMapRecords.map((record) => toMapWard(record, currentTime));
  const objectiveAttackerTeamByName = useMemo(() => {
    const lookup: Record<string, number> = {};

    for (const hero of [...teamLineups.radiant, ...teamLineups.dire]) {
      const teamId = hero.team === 'radiant' ? 2 : 3;
      lookup[hero.heroName.trim().toLowerCase()] = teamId;
    }

    return lookup;
  }, [teamLineups]);
  const liveObjectiveMarkers = useMemo(
    () => buildObjectiveMarkers(currentDisplayGameTime, objectivesResponse, objectiveAttackerTeamByName),
    [currentDisplayGameTime, objectiveAttackerTeamByName, objectivesResponse]
  );
  const objectiveSummary = useMemo(
    () => summarizeObjectiveMarkers(liveObjectiveMarkers),
    [liveObjectiveMarkers]
  );
  const visibleKillMarkers = isMapDeclutterActive ? [] : activeKillMarkers;
  const visibleHeatmapGrid = isVisionAnalysisFocusMode ? null : heatmapGrid;
  const visibleHeatmapBounds = isVisionAnalysisFocusMode ? null : heatmapBounds;
  const visiblePathOverlays = isVisionAnalysisFocusMode ? null : pathOverlays;
  const visiblePathTraceState = isVisionAnalysisFocusMode ? false : showPaths;
  const anyMapOverlayOpen = mapOverlayPanels.insight.open || mapOverlayPanels.legend.open;

  const renderMapIntegratedOverlay = () => {
    if (!floatingOverlayEnabled || isVisionAnalysisFocusMode) {
      return null;
    }

    const renderFloatingPanel = (
      key: MapOverlayPanelKey,
      accentClassName: string,
      content: ReactNode
    ) => {
      const panelState = mapOverlayPanels[key];
      if (!panelState.open) {
        return null;
      }

      return (
        <div
          ref={(node) => {
            mapOverlayPanelRefs.current[key] = node;
          }}
          data-testid={`map-overlay-panel-${key}`}
          className={`absolute overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/86 backdrop-blur-md ${
            draggingMapOverlayPanel === key
              ? 'z-30 shadow-[0_22px_60px_rgba(8,15,34,0.58)]'
              : 'z-20 shadow-[0_16px_36px_rgba(2,6,23,0.45)]'
          }`}
          style={{
            left: panelState.x,
            top: panelState.y,
            width: MAP_OVERLAY_PANEL_META[key].width,
          }}
        >
          <div
            data-testid={`map-overlay-drag-handle-${key}`}
            onPointerDown={(event) => handleMapOverlayPointerDown(key, event)}
            className="flex cursor-grab items-start justify-between gap-3 border-b border-slate-800/90 bg-slate-950/95 px-3 py-2.5 active:cursor-grabbing"
          >
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${accentClassName}`}>
                {MAP_OVERLAY_PANEL_META[key].title}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">拖动标题栏可移动，右侧可随时隐藏。</p>
            </div>
            <button
              type="button"
              aria-label={`隐藏${MAP_OVERLAY_PANEL_META[key].title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setMapOverlayOpen(key, false)}
              className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
            >
              隐藏
            </button>
          </div>

          <div className="p-3">{content}</div>
        </div>
      );
    };

    return (
      <>
        {renderFloatingPanel(
          'insight',
          'text-cyan-300/85',
          <>
            <p className="text-sm font-semibold text-slate-100">{activeOverlayMeta.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">{activeOverlayMeta.description}</p>

            <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                <p className="text-slate-500">统计对象</p>
                <p className="mt-1 font-semibold text-slate-100">{activeOverlayMeta.filterLabel}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                <p className="text-slate-500">当前聚焦</p>
                <p className="mt-1 font-semibold text-slate-100">{heatmapFocusLabel}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                <p className="text-slate-500">样本量</p>
                <p className="mt-1 font-semibold text-slate-100">
                  {heatmapSummary ? formatHudValue(heatmapSummary.totalSamples) : '未启用'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                <p className="text-slate-500">时间范围</p>
                <p className="mt-1 font-semibold text-slate-100">
                  {formatGameClockTime(effectiveHeatmapRange.start)} 到 {formatGameClockTime(effectiveHeatmapRange.end)}
                </p>
              </div>
            </div>

            {heatmapType !== 'none' && (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-slate-500">{activeOverlayMeta.densityLabel}</p>
                    <p className="mt-1 text-xs text-slate-300">蓝色稀疏，红色最密集</p>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-100">
                    峰值 {heatmapSummary ? formatHudValue(heatmapSummary.maxDensity) : '-'}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#06b6d4_35%,#fde047_70%,#ef4444_100%)]" />
              </div>
            )}

            {showPaths && (
              <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-cyan-100">路径分析</p>
                  <span className="text-cyan-200/80">压缩 {pathCompressionLabel}</span>
                </div>
                <p className="mt-1 text-cyan-50/85">
                  当前展示 {pathFocusLabel} 在所选时间段内的完整移动轨迹。
                </p>
              </div>
            )}

            {isMapDeclutterActive && (
              <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[11px] text-amber-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">分析视图净化中</p>
                  <span className="text-amber-200/80">{mapFocusSourceLabel ?? activeOverlayMeta.title}</span>
                </div>
                <p className="mt-1 text-amber-50/90">
                  {mapFocusHeroLabel
                    ? `当前专注 ${mapFocusHeroLabel}，已隐藏英雄头像、眼位和死亡爆点，方便直接读主图层。`
                    : '当前已隐藏英雄头像、眼位和死亡爆点，让热力图与路径层更清晰。'}
                </p>
              </div>
            )}
          </>
        )}

        {renderFloatingPanel(
          'legend',
          'text-slate-400',
          <div className="space-y-2 text-[11px] text-slate-200">
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rounded-full border border-white/80 bg-emerald-400" />
              <span>英雄头像/圆点：当前仍存活的实时位置</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm border border-slate-100 bg-emerald-500" />
              <span>方块 / 矩形 / 大圆：防御塔、兵营、遗迹等建筑目标</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative h-3.5 w-3.5 rounded-full border-2 border-amber-200 bg-amber-400/30">
                <div className="absolute inset-[3px] rounded-full bg-amber-100/80" />
              </div>
              <span>金色外环：Roshan / Tormentor 正在刷新，或进入刷新窗口</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative h-3.5 w-3.5 rounded-sm border border-slate-400 bg-slate-500/50">
                <div className="absolute left-0.5 top-1/2 h-px w-3 -translate-y-1/2 rotate-45 bg-slate-100" />
              </div>
              <span>灰色斜杠：建筑已被摧毁，或目标物当前未激活</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rounded-full border border-emerald-300 bg-yellow-300" />
              <span>假眼：当前仍存在的 Observer Ward</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rotate-45 border border-rose-300 bg-indigo-300" />
              <span>真眼：当前仍存在的 Sentry Ward</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(248,113,113,0.75)]" />
              <span>红色爆点：最近 5 秒的死亡位置</span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-2 text-slate-300">
              建筑概览：存活 {objectiveSummary.alive} · 摧毁 {objectiveSummary.destroyed}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-2.5 py-2 text-slate-300">
              热力图颜色仍然遵循同一条密度带：蓝色稀疏，红色最密集。
            </div>
          </div>
        )}
      </>
    );
  };

  const renderWardPreviewPopover = () => {
    if (!activeWardPreview || typeof document === 'undefined') {
      return null;
    }

    const position = getWardPopoverPosition(
      activeWardPreview.anchorX,
      activeWardPreview.anchorY,
      activeWardPreview.wards.length
    );

    return createPortal(
      <div
        data-testid="ward-detail-popover"
        className={`fixed z-[220] ${pinnedWardPreview ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          left: position.left,
          top: position.top,
          width: position.maxWidth,
          transform: position.placeAbove ? 'translateY(-100%)' : undefined,
        }}
      >
        <div className="ward-popover-panel">
          <div className="ward-popover-header">
            <div>
              <p className="ward-popover-eyebrow">
                {pinnedWardPreview ? '已固定眼位详情' : '眼位详情'}
              </p>
              <p className="ward-popover-note">
                {pinnedWardPreview ? '点击地图空白处可取消固定。' : '悬停查看，点击地图即可固定当前窗口。'}
              </p>
            </div>
            <div className="ward-popover-actions">
              <span>
                {formatHudValue(activeWardPreview.wards.length)} 个眼位
              </span>
              {pinnedWardPreview && (
                <button
                  type="button"
                  onClick={handleUnpinWardPreview}
                >
                  取消固定
                </button>
              )}
            </div>
          </div>

          <div className="ward-popover-list">
            {activeWardPreview.wards.map((record) => (
              <div
                key={record.instanceKey}
                data-testid={`selected-ward-card-${record.instanceKey}`}
                className="ward-detail-row"
              >
                <div className="ward-detail-main">
                  <div className="ward-detail-title">
                    <strong>{getWardPlacementLabel(record)}</strong>
                    <span>坐标 {getWardCoordinateLabel(record)}</span>
                  </div>
                  <span className={`ward-type-badge ${
                    record.type === 'observer'
                      ? 'ward-type-badge-observer'
                      : 'ward-type-badge-sentry'
                  }`}>
                    {record.type === 'observer' ? '假眼' : '真眼'}
                  </span>
                </div>

                <div className="ward-detail-meta">
                  <span>
                    <small>插下</small>
                    <strong>
                      {formatGameClockTime(record.placedGameTime)}
                    </strong>
                  </span>
                  <span>
                    <small>持续</small>
                    <strong>
                      {formatDurationLabel(record.lifetimeSeconds)}
                    </strong>
                  </span>
                </div>

                <p className="ward-detail-line">
                  {getWardPlacerFieldLabel(record)}：{getWardPlacerDisplayName(record)}
                </p>
                <p className="ward-detail-line ward-detail-removal">
                  {getWardRemovalLabel(record)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="replay-workspace-page">
      <div className="replay-workspace-inner">
        <div className="replay-command-panel">
          <div
            data-testid="replay-viewer-header"
            className="replay-command-compact"
          >
            <div className="replay-command-primary">
              <div className="replay-command-title-row">
                <h1>录像主工作区</h1>
                {selectedMatch && (
                  <span className="replay-command-token font-mono">
                    match_id {selectedMatch}
                  </span>
                )}
                {winnerLabel && (
                  <span
                    data-testid="match-winner-badge"
                    className={`replay-command-token ${
                      winnerTeam === 'radiant'
                        ? 'replay-command-token-radiant'
                        : 'replay-command-token-dire'
                    }`}
                  >
                    胜者 {winnerLabel}
                  </span>
                )}
              </div>

              {selectedMatch && (
                <div className="replay-command-teams">
                  <p data-testid="match-radiant-name" className="truncate">
                    {radiantTeamName}
                  </p>
                  {winnerTeam === 'radiant' && <span>胜方</span>}
                  <strong>VS</strong>
                  <p data-testid="match-dire-name" className="truncate">
                    {direTeamName}
                  </p>
                  {winnerTeam === 'dire' && <span>胜方</span>}
                </div>
              )}

              <div className="replay-command-meta">
                {(replayEntryContext?.source === 'match_database' || replayEntryContext?.source === 'replay_library') && (
                  <span
                    className={`replay-command-token ${
                      replayEntryContext?.source === 'match_database'
                        ? 'replay-command-token-accent'
                        : 'replay-command-token-radiant'
                    }`}
                  >
                    {replayEntryContext?.source === 'match_database'
                      ? `比赛数据库${replaySourceStatusText ? ` · ${replaySourceStatusText}` : ''}`
                      : '本地回放库'}
                  </span>
                )}
                {timeBasisSource === 'fallback' && (
                  <span className="replay-command-token replay-command-token-warning">
                    回退时间基准
                  </span>
                )}
                {matchSourceLabel && (
                  <span className="replay-command-token">
                    {isProfessionalMatch ? '职业比赛' : '路人比赛'} · {matchSourceLabel}
                  </span>
                )}
                {isReparseTaskActive && reparseTask && (
                  <span className="replay-command-token replay-command-token-accent">
                    重新解析 {Math.round(reparseTask.progress ?? 0)}%
                  </span>
                )}
                {selectedReplayFileName && (
                  <span className="replay-command-token">
                    replay {selectedReplayFileName}
                  </span>
                )}
                {selectedMatchDetail?.parse_status && (
                  <span className="replay-command-token">
                    解析 {selectedMatchDetail.parse_status}
                  </span>
                )}
                {(selectedMatchDetail?.parsed_at ?? selectedMatchRecord?.parsed_at) && (
                  <span className="replay-command-token">
                    最近解析{' '}
                    {new Date(
                      selectedMatchDetail?.parsed_at ?? selectedMatchRecord?.parsed_at ?? ''
                    ).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            <div
              data-testid="replay-viewer-header-selection"
              className="replay-command-select"
            >
              {matches.length === 0 ? (
                <div className="text-xs text-slate-400">
                  暂无已解析的比赛。
                </div>
              ) : (
                <div className="replay-match-picker" ref={matchPickerRef}>
                  <button
                    type="button"
                    data-testid="match-picker-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={matchPickerOpen}
                    onClick={() => setMatchPickerOpen((current) => !current)}
                    className="replay-match-picker-trigger"
                  >
                    <span className="replay-match-picker-title">
                      {selectedMatchPickerOption?.label ?? '选择比赛'}
                    </span>
                    <span className="replay-match-picker-meta">
                      {selectedMatchPickerOption
                        ? `${selectedMatchPickerOption.id} · ${selectedMatchPickerOption.meta}`
                        : `${matches.length} 场已解析`}
                    </span>
                  </button>
                  {matchPickerOpen && (
                    <div className="replay-match-picker-panel" role="dialog" aria-label="选择比赛录像">
                      <div className="replay-match-picker-search">
                        <input
                          type="search"
                          value={matchPickerQuery}
                          autoFocus
                          onChange={(event) => setMatchPickerQuery(event.target.value)}
                          placeholder="搜索队名或 match id"
                          aria-label="搜索比赛录像"
                        />
                        <span>{filteredMatchPickerOptions.length}/{matches.length}</span>
                      </div>
                      <div className="replay-match-picker-list" role="listbox" aria-label="比赛录像列表">
                        {filteredMatchPickerOptions.length === 0 ? (
                          <div className="replay-match-picker-empty">没有匹配的录像</div>
                        ) : (
                          filteredMatchPickerOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              role="option"
                              aria-selected={option.id === selectedMatch}
                              className="replay-match-picker-option"
                              onClick={() => selectReplayMatch(option.id)}
                            >
                              <span>
                                <strong>{option.label}</strong>
                                <small>{option.id} · {option.meta}</small>
                              </span>
                              <em>{option.sourceLabel}</em>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={loadMatches}
                    className="shrink-0 rounded-full border border-[#73929d]/45 bg-[#274255]/28 px-2.5 py-1 text-[10px] font-medium text-[#d7edf0] transition hover:border-[#98bac2]/58 hover:bg-[#31556a]/32"
                  >
                    刷新
                  </button>
                </div>
              )}
            </div>
          </div>

          {replayContextWarning && (
            <div className="mt-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {replayContextWarning}
            </div>
          )}

          {hasLegacyItemSlotWarning && (
            <div className="mt-2 flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">旧版物品槽解析</p>
                <p className="mt-1 font-medium text-amber-50">
                  当前录像很可能仍是旧版解析结果，背包/中立槽位可能不完全准确。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleReparseCurrentMatch()}
                disabled={!selectedReplayPath || isReparseTaskActive}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                  !selectedReplayPath || isReparseTaskActive
                    ? 'cursor-not-allowed border-slate-700 bg-slate-900 text-slate-500'
                    : 'border-amber-400/50 bg-amber-500/10 text-amber-100 hover:border-amber-300/70'
                }`}
              >
                {isReparseTaskActive ? '重新解析中...' : '重新解析当前录像'}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-700/70 bg-red-900/20 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="replay-map-panel">
          <div className="replay-map-overview">
            <p className="replay-map-eyebrow">Map Workspace</p>
            <h2>地图主工作台</h2>
            <button
              type="button"
              data-testid="toggle-map-workbench"
              onClick={() => {
                if (mapWorkbenchExpanded) {
                  setMapWorkbenchExpanded(false);
                  return;
                }
                setMapWorkbenchRendered(true);
                setMapWorkbenchExpanded(true);
              }}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                mapWorkbenchExpanded
                  ? 'border-amber-500/45 bg-amber-500/10 text-amber-100 hover:border-amber-400/60'
                  : 'border-[#7f9da5]/50 bg-[#27404d]/28 text-[#d6edf0] shadow-[0_12px_24px_rgba(15,33,41,0.18)] hover:border-[#a3c4ca]/62'
              }`}
            >
              {mapWorkbenchExpanded ? '关闭工作台' : '打开工作台'}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            {loading && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-100">回放数据加载中...</span>}
            {hudMetricsLoading && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-100">HUD 同步中...</span>}
            {heatmapLoading && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-100">热力图加载中...</span>}
            {pathLoading && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-100">路径分析加载中...</span>}
            {heatmapError && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">{heatmapError}</span>}
            {pathError && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">{pathError}</span>}
            {hudMetricsError && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">{hudMetricsError}</span>}
            {hudMetricsWarnings.map((warning) => (
              <span
                key={warning}
                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200"
              >
                {warning}
              </span>
            ))}
            {reparseFeedback && (
              <span className={`rounded-full border px-2.5 py-1 ${
                reparseFeedback.type === 'error'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : reparseFeedback.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
              }`}>
                {reparseFeedback.message}
              </span>
            )}
            {reparseTask && !mapWorkbenchExpanded && (
              <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-2.5 py-1 text-slate-300">
                重新解析 {reparseTask.status} · {Math.round(reparseTask.progress ?? 0)}%
              </span>
            )}
          </div>

          {selectedMatch && mapWorkbenchRendered && typeof document !== 'undefined' && createPortal(
            <div
              className={`replay-workbench-float ${
                mapWorkbenchExpanded ? 'replay-workbench-float-open' : 'replay-workbench-float-closing'
              }`}
              role="dialog"
              aria-label="地图图层工作台"
            >
              <div className="replay-workbench-float-header">
                <div>
                  <p>Layer Workbench</p>
                  <h3>地图控制台</h3>
                </div>
                <button type="button" onClick={() => setMapWorkbenchExpanded(false)}>
                  关闭
                </button>
              </div>
              <div className="replay-workbench-scroll">
              <div data-testid="ward-analysis-panel" className="replay-workbench-section replay-workbench-section-heatmap">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">热力图层</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      将位置采样、击杀或阵亡密度叠加到主地图，并明确当前统计口径。
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
                    {activeOverlayMeta.title}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    { key: 'none' as const, label: '关闭' },
                    { key: 'movement' as const, label: '移动' },
                    { key: 'kill' as const, label: '击杀' },
                    { key: 'death' as const, label: '死亡' },
                  ] as const).map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setHeatmapType(option.key)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                        heatmapType === option.key
                          ? 'border-dota-gold/50 bg-dota-gold/15 text-dota-gold'
                          : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <select
                    data-testid="heatmap-range-select"
                    value={heatmapRangePreset}
                    onChange={(event) => setHeatmapRangePreset(event.target.value as VisualizationRangePreset)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200"
                  >
                    {visualizationRangeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        时间范围：{option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={heatmapTeamFilter}
                    onChange={(event) => setHeatmapTeamFilter(event.target.value as 'all' | 'radiant' | 'dire')}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200"
                  >
                    <option value="all">全部队伍</option>
                    <option value="radiant">天辉</option>
                    <option value="dire">夜魇</option>
                  </select>
                </div>

                <div className="mt-3">
                  <HeroMultiSelect
                    options={heatmapHeroOptions}
                    selectedHeroes={heatmapHeroFilter}
                    onToggleHero={toggleHeatmapHeroFilter}
                    onClear={() => setHeatmapHeroFilter([])}
                    dataTestIdPrefix="heatmap"
                    allLabel="全部英雄"
                  />
                </div>

                {heatmapRangePreset === 'custom' && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-slate-500">开始时间</span>
                      <input
                        type="text"
                        data-testid="heatmap-range-start"
                        value={heatmapCustomRange.start}
                        onChange={(event) => setHeatmapCustomRange((current) => ({ ...current, start: event.target.value }))}
                        placeholder="-1:30"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                    <label className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-slate-500">结束时间</span>
                      <input
                        type="text"
                        data-testid="heatmap-range-end"
                        value={heatmapCustomRange.end}
                        onChange={(event) => setHeatmapCustomRange((current) => ({ ...current, end: event.target.value }))}
                        placeholder="12:00"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                    <p className="md:col-span-2 text-xs text-slate-500">
                      输入比赛时钟，例如 `0:00`、`12:30`、`-1:30`。不带冒号时按分钟处理，如 `18` 表示 18:00。
                    </p>
                  </div>
                )}

              </div>

              <div className="replay-workbench-section replay-workbench-section-path">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">路径与校准</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      轨迹线只压缩冗余点，不改变大轮廓，可按英雄和时间段查看。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPaths((current) => !current)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                      showPaths
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                    }`}
                  >
                    {showPaths ? '路径分析已开启' : '开启路径分析'}
                  </button>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <select
                    data-testid="path-range-select"
                    value={pathRangePreset}
                    onChange={(event) => setPathRangePreset(event.target.value as VisualizationRangePreset)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200"
                  >
                    {visualizationRangeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        路径范围：{option.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200">
                    <input
                      type="checkbox"
                      checked={pathSimplify}
                      onChange={(event) => setPathSimplify(event.target.checked)}
                      className="rounded"
                    />
                    简化轨迹
                  </label>
                  <select
                    value={pathEpsilon}
                    onChange={(event) => setPathEpsilon(Number(event.target.value))}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200"
                  >
                    {[50, 100, 200].map((value) => (
                      <option key={value} value={value}>
                        压缩强度 epsilon {value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3">
                  <HeroMultiSelect
                    options={pathHeroOptions}
                    selectedHeroes={pathHeroFilter}
                    onToggleHero={togglePathHeroFilter}
                    onClear={() => setPathHeroFilter([])}
                    dataTestIdPrefix="path"
                    allLabel="路径：全部英雄"
                  />
                </div>

                {pathRangePreset === 'custom' && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-slate-500">路径开始</span>
                      <input
                        type="text"
                        data-testid="path-range-start"
                        value={pathCustomRange.start}
                        onChange={(event) => setPathCustomRange((current) => ({ ...current, start: event.target.value }))}
                        placeholder="-1:30"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                    <label className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-slate-500">路径结束</span>
                      <input
                        type="text"
                        data-testid="path-range-end"
                        value={pathCustomRange.end}
                        onChange={(event) => setPathCustomRange((current) => ({ ...current, end: event.target.value }))}
                        placeholder="12:00"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                  </div>
                )}

              </div>

              <div className="replay-workbench-section replay-workbench-section-vision">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">单场视野分析</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      hover 在鼠标旁查看，点击固定；切到整场或区间地图时会自动进入视野专注模式。
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
                    {visionMapModeLabel}
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: 'current' as const, label: '当前存活' },
                      { key: 'range' as const, label: '所选区间' },
                      { key: 'full' as const, label: '整场' },
                    ] as const).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        data-testid={`vision-map-mode-${option.key}`}
                        onClick={() => setVisionMapMode(option.key)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                          visionMapMode === option.key
                            ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <select
                    data-testid="vision-range-select"
                    value={visionRangePreset}
                    onChange={(event) => setVisionRangePreset(event.target.value as VisualizationRangePreset)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200"
                  >
                    {visualizationRangeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        视野范围：{option.label}
                      </option>
                    ))}
                  </select>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <select
                      data-testid="vision-team-select"
                      value={visionTeamFilter}
                      onChange={(event) => setVisionTeamFilter(event.target.value as WardTeamFilter)}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200"
                    >
                      <option value="all">全部队伍</option>
                      <option value="radiant">天辉</option>
                      <option value="dire">夜魇</option>
                    </select>
                    <select
                      data-testid="vision-type-select"
                      value={visionWardTypeFilter}
                      onChange={(event) => setVisionWardTypeFilter(event.target.value as WardTypeFilter)}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[13px] text-slate-200"
                    >
                      <option value="all">假眼 + 真眼</option>
                      <option value="observer">仅假眼</option>
                      <option value="sentry">仅真眼</option>
                    </select>
                  </div>
                </div>

                {visionRangePreset === 'custom' && (
                  <div className="mt-3 grid gap-2">
                    <label className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-slate-500">视野开始</span>
                      <input
                        type="text"
                        data-testid="vision-range-start"
                        value={visionCustomRange.start}
                        onChange={(event) => setVisionCustomRange((current) => ({ ...current, start: event.target.value }))}
                        placeholder="-1:30"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                    <label className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200">
                      <span className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-slate-500">视野结束</span>
                      <input
                        type="text"
                        data-testid="vision-range-end"
                        value={visionCustomRange.end}
                        onChange={(event) => setVisionCustomRange((current) => ({ ...current, end: event.target.value }))}
                        placeholder="12:00"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      />
                    </label>
                  </div>
                )}

                {visionTimeRange.error && (
                  <p className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {visionTimeRange.error}
                  </p>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <p className="text-[11px] text-slate-500">范围覆盖</p>
                    <p data-testid="ward-analysis-total" className="mt-1 text-lg font-semibold text-slate-100">{formatHudValue(filteredWardPlacements.length)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <p className="text-[11px] text-slate-500">范围末仍存活</p>
                    <p data-testid="ward-analysis-active" className="mt-1 text-lg font-semibold text-cyan-100">{formatHudValue(survivingWardPlacementsAtRangeEnd.length)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <p className="text-[11px] text-slate-500">当前活跃</p>
                    <p data-testid="ward-realtime-active" className="mt-1 text-lg font-semibold text-emerald-200">{formatHudValue(currentTimelineWardPlacements.length)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <p className="text-[11px] text-slate-500">已被排</p>
                    <p data-testid="ward-analysis-dewarded" className="mt-1 text-lg font-semibold text-rose-200">{formatHudValue(destroyedWardPlacements.length)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <p className="text-[11px] text-slate-500">自然到时</p>
                    <p data-testid="ward-analysis-expired" className="mt-1 text-lg font-semibold text-amber-200">{formatHudValue(expiredWardPlacements.length)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                    实时假眼 {formatHudValue(currentRealtimeObserverWardCount)}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                    实时真眼 {formatHudValue(currentRealtimeSentryWardCount)}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                    平均存活 <span data-testid="ward-analysis-average-lifetime">{formatDurationLabel(averageWardLifetimeSeconds)}</span>
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                    区间 {visionRangeLabel}
                  </span>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">最近视野变化</p>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-300">
                      {formatHudValue(recentWardEvents.length)}
                    </span>
                  </div>
                  <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto">
                    {recentWardEvents.length === 0 ? (
                      <p className="text-sm text-slate-500">当前筛选范围还没有视野变化。</p>
                    ) : (
                      recentWardEvents.map((record) => (
                        <div key={`recent-ward-${record.instanceKey}`} className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-100">{getWardPlacementLabel(record)}</p>
                            <span className="text-xs text-slate-300">{formatDurationLabel(record.lifetimeSeconds)}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {getWardPlacerSummary(record)} · {getWardRemovalLabel(record)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">整场全部眼位</p>
                      <p className="mt-1 text-xs text-slate-400">
                        尊重当前队伍与真假眼筛选，但不受上面的时间区间限制。
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-300">
                      {formatHudValue(fullMatchWardPlacementsSorted.length)}
                    </span>
                  </div>
                  <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
                    {fullMatchWardPlacementsSorted.length === 0 ? (
                      <p className="text-sm text-slate-500">当前筛选下整场没有眼位数据。</p>
                    ) : (
                      fullMatchWardPlacementsSorted.map((record) => (
                        <div key={`all-ward-${record.instanceKey}`} className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-100">{getWardPlacementLabel(record)}</p>
                            <span className="text-xs text-slate-300">
                              插于 {formatGameClockTime(record.placedGameTime)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            坐标 {getWardCoordinateLabel(record)} · {getWardPlacerSummary(record)} · {getWardRemovalLabel(record)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">整场排眼记录</p>
                      <p className="mt-1 text-xs text-slate-400">
                        这里会直接列出所有被排掉的眼位和排眼来源，方便核对解析器输出。
                      </p>
                    </div>
                    <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-100">
                      {formatHudValue(fullMatchDestroyedPlacementsSorted.length)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                      英雄 {formatHudValue(destroyedByHeroCount)}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                      召唤物 {formatHudValue(destroyedBySummonCount)}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                      小兵 {formatHudValue(destroyedByLaneCreepCount)}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                      中立 {formatHudValue(destroyedByNeutralCount)}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                      其他单位 {formatHudValue(destroyedByUnitCount)}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-slate-300">
                      未知 {formatHudValue(destroyedUnknownCount)}
                    </span>
                  </div>

                  <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
                    {fullMatchDestroyedPlacementsSorted.length === 0 ? (
                      <p className="text-sm text-slate-500">当前筛选下整场没有排眼记录。</p>
                    ) : (
                      fullMatchDestroyedPlacementsSorted.map((record) => (
                        <div key={`destroyed-ward-${record.instanceKey}`} className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-100">{getWardPlacementLabel(record)}</p>
                            <span className="text-xs text-rose-200">
                              被排于 {formatGameClockTime(record.removalGameTime)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            插于 {formatGameClockTime(record.placedGameTime)} · {getWardPlacerSummary(record)} · {record.destroyerLabel}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="replay-workbench-section replay-workbench-section-status">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">状态与提醒</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      在这里执行刷新、重新解析，并检查当前加载状态。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshCurrentMatch}
                      disabled={!selectedMatch || loading}
                      className={`rounded-full border px-3 py-1 text-[11px] transition ${
                        !selectedMatch || loading
                          ? 'cursor-not-allowed border-slate-700 bg-slate-950/75 text-slate-500'
                          : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                      }`}
                    >
                      刷新当前比赛
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReparseCurrentMatch()}
                      disabled={!selectedReplayPath || isReparseTaskActive}
                      className={`rounded-full border px-3 py-1 text-[11px] transition ${
                        !selectedReplayPath || isReparseTaskActive
                          ? 'cursor-not-allowed border-slate-700 bg-slate-950/75 text-slate-500'
                          : 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100 hover:border-cyan-400/65'
                      }`}
                    >
                      {isReparseTaskActive ? '重新解析中...' : '重新解析当前录像'}
                    </button>
                  </div>
                </div>

                <label className="mt-3 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    data-testid="toggle-map-declutter"
                    checked={cleanMapForHeroFocus}
                    onChange={(event) => setCleanMapForHeroFocus(event.target.checked)}
                    className="mt-1 rounded"
                  />
                  <span>
                    <span className="block font-medium text-slate-100">分析图层开启时自动净化地图</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">
                      自动隐藏英雄头像、眼位和死亡爆点，让热区和轨迹成为主视图。
                    </span>
                  </span>
                </label>

                {reparseTask && (
                  <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                      <span>重新解析任务 {reparseTask.task_id.slice(0, 8)}</span>
                      <span className="font-mono text-slate-100">
                        {reparseTask.status} · {Math.round(reparseTask.progress ?? 0)}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950">
                      <div
                        className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
                        style={{ width: `${Math.max(4, Math.min(100, Math.round(reparseTask.progress ?? 0)))}%` }}
                      />
                    </div>
                    {selectedReplayPath && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        目标文件：{selectedReplayPath}
                      </p>
                    )}
                  </div>
                )}
              </div>
              </div>
            </div>,
            document.querySelector('.replay-workspace-inner') ?? document.body
          )}

          <div className="min-w-0">
            <div className="replay-map-layout" data-testid="hud-metrics-panel">
              <div className="replay-map-stage">
                <div className="replay-map-stage-header">
                  <div className="replay-map-stage-title">
                    <p>主地图</p>
                    <h3>{selectedMatch ? `比赛 ${selectedMatch}` : '等待选择比赛'}</h3>
                  </div>

                  {floatingOverlayEnabled && (
                    <div className="replay-map-overlay-group">
                      <div
                        data-testid="map-overlay-toolbar"
                        className="replay-map-overlay-actions"
                      >
                        <button
                          type="button"
                          data-testid="focus-map-overlays"
                          onClick={anyMapOverlayOpen ? hideAllMapOverlays : restoreDefaultMapOverlays}
                          className={`rounded-xl border px-3 py-1.5 transition ${
                            anyMapOverlayOpen
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-100 hover:border-amber-400/60'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400/60'
                          }`}
                        >
                          {anyMapOverlayOpen ? '专注地图' : '恢复默认浮窗'}
                        </button>
                        <button
                          type="button"
                          data-testid="toggle-map-overlay-insight"
                          aria-pressed={mapOverlayPanels.insight.open}
                          onClick={() => toggleMapOverlayOpen('insight')}
                          className={`rounded-xl border px-3 py-1.5 transition ${
                            mapOverlayPanels.insight.open
                              ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
                              : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                          }`}
                        >
                          {mapOverlayPanels.insight.open ? '隐藏说明' : '显示说明'}
                        </button>
                        <button
                          type="button"
                          data-testid="toggle-map-overlay-legend"
                          aria-pressed={mapOverlayPanels.legend.open}
                          onClick={() => toggleMapOverlayOpen('legend')}
                          className={`rounded-xl border px-3 py-1.5 transition ${
                            mapOverlayPanels.legend.open
                              ? 'border-cyan-500/45 bg-cyan-500/10 text-cyan-100'
                              : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                          }`}
                        >
                          {mapOverlayPanels.legend.open ? '隐藏图例' : '显示图例'}
                        </button>
                        <button
                          type="button"
                          onClick={resetMapOverlayPositions}
                          className="rounded-xl border border-slate-700 bg-slate-950/75 px-3 py-1.5 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                        >
                          重置位置
                        </button>
                      </div>
                      <span>Esc 清空浮窗</span>
                    </div>
                  )}
                </div>

                <div className="replay-map-stage-meta">
                  <div
                    data-testid="map-status-strip"
                    className="replay-map-status-strip"
                  >
                    <span className="replay-map-status-item replay-map-status-item-accent">
                      <span>时钟</span>
                      <strong>{currentGameClockLabel}</strong>
                    </span>
                    <span
                      className={`replay-map-status-item ${
                        isPauseActive ? 'replay-map-status-item-warning' : 'replay-map-status-item-live'
                      }`}
                    >
                      <span>状态</span>
                      <strong>{isPauseActive ? '暂停区间' : '进行中'}</strong>
                    </span>
                    <span className="replay-map-status-item">
                      <span>时长</span>
                      <strong>{matchDurationClockLabel}</strong>
                    </span>
                    <span className="replay-map-status-item">
                      <span>建筑</span>
                      <strong>
                        {objectiveSummary.alive}/{liveObjectiveMarkers.length}
                      </strong>
                    </span>
                  </div>

                  <div data-testid="map-view-strip" className="sr-only">
                    当前图层 {activeOverlayMeta.title}，热力 {activeHeatmapLabel}，范围 {activeRangeLabel}，
                    路径 {showPaths ? '开启' : '关闭'}，视野 {visionMapModeLabel}
                  </div>
                </div>

                {selectedMatch ? (
                  <>
                    {isMapDeclutterActive && (
                      <div className="replay-map-focus-banner">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/80">分析视图净化</p>
                          <p className="mt-1 font-medium text-amber-50">
                            {isVisionAnalysisFocusMode
                              ? `单场视野分析 · ${visionMapModeLabel}`
                              : mapFocusHeroLabel
                                ? `${mapFocusSourceLabel} · ${mapFocusHeroLabel}`
                                : `${showPaths ? '路径分析' : activeOverlayMeta.title} · 已清理干扰元素`}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-amber-100/80">
                            {isVisionAnalysisFocusMode
                              ? '主地图已临时隐藏英雄头像、热力图、路径和死亡爆点，只保留当前眼位分析需要的内容；实时视野统计仍会继续更新。'
                              : '主地图已临时隐藏英雄头像、眼位和死亡爆点，只保留当前分析图层需要的内容。'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isVisionAnalysisFocusMode) {
                              setVisionMapMode('current');
                              return;
                            }
                            setCleanMapForHeroFocus(false);
                          }}
                          className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-300/60"
                        >
                          {isVisionAnalysisFocusMode ? '回到实时视野' : '恢复全部图层'}
                        </button>
                      </div>
                    )}

                    <div className="replay-map-arena">
                      <div
                        ref={mapOverlayContainerRef}
                        data-testid="map-overlay-container"
                        className="replay-map-canvas-shell"
                      >
                        <MapViewer
                          key={`${showCalibration ? 'calibration' : 'normal'}-${mapViewportSize}`}
                          width={mapViewportSize}
                          height={mapViewportSize}
                          heroPositions={visibleHeroPositions}
                          wards={visibleWards}
                          objectives={liveObjectiveMarkers}
                          killMarkers={visibleKillMarkers}
                          currentGameTime={currentDisplayGameTime}
                          showCalibrationMarkers={showCalibration}
                          heatmapGrid={visibleHeatmapGrid}
                          heatmapBounds={visibleHeatmapBounds}
                          pathOverlays={visiblePathOverlays}
                          showPaths={visiblePathTraceState}
                          selectedWardKeys={selectedWardKeys}
                          onWardHoverChange={handleWardHoverChange}
                          onWardClick={handleWardClick}
                        />
                        <div className="replay-map-hud-panel replay-map-hud-panel-radiant">
                          {renderHudLane('radiant')}
                        </div>
                        <div className="replay-map-hud-panel replay-map-hud-panel-dire">
                          {renderHudLane('dire')}
                        </div>
                        {renderMapIntegratedOverlay()}
                      </div>
                    </div>

                    <div className="replay-timeline-shell replay-timeline-shell-dock">
                      <Timeline
                        currentTime={currentTime}
                        minTime={timelineMinTime}
                        maxTime={timelineMaxTime}
                        onTimeChange={handleTimeChange}
                        isLoading={loading}
                        disabled={!selectedMatch || matches.length === 0}
                        formatTime={formatTimeDisplay}
                        showTimeDisplay={false}
                        pauseSegments={gameClockMapperRef.current.pauseIntervals}
                        isPausedAtTime={(time) => gameClockMapperRef.current.isPausedAtSourceTime(time)}
                      />
                    </div>

                    <div
                      data-testid="map-analysis-strip"
                      className="replay-map-footnote"
                    >
                      <span>{showPaths ? pathFocusLabel : activeOverlayMeta.densityLabel}</span>
                      <span>聚焦 {heatmapFocusLabel}</span>
                      <span>样本 {heatmapSummary ? formatHudValue(heatmapSummary.totalSamples) : '--'}</span>
                      {showPaths && <span>路径 {pathCompressionLabel}</span>}
                      <span>偏移 {timeBasisOffsetSeconds.toFixed(2)}s</span>
                    </div>

                    <div className="replay-chart-shell">
                      <AdvantageChart
                        matchId={selectedMatch}
                        currentGameTime={currentDisplayGameTime}
                      />
                    </div>
                  </>
                ) : (
                  <div className="replay-map-empty-state">
                    <p className="text-sm text-slate-400">选择一场比赛后，主地图、HUD 和时间轴会在这里联动。</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
      {renderWardPreviewPopover()}
    </div>
  );
}

export default RealMatchViewer;
