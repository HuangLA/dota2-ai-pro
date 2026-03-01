import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RemoteMatchRecord,
  RemoteMatchSource,
  RemoteMatchStatusResponse,
  remoteService,
} from '../api/remoteService';
import { formatDurationClock, formatUnixTimestampLocal } from './matchDatabaseFormatting';

const PAGE_LIMIT = 20;

interface FiltersState {
  includePro: boolean;
  includePublic: boolean;
  matchId: string;
  leagueId: string;
}

const DEFAULT_FILTERS: FiltersState = {
  includePro: true,
  includePublic: false,
  matchId: '',
  leagueId: '',
};

function pickSources(filters: Pick<FiltersState, 'includePro' | 'includePublic'>): RemoteMatchSource[] {
  const selected: RemoteMatchSource[] = [];
  if (filters.includePro) {
    selected.push('pro');
  }
  if (filters.includePublic) {
    selected.push('public');
  }
  return selected;
}

function toOptionalInt(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getSourceLabel(source: string | null | undefined): string {
  if (source === 'pro') {
    return '职业';
  }
  if (source === 'public') {
    return '路人';
  }
  return '--';
}

function getTeamLabel(name: string | null | undefined, teamId: number | null | undefined): string {
  if (name && name.trim()) {
    return name;
  }
  if (teamId !== undefined && teamId !== null) {
    return `战队 ${teamId}`;
  }
  return '未知战队';
}

function getLeagueLabel(name: string | null | undefined, leagueId: number | null | undefined): string {
  if (name && name.trim()) {
    return name;
  }
  if (leagueId !== undefined && leagueId !== null) {
    return `联赛 ${leagueId}`;
  }
  return '未知联赛';
}

function getDownloadStatusBadge(status: string | null | undefined): { label: string; className: string } {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return { label: '下载成功', className: 'border-emerald-500/60 bg-emerald-900/30 text-emerald-200' };
    case 'failed':
      return { label: '下载失败', className: 'border-red-500/60 bg-red-900/30 text-red-200' };
    case 'downloading':
      return { label: '下载中', className: 'border-cyan-500/60 bg-cyan-900/30 text-cyan-200' };
    case 'prepared':
      return { label: '已准备', className: 'border-blue-500/60 bg-blue-900/30 text-blue-200' };
    default:
      return { label: '未下载', className: 'border-slate-500/60 bg-slate-800/60 text-slate-300' };
  }
}

function getParseStatusBadge(status: string | null | undefined): { label: string; className: string } {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return { label: '解析成功', className: 'border-emerald-500/60 bg-emerald-900/30 text-emerald-200' };
    case 'failed':
      return { label: '解析失败', className: 'border-red-500/60 bg-red-900/30 text-red-200' };
    case 'parsing':
      return { label: '解析中', className: 'border-cyan-500/60 bg-cyan-900/30 text-cyan-200' };
    case 'pending':
      return { label: '待解析', className: 'border-blue-500/60 bg-blue-900/30 text-blue-200' };
    default:
      return { label: '--', className: 'border-slate-500/60 bg-slate-800/60 text-slate-300' };
  }
}

function isTerminalDownloadStatus(status: string | null | undefined): boolean {
  const normalized = (status || '').toLowerCase();
  return normalized === 'completed' || normalized === 'failed';
}

function MatchIcon({ url, label }: { url?: string | null; label: string }) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return (
      <div
        title={`${label} 图标缺失`}
        className="h-7 w-7 shrink-0 rounded border border-dashed border-slate-500/40 bg-slate-800/50"
      />
    );
  }

  return (
    <img
      src={url}
      alt={`${label} 图标`}
      className="max-h-7 max-w-[56px] shrink-0 rounded border border-slate-600/40 bg-slate-900/60 object-contain"
      onError={() => setBroken(true)}
    />
  );
}

function pickAssetUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

