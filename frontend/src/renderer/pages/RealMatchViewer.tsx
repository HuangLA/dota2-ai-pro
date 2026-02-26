/**
 * Real Match Viewer - 真实比赛查看器
 * 显示解析后的录像数据，支持时间轴控制和平滑动画
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import MapViewer from '../components/map/MapViewer';
import { HeroPosition, Ward } from '../components/map/DotaMapRenderer';
import { Timeline } from '../components/timeline';
import backendAPI, {
  HudHeroMetric,
  Match,
  PlaybackTimeBasis,
  TickData,
  WardsResponse,
} from '../api/backend';
import { getHeroByName, getHeroPortraitUrl } from '../data/heroes';
import { ReplayEntryContext } from '../types/replayContext';
import {
  createGameClockMapper,
  formatGameClockTime,
  GameClockMapper,
} from '../utils/gameClock';

/** 时间范围常量（秒） */
const PRE_GAME_FETCH_SECONDS = 180;
const POST_GAME_FETCH_BUFFER_SECONDS = 600;
const DEFAULT_DURATION = 3600;
const DEFAULT_INITIAL_GAME_CLOCK_SECONDS = -90;
const DEFAULT_HERO_PORTRAIT_URL = '/assets/dota/heroes/default.png';
const TEAM_HERO_COUNT = 5;
const HUD_REQUEST_THROTTLE_MS = 500;
const HUD_VISIBLE_ROW_COUNT = 10;

