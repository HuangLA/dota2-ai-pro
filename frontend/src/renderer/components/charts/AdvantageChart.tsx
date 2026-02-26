/**
 * AdvantageChart - 经济与经验优势曲线图
 * 显示天辉 vs 夜魇的金币优势（渐变填充）和经验优势（虚线）
 * 与 Timeline 同步：垂直指示线标记当前游戏时间
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import backendAPI, { AdvantageData, AdvantageResponse } from '../../api/backend';

/* ─── Constants ───────────────────────────────────────────── */

const RADIANT_GREEN = '#66BB6A';
const DIRE_RED = '#EF5350';
const GRID_COLOR = 'rgba(148, 163, 184, 0.08)';
const AXIS_TICK_COLOR = '#94A3B8';
const REFERENCE_LINE_COLOR = '#FBBF24';
const XP_BLUE = '#90CAF9';

/* ─── Types ───────────────────────────────────────────────── */

export interface AdvantageChartProps {
  matchId: number | null;
  /** Current game_time in seconds (from Timeline sync) */
  currentGameTime: number;
}

/* ─── Helpers ─────────────────────────────────────────────── */

function formatGameTimeAxis(seconds: number): string {
  const isNegative = seconds < 0;
  const abs = Math.abs(seconds);
  const mins = Math.floor(abs / 60);
  const secs = Math.floor(abs % 60);
  const sign = isNegative ? '-' : '';
  return `${sign}${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatAdvantageValue(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

/* ─── Custom Tooltip ──────────────────────────────────────── */

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
  payload: AdvantageData;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const adv = point.gold_advantage;
  const isRadiantLead = adv >= 0;
  const leadColor = isRadiantLead ? RADIANT_GREEN : DIRE_RED;
  const leadLabel = isRadiantLead ? '天辉领先' : '夜魇领先';
  const leadSign = isRadiantLead ? '+' : '';

  return (
    <div className="rounded-lg border border-slate-600/80 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-300">
        游戏时间: {formatGameTimeAxis(point.game_time)}
      </p>
      <div className="mb-1.5 border-t border-slate-600/50" />
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: leadColor }}
        />
        <span style={{ color: leadColor }} className="font-mono font-semibold">
          {leadLabel} {leadSign}{formatAdvantageValue(adv)}
        </span>
      </div>
      <div className="my-1.5 border-t border-slate-600/50" />
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: RADIANT_GREEN }}
        />
        <span className="text-slate-400">天辉经济</span>
        <span className="font-mono font-semibold text-slate-200">
          {formatAdvantageValue(point.radiant_gold)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: DIRE_RED }}
        />
        <span className="text-slate-400">夜魇经济</span>
        <span className="font-mono font-semibold text-slate-200">
          {formatAdvantageValue(point.dire_gold)}
        </span>
      </div>
      <div className="my-1.5 border-t border-slate-600/50" />
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: XP_BLUE }}
        />
        <span className="text-slate-400">经验优势</span>
        <span className="font-mono font-semibold text-slate-200">
          {point.xp_advantage >= 0 ? '+' : ''}{formatAdvantageValue(point.xp_advantage)}
        </span>
        <span className="text-[10px] text-slate-500">
          {point.xp_advantage >= 0 ? '天辉' : '夜魇'}
        </span>
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────── */

export function AdvantageChart({ matchId, currentGameTime }: AdvantageChartProps) {
  const [data, setData] = useState<AdvantageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch advantage data when matchId changes
  useEffect(() => {
    if (!matchId) {
      setData(null);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    backendAPI
      .getAdvantage(matchId, controller.signal)
      .then((resp) => {
        if (controller.signal.aborted) return;
        if (!resp || !Array.isArray(resp.data)) {
          setError('无法获取经济数据');
          setData(null);
        } else {
          setData(resp);
          setError(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('经济数据请求失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [matchId]);

  const chartData = useMemo((): AdvantageData[] => {
    if (!data?.data?.length) return [];
    return data.data;
  }, [data]);

  // Gradient offset: where y=0 falls in the 0..1 range
  const gradientOffset = useMemo(() => {
    if (chartData.length === 0) return 0.5;
    const maxVal = Math.max(...chartData.map((d) => d.gold_advantage));
    const minVal = Math.min(...chartData.map((d) => d.gold_advantage));
    if (maxVal <= 0) return 0;
    if (minVal >= 0) return 1;
    return maxVal / (maxVal - minVal);
  }, [chartData]);

  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [-5000, 5000];
    let min = 0;
    let max = 0;
    for (const d of chartData) {
      if (d.gold_advantage < min) min = d.gold_advantage;
      if (d.gold_advantage > max) max = d.gold_advantage;
      if (d.xp_advantage < min) min = d.xp_advantage;
      if (d.xp_advantage > max) max = d.xp_advantage;
    }
    const padding = Math.max(1000, Math.abs(max - min) * 0.1);
    return [Math.floor((min - padding) / 1000) * 1000, Math.ceil((max + padding) / 1000) * 1000];
  }, [chartData]);

  // Format Y-axis tick
  const formatYTick = useCallback((value: number) => {
    if (value === 0) return '0';
    return formatAdvantageValue(value);
  }, []);

  if (!matchId) return null;

  return (
    <div className="rounded-lg border border-slate-700/60 bg-gradient-to-b from-slate-800/90 to-slate-900/95 shadow-lg">
      {/* Header / Toggle */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-700/30"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/15">
            <svg
              className="h-3.5 w-3.5 text-amber-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-200">经济和经验</span>
          {data?.summary && (
            <span className="text-[11px] text-slate-500">
              {data.summary.total_samples} 个数据点
            </span>
          )}
          {loading && (
            <span className="text-xs text-slate-400 animate-pulse">加载中...</span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
            collapsed ? '' : 'rotate-180'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible Body */}
      {!collapsed && (
        <div className="border-t border-slate-700/40 px-4 pb-4 pt-3">
          {/* Legend */}
          <div className="mb-3 flex items-center gap-4">
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ backgroundColor: RADIANT_GREEN }}
                />
                天辉领先↑
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ backgroundColor: DIRE_RED }}
                />
                夜魇领先↓
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-3 rounded-sm"
                  style={{ backgroundColor: XP_BLUE, opacity: 0.7 }}
                />
                经验优势
              </span>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-amber-700/40 bg-amber-900/15 text-sm text-amber-300">
              {error}
            </div>
          )}

          {/* Empty state */}
          {!error && !loading && chartData.length === 0 && (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/50 text-sm text-slate-500">
              暂无经济数据
            </div>
          )}

          {/* Chart */}
          {!error && chartData.length > 0 && (
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 14, right: 12, bottom: 4, left: 8 }}
                >
                  <defs>
                    <linearGradient id="advantageFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={RADIANT_GREEN} stopOpacity={0.25} />
                      <stop offset={gradientOffset} stopColor={RADIANT_GREEN} stopOpacity={0.05} />
                      <stop offset={gradientOffset} stopColor={DIRE_RED} stopOpacity={0.05} />
                      <stop offset="100%" stopColor={DIRE_RED} stopOpacity={0.25} />
                    </linearGradient>
                    <linearGradient id="advantageStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={RADIANT_GREEN} />
                      <stop offset={gradientOffset} stopColor={RADIANT_GREEN} />
                      <stop offset={gradientOffset} stopColor={DIRE_RED} />
                      <stop offset="100%" stopColor={DIRE_RED} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={GRID_COLOR}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="game_time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatGameTimeAxis}
                    tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
                    axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
                    tickLine={false}
                    minTickGap={60}
                  />
                  <YAxis
                    domain={yDomain}
                    tickFormatter={formatYTick}
                    tick={{ fill: AXIS_TICK_COLOR, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{
                      stroke: 'rgba(148,163,184,0.25)',
                      strokeWidth: 1,
                      strokeDasharray: '4 2',
                    }}
                  />
                  {/* Zero line */}
                  <ReferenceLine
                    y={0}
                    stroke="rgba(148,163,184,0.25)"
                    strokeWidth={1}
                  />
                  {/* Current game time indicator */}
                  <ReferenceLine
                    x={currentGameTime}
                    stroke={REFERENCE_LINE_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{
                      value: formatGameTimeAxis(currentGameTime),
                      position: 'insideTopLeft',
                      fill: REFERENCE_LINE_COLOR,
                      fontSize: 10,
                      fontWeight: 600,
                      dy: 2,
                    }}
                  />
                  {/* Single area with split-color gradient */}
                  <Area
                    type="monotone"
                    dataKey="gold_advantage"
                    stroke="url(#advantageStroke)"
                    strokeWidth={1.5}
                    fill="url(#advantageFill)"
                    isAnimationActive={false}
                    connectNulls
                  />
                  {/* XP advantage dashed line */}
                  <Area
                    type="monotone"
                    dataKey="xp_advantage"
                    stroke={XP_BLUE}
                    strokeWidth={1.2}
                    strokeDasharray="6 3"
                    fill="none"
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdvantageChart;
