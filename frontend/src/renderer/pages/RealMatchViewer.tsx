/**
 * Real Match Viewer - 真实比赛查看器
 * 显示解析后的录像数据，支持时间轴控制和平滑动画
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import MapViewer from '../components/map/MapViewer';
import { HeroPosition, Ward } from '../components/map/DotaMapRenderer';
import { Timeline } from '../components/timeline';
import backendAPI, { Match, TickData, WardsResponse } from '../api/backend';

/** 比赛时间常量 */
const GAME_DATA_START = 112;
const DEFAULT_DURATION = 3600;

/** 线性插值函数 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function RealMatchViewer() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null);
  const [matchDuration, setMatchDuration] = useState(DEFAULT_DURATION);
  
  const [heroPositions, setHeroPositions] = useState<HeroPosition[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  
  const [currentTime, setCurrentTime] = useState(GAME_DATA_START);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const allTicksRef = useRef<TickData[]>([]);
  const allWardsRef = useRef<WardsResponse | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadMatches();
  }, []);

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
    allTicksRef.current = [];
    allWardsRef.current = null;
    
    try {
      const matchDetail = await backendAPI.getMatchDetail(matchId);
      const duration = matchDetail?.duration || DEFAULT_DURATION;
      setMatchDuration(duration);
      
      console.log(`[RealMatchViewer] 加载比赛 ${matchId} 的完整数据...`);
      const fullData = await backendAPI.getHeroPositions(
        matchId,
        GAME_DATA_START,
        duration
      );
      
      if (fullData?.ticks) {
        allTicksRef.current = fullData.ticks;
        console.log(`[RealMatchViewer] 已加载 ${fullData.ticks.length} 个 tick`);
      }
      
      const wardsData = await backendAPI.getWards(matchId);
      allWardsRef.current = wardsData;
      
      updateDisplayForTime(GAME_DATA_START);
      
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
      setCurrentTime(GAME_DATA_START);
      loadAllMatchData(selectedMatch);
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedMatch]);

  /**
   * 找到指定时间前后的两个 tick，用于插值
   */
  const findTicksForInterpolation = useCallback((time: number): { prev: TickData | null; next: TickData | null; t: number } => {
    const ticks = allTicksRef.current;
    if (ticks.length === 0) {
      return { prev: null, next: null, t: 0 };
    }
    
    // 二分查找
    let left = 0;
    let right = ticks.length - 1;
    
    // 边界情况
    if (time <= ticks[0].time) {
      return { prev: ticks[0], next: ticks[0], t: 0 };
    }
    if (time >= ticks[ticks.length - 1].time) {
      return { prev: ticks[ticks.length - 1], next: ticks[ticks.length - 1], t: 0 };
    }
    
    // 找到 time 之前的最大 tick
    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      if (ticks[mid].time <= time) {
        left = mid;
      } else {
        right = mid - 1;
      }
    }
    
    const prevTick = ticks[left];
    const nextTick = ticks[Math.min(left + 1, ticks.length - 1)];
    
    // 计算插值系数
    const timeDiff = nextTick.time - prevTick.time;
    const t = timeDiff > 0 ? (time - prevTick.time) / timeDiff : 0;
    
    return { prev: prevTick, next: nextTick, t };
  }, []);

  /**
   * 根据时间更新显示，支持插值
   */
  const updateDisplayForTime = useCallback((time: number) => {
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
          if (ward.time > roundedTime) return false;
          return true;
        })
        .filter((placedWard) => {
          const destroyedEvent = wardsData.wards.find(
            (w) => w.type === 'destroyed' && w.handle === placedWard.handle
          );
          return !destroyedEvent || destroyedEvent.time > roundedTime;
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
  }, [findTicksForInterpolation]);

  const handleTimeChange = useCallback((newTime: number) => {
    setCurrentTime(newTime);
    updateDisplayForTime(newTime);
  }, [updateDisplayForTime]);

  const formatTimeDisplay = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
                  <span>当前时间:</span>
                  <span className="text-white font-mono">
                    {formatTimeDisplay(currentTime)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>比赛时长:</span>
                  <span className="text-white font-mono">
                    {formatTimeDisplay(matchDuration)}
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
                      真眼: {wards.filter(w => w.type === 'observer').length} |
                      假眼: {wards.filter(w => w.type === 'sentry').length}
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
                        {hero.hero_name?.replace('npc_dota_hero_', '') || `Hero ${hero.hero_id}`}
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
                {loading && (
                  <span className="text-sm text-gray-400 animate-pulse">加载中...</span>
                )}
              </div>

              {selectedMatch ? (
                <MapViewer
                  width={900}
                  height={900}
                  heroPositions={heroPositions}
                  wards={wards}
                />
              ) : (
                <div className="flex items-center justify-center h-96 bg-dota-bg rounded">
                  <p className="text-gray-400">选择一场比赛以查看地图</p>
                </div>
              )}
            </div>

            {selectedMatch && (
              <Timeline
                currentTime={currentTime}
                minTime={GAME_DATA_START}
                maxTime={matchDuration}
                onTimeChange={handleTimeChange}
                isLoading={loading}
                disabled={!selectedMatch || matches.length === 0}
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