export function OpenDotaLivePage() {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [matches, setMatches] = useState<RemoteMatchRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedMatchIds, setSelectedMatchIds] = useState<number[]>([]);
  const [actionMatchId, setActionMatchId] = useState<number | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [statusPanel, setStatusPanel] = useState<{
    matchId: number;
    loading: boolean;
    error: string | null;
    detail: RemoteMatchStatusResponse | null;
    autoPolling: boolean;
  } | null>(null);

  const refreshStatusPanel = useCallback(async (matchId: number, withLoading = true) => {
    if (withLoading) {
      setStatusPanel((current) =>
        current && current.matchId === matchId
          ? {
            ...current,
            loading: true,
            error: null,
          }
          : current
      );
    }

    try {
      const detail = await remoteService.getMatchStatus(matchId);
      setStatusPanel((current) => {
        if (!current || current.matchId !== matchId) {
          return current;
        }
        return {
          ...current,
          loading: false,
          error: null,
          detail,
          autoPolling: isTerminalDownloadStatus(detail.download_task?.status)
            ? false
            : current.autoPolling,
        };
      });
    } catch (statusError) {
      console.error('Failed to fetch match status details:', statusError);
      setStatusPanel((current) =>
        current && current.matchId === matchId
          ? {
            ...current,
            loading: false,
            error: '状态详情加载失败。',
            autoPolling: false,
          }
          : current
      );
    }
  }, []);

  const sources = useMemo<RemoteMatchSource[]>(() => {
    return pickSources(appliedFilters);
  }, [appliedFilters.includePro, appliedFilters.includePublic]);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await remoteService.getRemoteMatches({
        limit: PAGE_LIMIT,
        offset,
        match_id: toOptionalInt(appliedFilters.matchId),
        leagueid: toOptionalInt(appliedFilters.leagueId),
        sources,
      });
      setMatches(result.matches ?? []);
      setTotal(result.total ?? 0);
    } catch (fetchError) {
      console.error('Failed to fetch remote matches:', fetchError);
      setMatches([]);
      setTotal(0);
      setError('OpenDota 实时列表加载失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters.leagueId, appliedFilters.matchId, offset, sources]);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    const currentIds = new Set(matches.map((match) => match.match_id));
    setSelectedMatchIds((current) => current.filter((matchId) => currentIds.has(matchId)));
  }, [matches]);

  useEffect(() => {
    if (!statusPanel || !statusPanel.autoPolling) {
      return;
    }
    if (isTerminalDownloadStatus(statusPanel.detail?.download_task?.status)) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshStatusPanel(statusPanel.matchId, false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [statusPanel, refreshStatusPanel]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    setAppliedFilters(filters);
    setFeedback(null);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setFeedback(null);

    try {
      const syncSources = pickSources(filters);
      const result = await remoteService.syncRemoteMatches({
        sources: syncSources.length > 0 ? syncSources : undefined,
      });
      setFeedback({
        type: 'success',
        message: result.message || '同步任务已触发。',
      });
      await fetchMatches();
    } catch (syncError) {
      console.error('Failed to sync remote matches:', syncError);
      setFeedback({ type: 'error', message: '手动刷新失败，请稍后重试。' });
    } finally {
      setSyncing(false);
    }
  };

  const handleIngest = async (matchIds: number[]) => {
    if (matchIds.length === 0) {
      return;
    }

    const singleMatchId = matchIds.length === 1 ? matchIds[0] : null;
    setFeedback(null);
    if (singleMatchId !== null) {
      setActionMatchId(singleMatchId);
    } else {
      setBatchLoading(true);
    }

    try {
      const result = await remoteService.ingestMatches(matchIds);
      setFeedback({
        type: 'success',
        message: result.message || `已触发 ${matchIds.length} 场比赛的入库任务。`,
      });
      await fetchMatches();
    } catch (ingestError) {
      console.error('Failed to ingest remote matches:', ingestError);
      setFeedback({
        type: 'error',
        message:
          singleMatchId !== null
            ? `比赛 ${singleMatchId} 入库失败。`
            : `批量入库失败（${matchIds.length} 场）。`,
      });
    } finally {
      setActionMatchId(null);
      setBatchLoading(false);
    }
  };

  const currentPageMatchIds = matches
    .map((match) => match.match_id)
    .filter((matchId) => Number.isFinite(matchId) && matchId > 0);
  const isAllCurrentPageSelected =
    currentPageMatchIds.length > 0 && selectedMatchIds.length === currentPageMatchIds.length;
  const isSomeCurrentPageSelected =
    selectedMatchIds.length > 0 && selectedMatchIds.length < currentPageMatchIds.length;

  return (
    <div className="p-6 text-white min-h-full bg-dota-bg">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950/50 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-dota-gold">OpenDota Live</h1>
              <p className="mt-1 text-sm text-cyan-100/80">自动同步（每1分钟）</p>
            </div>
            <button
              onClick={() => {
                void handleManualSync();
              }}
              disabled={syncing}
              className="rounded-lg border border-cyan-500/60 bg-cyan-700/70 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? '刷新中...' : '手动刷新'}
            </button>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">筛选条件</h2>
          <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="flex h-[42px] items-center gap-2 rounded border border-slate-600 bg-dota-bg px-3">
              <input
                aria-label="职业"
                type="checkbox"
                checked={filters.includePro}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, includePro: event.target.checked }))
                }
                className="h-4 w-4 accent-cyan-500"
              />
              <span className="text-sm text-slate-200">职业</span>
            </label>
            <label className="flex h-[42px] items-center gap-2 rounded border border-slate-600 bg-dota-bg px-3">
              <input
                aria-label="路人"
                type="checkbox"
                checked={filters.includePublic}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, includePublic: event.target.checked }))
                }
                className="h-4 w-4 accent-cyan-500"
              />
              <span className="text-sm text-slate-200">路人</span>
            </label>
            <input
              aria-label="match_id"
              value={filters.matchId}
              onChange={(event) => setFilters((current) => ({ ...current, matchId: event.target.value }))}
              placeholder="match_id"
              className="w-full rounded border border-slate-600 bg-dota-bg px-3 py-2 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <input
              aria-label="leagueid"
              value={filters.leagueId}
              onChange={(event) => setFilters((current) => ({ ...current, leagueId: event.target.value }))}
              placeholder="leagueid"
              className="w-full rounded border border-slate-600 bg-dota-bg px-3 py-2 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded border border-cyan-500/60 bg-cyan-700 px-4 py-2 font-medium text-white transition hover:bg-cyan-600"
            >
              查询
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setAppliedFilters(DEFAULT_FILTERS);
                setOffset(0);
                setFeedback(null);
              }}
              className="rounded border border-slate-500/60 bg-slate-700 px-4 py-2 font-medium text-white transition hover:bg-slate-600"
            >
              清空
            </button>
          </form>
        </div>

        {feedback && (
          <div
            className={`rounded border px-4 py-3 text-sm ${feedback.type === 'success'
              ? 'border-emerald-500/60 bg-emerald-900/20 text-emerald-200'
              : 'border-red-500/60 bg-red-900/20 text-red-200'
              }`}
          >
            {feedback.message}
          </div>
        )}

        {error && <div className="rounded border border-red-600 bg-red-900/20 px-4 py-3 text-red-200">{error}</div>}

        <div className="card p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-5 py-4">
            <div className="text-sm text-slate-300">
              当前页可选 <span className="font-semibold text-white">{currentPageMatchIds.length}</span> 场，
              已勾选 <span className="font-semibold text-white">{selectedMatchIds.length}</span> 场
            </div>
            <button
              onClick={() => {
                void handleIngest(selectedMatchIds);
              }}
              disabled={selectedMatchIds.length === 0 || batchLoading || actionMatchId !== null}
              className="rounded border border-emerald-500/60 bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {batchLoading ? '批量入库中...' : '批量下载并入库'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left table-auto">
              <thead className="bg-gradient-to-r from-slate-900 to-slate-800 text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      aria-label="全选当前页"
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      ref={(element) => {
                        if (element) {
                          element.indeterminate = isSomeCurrentPageSelected;
                        }
                      }}
                      onChange={() => {
                        setSelectedMatchIds((current) => {
                          if (isAllCurrentPageSelected) {
                            return current.filter((id) => !currentPageMatchIds.includes(id));
                          }
                          return Array.from(new Set([...current, ...currentPageMatchIds]));
                        });
                      }}
                      className="h-4 w-4 accent-cyan-500"
                    />
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">比赛 ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">开始时间</th>
                  <th className="px-4 py-3 whitespace-nowrap">时长</th>
                  <th className="px-4 py-3 whitespace-nowrap">天辉</th>
                  <th className="px-4 py-3 whitespace-nowrap">夜魇</th>
                  <th className="px-4 py-3 whitespace-nowrap">联赛</th>
                  <th className="px-4 py-3 whitespace-nowrap">来源</th>
                  <th className="px-4 py-3 whitespace-nowrap">下载状态</th>
                  <th className="px-4 py-3 whitespace-nowrap">解析状态</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/80">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                      加载中...
                    </td>
                  </tr>
                ) : matches.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                      未找到实时比赛。
                    </td>
                  </tr>
                ) : (
                  matches.map((match) => {
                    const radiantName = getTeamLabel(
                      match.radiant_team_name ?? match.radiant_name,
                      match.radiant_team_id
                    );
                    const direName = getTeamLabel(match.dire_team_name ?? match.dire_name, match.dire_team_id);
                    const leagueName = getLeagueLabel(match.league_name, match.leagueid);
                    const ingesting = actionMatchId === match.match_id;

                    return (
                      <tr key={match.match_id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <input
                            aria-label={`选择比赛 ${match.match_id}`}
                            type="checkbox"
                            checked={selectedMatchIds.includes(match.match_id)}
                            onChange={() => {
                              setSelectedMatchIds((current) =>
                                current.includes(match.match_id)
                                  ? current.filter((id) => id !== match.match_id)
                                  : [...current, match.match_id]
                              );
                            }}
                            className="h-4 w-4 accent-cyan-500"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-dota-gold whitespace-nowrap">
                          {match.match_id}
                        </td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatUnixTimestampLocal(match.start_time)}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDurationClock(match.duration)}</td>
                        <td className="px-3 py-2.5 text-slate-200">
                          <div className="flex flex-col items-center gap-1 min-w-[64px]">
                            <MatchIcon
                              label="Radiant"
                              url={pickAssetUrl(
                                match.radiant_icon_url,
                                match.radiant_logo_url,
                                match.radiant_logo_sponsor_url
                              )}
                            />
                            <span className="text-[11px] text-center leading-tight max-w-[96px] truncate text-slate-300" title={radiantName}>{radiantName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-200">
                          <div className="flex flex-col items-center gap-1 min-w-[64px]">
                            <MatchIcon
                              label="Dire"
                              url={pickAssetUrl(
                                match.dire_icon_url,
                                match.dire_logo_url,
                                match.dire_logo_sponsor_url
                              )}
                            />
                            <span className="text-[11px] text-center leading-tight max-w-[96px] truncate text-slate-300" title={direName}>{direName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-200">
                          <div className="flex flex-col items-center gap-1 min-w-[64px]">
                            <MatchIcon
                              label="League"
                              url={pickAssetUrl(
                                match.league_icon_url,
                                match.league_image_url,
                                match.league_banner_url,
                                match.league_logo_url
                              )}
                            />
                            <span className="text-[11px] text-center leading-tight max-w-[96px] truncate text-slate-300" title={leagueName}>{leagueName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{getSourceLabel(match.source)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold leading-5 ${getDownloadStatusBadge(match.download_status).className
                              }`}
                          >
                            {getDownloadStatusBadge(match.download_status).label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold leading-5 ${getParseStatusBadge(match.local_parse_status).className
                              }`}
                          >
                            {getParseStatusBadge(match.local_parse_status).label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex flex-nowrap items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                void handleIngest([match.match_id]);
                              }}
                              disabled={ingesting || batchLoading}
                              className="rounded border border-emerald-500/60 px-3 py-1.5 text-sm whitespace-nowrap text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {ingesting ? '入库中...' : '下载并入库'}
                            </button>
                            <button
                              onClick={async () => {
                                setStatusPanel({
                                  matchId: match.match_id,
                                  loading: true,
                                  error: null,
                                  detail: null,
                                  autoPolling: true,
                                });
                                await refreshStatusPanel(match.match_id, false);
                              }}
                              className="rounded border border-cyan-500/60 px-3 py-1.5 text-sm whitespace-nowrap text-cyan-200 transition hover:border-cyan-400 hover:text-cyan-100"
                            >
                              状态详情
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-700 px-6 py-4 text-sm">
            <span className="text-slate-400">
              偏移 <span className="text-white">{offset}</span> / 总数 <span className="text-white">{total}</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_LIMIT))}
                disabled={offset === 0}
                className="rounded border border-slate-600 bg-slate-700 px-4 py-2 text-white transition hover:bg-slate-600 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                onClick={() => setOffset((current) => current + PAGE_LIMIT)}
                disabled={offset + matches.length >= total}
                className="rounded border border-slate-600 bg-slate-700 px-4 py-2 text-white transition hover:bg-slate-600 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </div>

        {statusPanel && (
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-slate-700 bg-slate-900/95 shadow-2xl">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">下载/解析状态</h2>
                  <p className="mt-1 text-xs font-mono text-slate-400">match_id: {statusPanel.matchId}</p>
                  <p className="mt-1 text-xs text-cyan-300/90">
                    {statusPanel.autoPolling ? '自动轮询中（每3秒）' : '自动轮询已停止'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      void refreshStatusPanel(statusPanel.matchId, true);
                    }}
                    className="rounded border border-cyan-500/60 px-3 py-1.5 text-sm text-cyan-200 hover:border-cyan-400"
                  >
                    刷新
                  </button>
                  <button
                    onClick={() => {
                      setStatusPanel((current) => {
                        if (!current) {
                          return current;
                        }
                        return {
                          ...current,
                          autoPolling: !current.autoPolling,
                        };
                      });
                    }}
                    className="rounded border border-amber-500/60 px-3 py-1.5 text-sm text-amber-200 hover:border-amber-400"
                  >
                    {statusPanel.autoPolling ? '停止轮询' : '开启轮询'}
                  </button>
                  <button
                    onClick={() => setStatusPanel(null)}
                    className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                  >
                    关闭
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 px-5 py-4 text-sm">
                {statusPanel.loading && <div className="text-slate-400">状态加载中...</div>}
                {statusPanel.error && (
                  <div className="rounded border border-red-500/60 bg-red-900/20 px-3 py-2 text-red-200">
                    {statusPanel.error}
                  </div>
                )}
                {statusPanel.detail && (
                  <>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">download.status</div>
                      <div className="text-white">{statusPanel.detail.download_task?.status ?? '--'}</div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">download.error</div>
                      <div className="text-white break-words">
                        {statusPanel.detail.download_task?.error_code ?? '--'}
                        {statusPanel.detail.download_task?.error_message
                          ? `: ${statusPanel.detail.download_task.error_message}`
                          : ''}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">parse.status</div>
                      <div className="text-white">{statusPanel.detail.local_parse_status ?? '--'}</div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">files</div>
                      <div className="text-white">
                        dem: {statusPanel.detail.replay_dem_exists ? 'yes' : 'no'} | dem.bz2:{' '}
                        {statusPanel.detail.replay_bz2_exists ? 'yes' : 'no'}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">replay_path</div>
                      <div className="font-mono text-white break-all">
                        {statusPanel.detail.local_replay_path ?? '--'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OpenDotaLivePage;