interface TeamHeroPortrait {
  key: number;
  heroName: string;
  portraitUrl: string;
  team: 'radiant' | 'dire';
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

function extractTeamLineups(ticks: TickData[]): TeamLineups {
  const radiantByHandle = new Map<number, TeamHeroPortrait>();
  const direByHandle = new Map<number, TeamHeroPortrait>();

  for (const tick of ticks) {
    for (const hero of tick.heroes) {
      const team = hero.team === 2 ? 'radiant' : hero.team === 3 ? 'dire' : null;
      if (!team) {
        continue;
      }

      const targetMap = team === 'radiant' ? radiantByHandle : direByHandle;
      if (targetMap.has(hero.handle) || targetMap.size >= 5) {
        continue;
      }

      const heroData = getHeroByName(hero.hero);
      targetMap.set(hero.handle, {
        key: hero.handle,
        heroName: hero.hero,
        portraitUrl: heroData ? getHeroPortraitUrl(heroData.id) : DEFAULT_HERO_PORTRAIT_URL,
        team,
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
  const [selectedMatch, setSelectedMatch] = useState<number | null>(initialMatchId || null);
  
  const [heroPositions, setHeroPositions] = useState<HeroPosition[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [timelineMinTime, setTimelineMinTime] = useState(0);
  const [timelineMaxTime, setTimelineMaxTime] = useState(DEFAULT_DURATION);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [timeBasisSource, setTimeBasisSource] = useState<'game_time' | 'fallback'>('fallback');
  const [timeBasisStrategy, setTimeBasisStrategy] = useState<GameClockMapper['strategy']>('fallback_pre_game_anchor');
  const [timeBasisOffsetSeconds, setTimeBasisOffsetSeconds] = useState(0);
  const [teamLineups, setTeamLineups] = useState<TeamLineups>({ radiant: [], dire: [] });
  const [hudHeroStatus, setHudHeroStatus] = useState<Record<number, HudHeroStatus>>({});
  const [isPauseActive, setIsPauseActive] = useState(false);
  const [currentDisplayGameTime, setCurrentDisplayGameTime] = useState(DEFAULT_INITIAL_GAME_CLOCK_SECONDS);
  const [hudMetrics, setHudMetrics] = useState<HudHeroMetric[]>([]);
  const [hudMetricsLoading, setHudMetricsLoading] = useState(false);
  const [hudMetricsError, setHudMetricsError] = useState<string | null>(null);
  
  const allTicksRef = useRef<TickData[]>([]);
  const allWardsRef = useRef<WardsResponse | null>(null);
  const gameClockMapperRef = useRef<GameClockMapper>(createGameClockMapper([]));
  const deathIntervalsRef = useRef<Map<number, DeathInterval[]>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const hudRequestAbortControllerRef = useRef<AbortController | null>(null);
  const hudThrottleTimeoutRef = useRef<number | null>(null);
  const pendingHudSourceTimeRef = useRef<number | null>(null);
  const lastHudRequestAtRef = useRef(0);
  const hudRequestSequenceRef = useRef(0);

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    setSelectedMatch(initialMatchId ?? null);
  }, [initialMatchId]);

  useEffect(() => {
    if (
      replayEntryContext?.source === 'match_database' ||
      replayEntryContext?.source === 'replay_library'
    ) {
      setSelectedMatch(replayEntryContext.matchId);
    }
  }, [replayEntryContext]);

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

    setHudMetricsLoading(true);
    setHudMetricsError(null);

    const response = await backendAPI.getHudMetrics(selectedMatch, {
      gameTime,
      signal: requestController.signal,
    });

    if (requestController.signal.aborted || requestSequence !== hudRequestSequenceRef.current) {
      return;
    }

    if (!response || !Array.isArray(response.heroes)) {
      setHudMetricsError('HUD 指标请求失败，不影响主回放。');
      setHudMetricsLoading(false);
      return;
    }

    setHudMetrics(response.heroes.slice(0, HUD_VISIBLE_ROW_COUNT));
    setHudMetricsError(null);
    setHudMetricsLoading(false);
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

  const loadMatches = async () => {
    setLoading(true);
    try {
      const matchList = await backendAPI.getMatchList(10, 0);
      setMatches(matchList);
      if (matchList.length > 0 && !selectedMatch) {
        setSelectedMatch(matchList[0].match_id);
      }
    } catch (err) {
      setError('加载比赛列表失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllMatchData = async (matchId: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    setTimeBasisSource('fallback');
    setTimeBasisStrategy('fallback_pre_game_anchor');
    setTimeBasisOffsetSeconds(0);
    setTeamLineups({ radiant: [], dire: [] });
    setHudHeroStatus({});
    setIsPauseActive(false);
    setCurrentDisplayGameTime(DEFAULT_INITIAL_GAME_CLOCK_SECONDS);
    setHudMetrics([]);
    setHudMetricsError(null);
    setHudMetricsLoading(false);
    clearPendingHudRequest();
    allTicksRef.current = [];
    allWardsRef.current = null;
    deathIntervalsRef.current = new Map();
    
    try {
      const matchDetail = await backendAPI.getMatchDetail(matchId);
      const duration = matchDetail?.duration || DEFAULT_DURATION;
      
      console.log(`[RealMatchViewer] 加载比赛 ${matchId} 的完整数据...`);
      const fullData = await backendAPI.getHeroPositions(
        matchId,
        -PRE_GAME_FETCH_SECONDS,
        duration + POST_GAME_FETCH_BUFFER_SECONDS
      );
      
      if (fullData?.ticks) {
        allTicksRef.current = fullData.ticks;
        setTeamLineups(extractTeamLineups(fullData.ticks));
        console.log(`[RealMatchViewer] 已加载 ${fullData.ticks.length} 个 tick`);
      }
      
      const wardsData = await backendAPI.getWards(matchId);
      allWardsRef.current = wardsData;

      const resolveTimeBasis = (
        ticksBasis?: PlaybackTimeBasis,
        wardsBasis?: PlaybackTimeBasis
      ): PlaybackTimeBasis | undefined => {
        if (ticksBasis) {
          return ticksBasis;
        }
        if (wardsBasis) {
          return wardsBasis;
        }
        return undefined;
      };

      const timeBasis = resolveTimeBasis(fullData?.time_basis, wardsData?.time_basis);

      const mapperRecords = [
        ...allTicksRef.current,
        ...(wardsData?.wards ?? []),
      ];
      const mapper = createGameClockMapper(mapperRecords, timeBasis);
      gameClockMapperRef.current = mapper;
      deathIntervalsRef.current = buildDeathIntervalsByHandle(allTicksRef.current, mapper);
      setTimeBasisSource(mapper.timeBasisSource);
      setTimeBasisStrategy(mapper.strategy);
      setTimeBasisOffsetSeconds(mapper.offsetSeconds);

      if (allTicksRef.current.length > 0) {
        const tickTimes = allTicksRef.current.map((tick) => mapper.getSourceTime(tick));
        const rawMinSourceTime = Math.min(...tickTimes);
        const maxSourceTime = Math.max(...tickTimes);
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
        setCurrentTime(gameStartSourceTime);
        updateDisplayForTime(gameStartSourceTime);
        scheduleHudMetricsFetch(gameStartSourceTime);
      }
      
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError('加载比赛数据失败');
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
    
    // 眼位不需要插值，直接过滤
    const roundedTime = Math.floor(time);
    const wardsData = allWardsRef.current;
    if (wardsData?.wards) {
      const activeWards = wardsData.wards
        .filter((ward) => {
          if (ward.type !== 'placed' || !ward.x || !ward.y) return false;
          if (mapper.getSourceTime(ward) > roundedTime) return false;
          return true;
        })
        .filter((placedWard) => {
          const destroyedEvent = wardsData.wards.find(
            (w) => w.type === 'destroyed' && w.handle === placedWard.handle
          );
          return !destroyedEvent || mapper.getSourceTime(destroyedEvent) > roundedTime;
        })
        .map((ward) => ({
          type: ward.ward_type as 'observer' | 'sentry',
          team: ward.team === 2 ? 'radiant' as const : 'dire' as const,
          x: ward.x!,
          y: ward.y!,
          placed: true,
        }));
      
      setWards(activeWards);
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

  const getHeroLabel = (heroName: string, fallbackKey: number): string => {
    const heroData = getHeroByName(heroName || '');
    return heroData?.chineseName || heroName?.replace('npc_dota_hero_', '') || `英雄 ${fallbackKey}`;
  };

  const getHudHeroLabel = (heroName: string): string => {
    const heroData = getHeroByName(heroName || '');
    return heroData?.chineseName || heroName?.replace('npc_dota_hero_', '') || heroName || '未知英雄';
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

  const renderTeamPortraitStrip = (heroes: TeamHeroPortrait[], team: 'radiant' | 'dire') => {
    const slots = Array.from({ length: TEAM_HERO_COUNT }, (_, index) => heroes[index] ?? null);

    return (
      <div className="pb-1">
        <div className={`grid grid-cols-5 gap-1.5 ${team === 'dire' ? 'ml-auto' : ''}`}>
          {slots.map((hero, index) => {
            if (!hero) {
              return (
                <div
                  key={`${team}-empty-${index}`}
                  className="aspect-[16/9] rounded-md border border-gray-700/80 bg-slate-900/70"
                />
              );
            }

            const heroLabel = getHeroLabel(hero.heroName, hero.key);
            const teamBorderClass = team === 'radiant' ? 'border-emerald-500/70' : 'border-rose-500/70';
            const heroStatus = hudHeroStatus[hero.key];
            const isDead = heroStatus ? !heroStatus.isAlive : false;
            const healthPercent = Math.round(
              clamp(heroStatus?.hpRatio ?? (isDead ? 0 : 1), 0, 1) * 100
            );
            const healthCurrent = Math.max(0, Math.round(heroStatus?.hp ?? 0));
            const healthMax = Math.max(0, Math.round(heroStatus?.maxHp ?? 0));
            const healthValueLabel = `${healthCurrent}/${healthMax}`;

            return (
              <div
                key={hero.key}
                className="relative pt-2"
              >
                {isDead && typeof heroStatus?.respawnRemainingSeconds === 'number' && (
                  <span className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full border border-amber-300/65 bg-slate-900/95 px-2 py-[1px] text-[10px] font-semibold text-amber-200 shadow-sm">
                    {heroStatus.respawnRemainingSeconds}s
                  </span>
                )}
                <div
                  className={`aspect-[16/9] overflow-hidden rounded-md border bg-slate-950/90 shadow-sm ${teamBorderClass}`}
                  title={heroLabel}
                >
                  <img
                    src={hero.portraitUrl}
                    alt={heroLabel}
                    className={`h-full w-full object-contain transition duration-200 ${
                      isDead ? 'grayscale brightness-75' : 'grayscale-0 brightness-100'
                    }`}
                  />
                </div>
                <div className="group relative mt-1.5">
                  <div className="h-2.5 overflow-hidden rounded-full border border-slate-700/80 bg-slate-900/90 transition-[border-color,box-shadow] duration-150 group-hover:border-slate-500/90 group-hover:shadow-[0_0_0_1px_rgba(148,163,184,0.3),0_0_10px_rgba(15,23,42,0.55)]">
                    <div
                      className={`h-full transition-[width,filter,opacity] duration-150 ${team === 'radiant' ? 'bg-emerald-400/95' : 'bg-rose-400/95'} ${isDead ? 'opacity-60' : ''} group-hover:brightness-110`}
                      style={{ width: `${healthPercent}%` }}
                    />
                  </div>
                  <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded border border-slate-500/70 bg-slate-950/95 px-1.5 py-[1px] text-[10px] font-semibold text-slate-100 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
                    {healthValueLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-dota-bg p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-dota-gold mb-2">
          录像回放查看器
        </h1>
        <p className="text-gray-400 mb-6">
          查看解析后的 .dem 录像数据
        </p>

        {replayEntryContext?.source === 'match_database' && (
          <div className="mb-6 rounded-lg border border-cyan-500/50 bg-cyan-900/20 px-4 py-3 text-sm text-cyan-100">
            <p>
              来自比赛数据库 · match_id：<span className="font-mono">{replayEntryContext.matchId}</span>
            </p>
            {replaySourceStatusText && (
              <p className="mt-1 text-cyan-200">
                下载状态: <span className="font-mono">{replaySourceStatusText}</span>
              </p>
            )}
          </div>
        )}

        {replayEntryContext?.source === 'replay_library' && (
          <div className="mb-6 rounded-lg border border-emerald-500/50 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-100">
            来自回放库 · match_id：<span className="font-mono">{replayEntryContext.matchId}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-700 p-4 rounded mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-dota-surface p-4 rounded-lg">
                 <h3 className="text-lg font-medium mb-3">选择比赛</h3>
              
              {matches.length === 0 ? (
                <div className="text-gray-400 text-sm">
                  <p className="mb-2">暂无已解析的比赛</p>
                  <p className="text-xs">请先解析 .dem 文件:</p>
                  <a 
                    href="http://localhost:8000/docs" 
                    target="_blank"
                    rel="noreferrer"
                    className="text-dota-accent hover:underline text-xs"
                  >
                    http://localhost:8000/docs
                  </a>
                </div>
              ) : (
                <select
                  value={selectedMatch || ''}
                  onChange={(e) => setSelectedMatch(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-dota-bg border border-gray-600 rounded text-white"
                >
                  {matches.map((match) => (
                    <option key={match.match_id} value={match.match_id}>
                      比赛 {match.match_id}
                      {match.radiant_win !== undefined && 
                        ` - ${match.radiant_win ? '天辉' : '夜魇'}胜`}
                    </option>
                  ))}
                </select>
              )}

              {matches.length > 0 && (
                <button
                  onClick={loadMatches}
                  className="mt-2 w-full px-3 py-1 bg-dota-primary text-white rounded text-sm hover:bg-blue-800"
                >
                  刷新列表
                </button>
              )}
            </div>

            <div className="bg-dota-surface p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-3">当前状态</h3>
              <div className="text-sm text-gray-400 space-y-2">
                <div className="flex justify-between">
                  <span>时间基准来源:</span>
                  <span className="text-white font-mono">{timeBasisSource}</span>
                </div>
                <div className="flex justify-between">
                  <span>映射策略:</span>
                  <span className="text-white font-mono">{timeBasisStrategy}</span>
                </div>
                <div className="flex justify-between">
                  <span>偏移秒数:</span>
                  <span className="text-white font-mono">{timeBasisOffsetSeconds.toFixed(2)}s</span>
                </div>
                <div className="flex justify-between">
                  <span>当前时间:</span>
                  <span className="text-white font-mono">
                    {currentGameClockLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>暂停状态:</span>
                  <span className={`font-medium ${isPauseActive ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {isPauseActive ? '暂停中' : '进行中'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>比赛时长:</span>
                  <span className="text-white font-mono">
                    {formatGameClockTime(Math.max(0, gameClockMapperRef.current.sourceToGameClock(timelineMaxTime)))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>已缓存 Tick:</span>
                  <span className="text-white">{allTicksRef.current.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>英雄数:</span>
                  <span className="text-white">{heroPositions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>眼位数:</span>
                  <span className="text-white">{wards.length}</span>
                </div>
                {heroPositions.length > 0 && (
                  <div className="border-t border-gray-600 pt-2 mt-2">
                    <p className="text-xs text-gray-500">
                      天辉: {heroPositions.filter(h => h.team === 'radiant').length} |
                      夜魇: {heroPositions.filter(h => h.team === 'dire').length}
                    </p>
                    <p className="text-xs text-gray-500">
                      假眼: {wards.filter(w => w.type === 'observer').length} |
                      真眼: {wards.filter(w => w.type === 'sentry').length}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {heroPositions.length > 0 && (
              <div className="bg-dota-surface p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-3">英雄</h3>
                <div className="space-y-1 text-xs">
                  {heroPositions.map((hero) => (
                    <div 
                      key={hero.hero_id}
                      className={`flex justify-between items-center py-1 px-2 rounded ${
                        hero.team === 'radiant' ? 'bg-green-900/30' : 'bg-red-900/30'
                      }`}
                    >
                       <span className="truncate" title={hero.hero_name}>
                         {(() => {
                           const heroData = getHeroByName(hero.hero_name || '');
                           return heroData?.chineseName || hero.hero_name?.replace('npc_dota_hero_', '') || `英雄 ${hero.hero_id}`;
                         })()}
                       </span>
                       <span className="text-gray-400">
                         Lv.{hero.level}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-3 space-y-4">
            <div className="bg-dota-surface p-4 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">地图视图</h2>
                <div className="flex items-center gap-4">
                  {timeBasisSource === 'fallback' && (
                    <span className="px-2 py-1 rounded border border-amber-500/60 bg-amber-900/25 text-amber-300 text-xs">
                      回退模式
                    </span>
                  )}
                  <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCalibration}
                      onChange={(e) => setShowCalibration(e.target.checked)}
                      className="rounded"
                    />
                    <span>显示校准标记</span>
                  </label>
                  {loading && (
                    <span className="text-sm text-gray-400 animate-pulse">加载中...</span>
                  )}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[900px]">
                <div className="mb-4 rounded-lg border border-slate-700/80 bg-gradient-to-b from-slate-900/85 to-slate-950/75 px-3 py-3">
                  <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                    <div className="min-w-0">{renderTeamPortraitStrip(teamLineups.radiant, 'radiant')}</div>

                    <div className="mx-auto">
                      <div className="relative overflow-hidden rounded-xl border border-slate-400/25 bg-gradient-to-b from-slate-700/55 to-slate-900/80 px-4 py-2 shadow-[0_0_0_1px_rgba(148,163,184,0.14),0_8px_24px_rgba(2,6,23,0.5)]">
                        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10" />
                        <p className="text-center text-[10px] uppercase tracking-[0.22em] text-slate-300/75">
                          游戏时间
                        </p>
                        <p className="text-center font-mono text-lg font-semibold tracking-[0.1em] text-slate-100 tabular-nums">
                          {currentGameClockLabel}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0">{renderTeamPortraitStrip(teamLineups.dire, 'dire')}</div>
                  </div>
                </div>

                {selectedMatch ? (
                  <div className="flex justify-center">
                    <MapViewer
                      key={showCalibration ? 'calibration' : 'normal'}
                      width={900}
                      height={900}
                      heroPositions={heroPositions}
                      wards={wards}
                      showCalibrationMarkers={showCalibration}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-96 bg-dota-bg rounded">
                    <p className="text-gray-400">选择一场比赛以查看地图</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-dota-surface p-4 rounded-lg">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-lg font-medium">HUD 指标</h3>
                {hudMetricsLoading && (
                  <span className="text-xs text-gray-400">加载中...</span>
                )}
              </div>

              {hudMetricsError && (
                <p className="mb-3 rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
                  {hudMetricsError}
                </p>
              )}

              {!hudMetricsError && !hudMetricsLoading && selectedMatch && hudMetrics.length === 0 && (
                <p className="text-sm text-gray-400">当前时间没有 HUD 指标数据。</p>
              )}

              {!selectedMatch && (
                <p className="text-sm text-gray-400">请先选择比赛以查看 HUD 指标。</p>
              )}

              {selectedMatch && hudMetrics.length > 0 && (
                <div className="overflow-x-auto" data-testid="hud-metrics-panel">
                  <table className="min-w-full border-collapse text-xs text-gray-200">
                    <thead>
                      <tr className="border-b border-slate-700 text-left text-[11px] uppercase tracking-[0.08em] text-slate-400">
                        <th className="py-2 pr-3">英雄</th>
                        <th className="py-2 pr-3">阵营</th>
                        <th className="py-2 pr-3">等级</th>
                        <th className="py-2 pr-3">K/D/A</th>
                        <th className="py-2 pr-3">NW</th>
                        <th className="py-2 pr-3">GPM</th>
                        <th className="py-2 pr-3">XPM</th>
                        <th className="py-2 pr-0">装备数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hudMetrics.map((hero, index) => {
                        const teamLabel = getHudTeamLabel(hero.team);
                        const itemCount = Array.isArray(hero.items) ? hero.items.length : 0;
                        return (
                          <tr
                            key={`${hero.hero}-${hero.team}-${index}`}
                            className="border-b border-slate-800/80 last:border-b-0"
                          >
                            <td className="py-2 pr-3 text-slate-100">{getHudHeroLabel(hero.hero)}</td>
                            <td className="py-2 pr-3">
                              <span className={teamLabel === '天辉' ? 'text-emerald-300' : teamLabel === '夜魇' ? 'text-rose-300' : 'text-slate-300'}>
                                {teamLabel}
                              </span>
                            </td>
                            <td className="py-2 pr-3 font-mono">{formatHudValue(hero.level)}</td>
                            <td className="py-2 pr-3 font-mono">{`${formatHudValue(hero.kills)}/${formatHudValue(hero.deaths)}/${formatHudValue(hero.assists)}`}</td>
                            <td className="py-2 pr-3 font-mono">{formatHudValue(hero.net_worth)}</td>
                            <td className="py-2 pr-3 font-mono">{formatHudValue(hero.gpm)}</td>
                            <td className="py-2 pr-3 font-mono">{formatHudValue(hero.xpm)}</td>
                            <td className="py-2 pr-0 font-mono text-slate-300">{itemCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedMatch && (
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
            )}
          </div>
        </div>

        <div className="mt-6 bg-dota-primary/20 border border-dota-primary p-4 rounded">
          <h3 className="font-medium mb-2">使用说明</h3>
          <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
            <li>使用 API 解析 .dem 文件 (访问 http://localhost:8000/docs)</li>
            <li>从下拉列表选择已解析的比赛</li>
            <li>使用时间轴控制回放：空格键播放/暂停，方向键快进/快退</li>
            <li>点击进度条可跳转到任意时间点</li>
            <li>调整播放速度：0.5x ~ 8x</li>
          </ol>
          <div className="mt-3 text-xs text-gray-500">
            <p>快捷键: 空格(播放) | ← →(±5秒) | ↑ ↓(速度) | Home/End(开始/结束)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RealMatchViewer;
