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

function getPipelineStatusBadge(
  downloadStatus: string | null | undefined,
  parseStatus: string | null | undefined
): { label: string; className: string } {
  const normalizedDownloadStatus = (downloadStatus || '').toLowerCase();
  const normalizedParseStatus = resolvePipelineParseStatus(downloadStatus, parseStatus);

  if (normalizedDownloadStatus === 'failed' || normalizedParseStatus === 'failed') {
    return { label: '流水线失败', className: 'border-red-500/60 bg-red-900/30 text-red-200' };
  }
  if (normalizedParseStatus === 'completed') {
    return { label: '可回放', className: 'border-emerald-500/60 bg-emerald-900/30 text-emerald-200' };
  }
  if (normalizedParseStatus === 'parsing') {
    return { label: '解析中', className: 'border-amber-500/60 bg-amber-900/30 text-amber-200' };
  }
  if (normalizedDownloadStatus === 'downloading' || normalizedDownloadStatus === 'prepared') {
    return { label: '下载中', className: 'border-cyan-500/60 bg-cyan-900/30 text-cyan-200' };
  }
  if (normalizedDownloadStatus === 'completed') {
    return { label: '待解析', className: 'border-blue-500/60 bg-blue-900/30 text-blue-200' };
  }
  return { label: '未开始', className: 'border-slate-500/60 bg-slate-800/60 text-slate-300' };
}

function resolvePipelineParseStatus(
  downloadStatus: string | null | undefined,
  parseStatus: string | null | undefined
): string | null {
  const normalizedParseStatus = (parseStatus || '').toLowerCase();
  if (normalizedParseStatus) {
    return normalizedParseStatus;
  }

  const normalizedDownloadStatus = (downloadStatus || '').toLowerCase();
  if (normalizedDownloadStatus === 'parsing') {
    return 'parsing';
  }
  if (normalizedDownloadStatus === 'completed') {
    return 'pending';
  }

  return null;
}

function isTerminalParseStatus(status: string | null | undefined): boolean {
  const normalized = (status || '').toLowerCase();
  return normalized === 'completed' || normalized === 'failed';
}

function isTerminalPipelineStatus(
  downloadStatus: string | null | undefined,
  parseStatus: string | null | undefined
): boolean {
  const normalizedDownloadStatus = (downloadStatus || '').toLowerCase();
  if (normalizedDownloadStatus === 'failed') {
    return true;
  }
  if (normalizedDownloadStatus !== 'completed') {
    return false;
  }

  return isTerminalParseStatus(resolvePipelineParseStatus(downloadStatus, parseStatus));
}

interface LiveMatchStatus {
  downloadStatus: string;   // 'downloading' | 'parsing' | 'completed' | 'failed' | ...
  downloadProgress: number; // 0-100
  parseStatus: string | null;
}

function MatchIcon({ url, label }: { url?: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  const fallbackText = label === 'Radiant' ? '天' : label === 'Dire' ? '夜' : '联';
  const fallbackClassName =
    label === 'Radiant'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : label === 'Dire'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-200';

  if (!url || broken) {
    return (
      <div
        title={`${label} 图标缺失`}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border border-dashed text-xs font-semibold ${fallbackClassName}`}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={`${label} 图标`}
      className="max-h-7 max-w-[56px] shrink-0 rounded border border-slate-600/40 bg-slate-900/60 object-contain"
      loading="lazy"
      referrerPolicy="no-referrer"
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
  const [liveStatus, setLiveStatus] = useState<Map<number, LiveMatchStatus>>(new Map());

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
          autoPolling: isTerminalPipelineStatus(
            detail.download_task?.status,
            detail.local_parse_status
          )
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
    // Seed liveStatus for active downloads so progress tracking survives page refresh
    setLiveStatus((prev) => {
      const next = new Map(prev);
      for (const m of result.matches ?? []) {
        if (next.has(m.match_id)) continue;
        const rawStatus = (m.download_status ?? '').toLowerCase();
        if (!rawStatus || isTerminalPipelineStatus(rawStatus, m.local_parse_status)) continue;
        const progress = rawStatus === 'parsing' ? 50 : rawStatus === 'completed' ? 100 : rawStatus === 'prepared' ? 5 : 10;
        next.set(m.match_id, {
          downloadStatus: rawStatus,
          downloadProgress: progress,
          parseStatus: m.local_parse_status ?? null,
        });
      }
      return next;
    });
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
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const autoSyncSources = pickSources(appliedFilters);
          if (autoSyncSources.length === 0) {
            return;
          }
          await remoteService.syncRemoteMatches({ sources: autoSyncSources });
          await fetchMatches();
        } catch (autoSyncError) {
          console.error('Failed to auto-sync remote matches:', autoSyncError);
        }
      })();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [appliedFilters, fetchMatches]);

  useEffect(() => {
    if (!statusPanel || !statusPanel.autoPolling) {
      return;
    }
    if (
      isTerminalPipelineStatus(
        statusPanel.detail?.download_task?.status,
        statusPanel.detail?.local_parse_status
      )
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshStatusPanel(statusPanel.matchId, false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [statusPanel, refreshStatusPanel]);

  // Per-row live status polling (same pattern as statusPanel auto-polling above)
  useEffect(() => {
    // Find active entries that still need polling across download + parse stages
    const activeIds: number[] = [];
    liveStatus.forEach((entry, matchId) => {
      if (!isTerminalPipelineStatus(entry.downloadStatus, entry.parseStatus)) {
        activeIds.push(matchId);
      }
    });

    if (activeIds.length === 0) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const updates = new Map(liveStatus);
      let changed = false;

      for (const matchId of activeIds) {
        try {
          const resp = await remoteService.getMatchStatus(matchId);
          const dlStatus = (resp.download_task?.status || 'downloading').toLowerCase();
          const dlProgress = resp.download_task?.progress ?? (dlStatus === 'parsing' ? 60 : dlStatus === 'completed' ? 100 : 10);
          const parseStatus = resp.local_parse_status ?? null;
          updates.set(matchId, { downloadStatus: dlStatus, downloadProgress: dlProgress, parseStatus });
          changed = true;
        } catch (statusError) {
          console.error(`Failed to poll status for match ${matchId}:`, statusError);
        }
      }

      if (changed) {
        setLiveStatus(updates);
      }
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [liveStatus]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pickSources(filters).length === 0) {
      setFeedback({ type: 'error', message: '请至少选择一个来源（职业或路人）。' });
      return;
    }
    setOffset(0);
    setAppliedFilters(filters);
    setFeedback(null);
  };

  const handleManualSync = async () => {
    const syncSources = pickSources(appliedFilters);
    if (syncSources.length === 0) {
      setFeedback({ type: 'error', message: '当前没有启用的来源，无法同步。' });
      return;
    }

    setSyncing(true);
    setFeedback(null);

    try {
      const result = await remoteService.syncRemoteMatches({
        sources: syncSources,
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

    // Immediately set live status so UI shows progress without waiting for API response
    setLiveStatus((prev) => {
      const next = new Map(prev);
      for (const id of matchIds) {
        next.set(id, { downloadStatus: 'downloading', downloadProgress: 10, parseStatus: null });
      }
      return next;
    });

    try {
      const result = await remoteService.ingestMatches(matchIds);
      setFeedback({
        type: 'success',
        message: result.message || `已触发 ${matchIds.length} 场比赛的入库任务。`,
      });
      setSelectedMatchIds((current) => current.filter((id) => !matchIds.includes(id)));
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
      // Clear live status for failed ingest calls
      setLiveStatus((prev) => {
        const next = new Map(prev);
        for (const id of matchIds) {
          next.delete(id);
        }
        return next;
      });
    } finally {
      setActionMatchId(null);
      setBatchLoading(false);
    }
  };

  const handleCancel = async (matchId: number) => {
    try {
      await remoteService.cancelMatchDownload(matchId);
      setLiveStatus((prev) => {
        const next = new Map(prev);
        next.delete(matchId);
        return next;
      });
      setFeedback({ type: 'success', message: `比赛 ${matchId} 下载已取消。` });
      await fetchMatches();
    } catch (cancelError) {
      console.error('Failed to cancel download:', cancelError);
      setFeedback({ type: 'error', message: '取消下载失败，请稍后重试。' });
    }
  };

  const currentPageMatchIds = matches
    .map((match) => match.match_id)
    .filter((matchId) => Number.isFinite(matchId) && matchId > 0);
  const selectedCurrentPageCount = currentPageMatchIds.filter((matchId) =>
    selectedMatchIds.includes(matchId)
  ).length;
  const isAllCurrentPageSelected =
    currentPageMatchIds.length > 0 && selectedCurrentPageCount === currentPageMatchIds.length;
  const isSomeCurrentPageSelected =
    selectedCurrentPageCount > 0 && selectedCurrentPageCount < currentPageMatchIds.length;
  const selectedSources = pickSources(appliedFilters);
  const activeFilterCount = [appliedFilters.matchId, appliedFilters.leagueId].filter(
    (value) => value.trim().length > 0
  ).length + selectedSources.length;
  const activePipelineCount = matches.filter((match) => {
    const live = liveStatus.get(match.match_id);
    return !isTerminalPipelineStatus(
      live?.downloadStatus ?? match.download_status,
      live?.parseStatus ?? match.local_parse_status
    );
  }).length;
  const replayReadyCount = matches.filter((match) => {
    const live = liveStatus.get(match.match_id);
    return resolvePipelineParseStatus(
      live?.downloadStatus ?? match.download_status,
      live?.parseStatus ?? match.local_parse_status
    ) === 'completed';
  }).length;

  return (
    <div className="workspace-page bg-dota-bg">
      <div className="workspace-stack">
        <div className="workspace-header border-cyan-500/20">
          <div className="workspace-header-row">
            <div>
              <p className="workspace-eyebrow text-cyan-300/80">OpenDota Live Intake</p>
              <h1 className="workspace-title text-dota-gold">OpenDota 实时比赛</h1>
              <p className="workspace-description text-cyan-100/75">
                自动同步远端比赛列表，并把下载、解析和可回放状态放到同一条流水线里。
              </p>
            </div>
            <div className="workspace-kpi-grid xl:min-w-[420px]">
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">流水线进行中</p>
                <p className="workspace-kpi-value">{activePipelineCount}</p>
                <p className="workspace-kpi-hint">下载或解析未结束</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">可回放</p>
                <p className="workspace-kpi-value">{replayReadyCount}</p>
                <p className="workspace-kpi-hint">当前页已解析完成</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">已勾选</p>
                <p className="workspace-kpi-value">{selectedMatchIds.length}</p>
                <p className="workspace-kpi-hint">准备批量入库</p>
              </div>
            </div>
          </div>

          <div className="workspace-pill-row">
            <span className="workspace-pill">
              自动同步 每 1 分钟
            </span>
            <span className="workspace-pill">
              激活筛选 {activeFilterCount}
            </span>
            <span className="workspace-pill">
              来源 {selectedSources.length > 0 ? selectedSources.map(getSourceLabel).join(' + ') : '未选择'}
            </span>
            <span className="workspace-pill">
              当前页 {matches.length} / 总数 {total}
            </span>
            <button
              onClick={() => {
                void handleManualSync();
              }}
              disabled={syncing}
              className="rounded-full border border-cyan-500/50 bg-cyan-600/15 px-3 py-1.5 text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? '同步中...' : '立即同步远端列表'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.24fr)_340px]">
          <div className="workspace-panel">
            <div className="workspace-panel-header">
              <h2 className="workspace-panel-title">筛选实时比赛</h2>
              <p className="workspace-panel-description">
                比赛 ID 适合精确定位，联赛 ID 适合做赛事级别筛选。
              </p>
            </div>
            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <label className="workspace-checkpanel">
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
              <label className="workspace-checkpanel">
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
              <div className="xl:col-span-2">
                <label className="mb-1.5 block text-sm text-slate-400">比赛 ID</label>
                <input
                  aria-label="match_id"
                  value={filters.matchId}
                  onChange={(event) => setFilters((current) => ({ ...current, matchId: event.target.value }))}
                  placeholder="例如 8674716612"
                  className="workspace-input"
                />
              </div>
              <div className="xl:col-span-2">
                <label className="mb-1.5 block text-sm text-slate-400">联赛 ID</label>
                <input
                  aria-label="leagueid"
                  value={filters.leagueId}
                  onChange={(event) => setFilters((current) => ({ ...current, leagueId: event.target.value }))}
                  placeholder="例如 15475"
                  className="workspace-input"
                />
              </div>
              <div className="flex flex-wrap gap-2 xl:col-span-6">
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
              </div>
            </form>
          </div>

          <div className="workspace-panel">
            <div className="workspace-panel-header">
              <h2 className="workspace-panel-title">批量入库</h2>
              <p className="workspace-panel-description">
              勾选比赛后，会顺序执行下载和解析；可随时查看单场状态详情。
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">当前选择</p>
              <p className="mt-2 text-2xl font-semibold text-white">{selectedMatchIds.length}</p>
              <p className="mt-1 text-sm text-slate-400">
                {selectedMatchIds.length === 0 ? '请先勾选要下载的比赛。' : '准备下载并入库选中比赛。'}
              </p>
              <button
                onClick={() => {
                  void handleIngest(selectedMatchIds);
                }}
                disabled={selectedMatchIds.length === 0 || batchLoading || actionMatchId !== null}
                className="mt-4 w-full rounded border border-emerald-500/60 bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {batchLoading ? '批量入库中...' : '批量下载并入库'}
              </button>
              <button
                onClick={() => setSelectedMatchIds([])}
                disabled={selectedMatchIds.length === 0}
                className="mt-2 w-full rounded border border-slate-600 px-4 py-2 text-sm text-white transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                清空勾选
              </button>
            </div>
          </div>
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

        <div className="workspace-table-shell">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-100">实时比赛列表</p>
              <p className="mt-1 text-sm text-slate-300">
                当前页可选 <span className="font-semibold text-white">{currentPageMatchIds.length}</span> 场，
                已勾选 <span className="font-semibold text-white">{selectedMatchIds.length}</span> 场，
                当前页命中 <span className="font-semibold text-white">{selectedCurrentPageCount}</span> 场。
              </p>
            </div>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
              查看“状态详情”可追踪单场下载与解析链路
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left table-auto">
              <thead className="bg-gradient-to-r from-slate-900 to-slate-800 text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-2 py-2">
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
                  <th className="px-2 py-2 whitespace-nowrap">比赛 ID</th>
                  <th className="px-2 py-2 whitespace-nowrap">开始时间</th>
                  <th className="px-2 py-2 whitespace-nowrap">时长</th>
                  <th className="px-2 py-2 whitespace-nowrap">天辉</th>
                  <th className="px-2 py-2 whitespace-nowrap">夜魇</th>
                  <th className="px-2 py-2 whitespace-nowrap">联赛</th>
                  <th className="px-2 py-2 whitespace-nowrap">来源</th>
                  <th className="px-2 py-2 whitespace-nowrap">下载状态</th>
                  <th className="px-2 py-2 whitespace-nowrap">解析状态</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">操作</th>
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
                    const live = liveStatus.get(match.match_id);
                    const liveParseStatus = live
                      ? resolvePipelineParseStatus(live.downloadStatus, live.parseStatus)
                      : null;
                    const effectiveDownloadStatus = live?.downloadStatus ?? match.download_status;
                    const effectiveParseStatus = live?.parseStatus ?? match.local_parse_status;
                    const pipelineBadge = getPipelineStatusBadge(
                      effectiveDownloadStatus,
                      effectiveParseStatus
                    );

                    return (
                      <tr key={match.match_id} className="hover:bg-slate-800/40">
                        <td className="px-2 py-2">
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
                        <td className="px-2 py-2 font-mono font-semibold text-dota-gold whitespace-nowrap">
                          {match.match_id}
                        </td>
                        <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{formatUnixTimestampLocal(match.start_time)}</td>
                        <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{formatDurationClock(match.duration)}</td>
                        <td className="px-2 py-1.5 text-slate-200">
                          <div className="flex flex-col items-center gap-0.5 min-w-[40px]">
                            <MatchIcon
                              label="Radiant"
                              url={pickAssetUrl(
                                match.radiant_icon_url,
                                match.radiant_logo_url,
                                match.radiant_logo_sponsor_url
                              )}
                            />
                            <span className="text-[10px] text-center leading-tight max-w-[60px] truncate text-slate-300" title={radiantName}>{radiantName}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-slate-200">
                          <div className="flex flex-col items-center gap-0.5 min-w-[40px]">
                            <MatchIcon
                              label="Dire"
                              url={pickAssetUrl(
                                match.dire_icon_url,
                                match.dire_logo_url,
                                match.dire_logo_sponsor_url
                              )}
                            />
                            <span className="text-[10px] text-center leading-tight max-w-[60px] truncate text-slate-300" title={direName}>{direName}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-slate-200">
                          <div className="flex flex-col items-center gap-0.5 min-w-[40px]">
                            <MatchIcon
                              label="League"
                              url={pickAssetUrl(
                                match.league_icon_url,
                                match.league_image_url,
                                match.league_banner_url,
                                match.league_logo_url
                              )}
                            />
                            <span className="text-[10px] text-center leading-tight max-w-[60px] truncate text-slate-300" title={leagueName}>{leagueName}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-slate-200 whitespace-nowrap">{getSourceLabel(match.source)}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {live?.downloadStatus === 'downloading' ? (
                            <div className="space-y-1">
                              <div className="relative h-5 w-[108px] rounded-full bg-slate-700">
                                <div className="absolute inset-y-0 left-0 rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${live.downloadProgress}%` }} />
                                <span className="relative z-10 flex h-full items-center justify-center text-[10px] font-semibold text-white select-none">
                                  下载 {live.downloadProgress}%
                                </span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); void handleCancel(match.match_id); }}
                                title="取消下载"
                                className="rounded border border-red-500/60 px-2 py-0.5 text-[10px] text-red-200 transition hover:border-red-400 hover:text-red-100"
                              >
                                取消下载
                              </button>
                            </div>
                          ) : live ? (
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold leading-5 ${
                              live.downloadStatus === 'failed'
                                ? 'border-red-500/60 bg-red-900/30 text-red-200'
                                : 'border-emerald-500/60 bg-emerald-900/30 text-emerald-200'
                            }`}>
                              {live.downloadStatus === 'failed' ? '下载失败' : '下载成功'}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold leading-5 ${getDownloadStatusBadge(match.download_status).className}`}>
                              {getDownloadStatusBadge(match.download_status).label}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="space-y-1">
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold leading-5 ${pipelineBadge.className}`}>
                              {pipelineBadge.label}
                            </span>
                            {liveParseStatus === 'parsing' ? (
                            <div className="relative h-5 w-[56px] rounded-full bg-slate-700">
                              <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-amber-500 transition-all duration-500" />
                              <span className="relative z-10 flex h-full items-center justify-center text-[10px] font-semibold text-white select-none">
                                解析中
                              </span>
                            </div>
                          ) : live ? (
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold leading-5 ${getParseStatusBadge(liveParseStatus).className}`}>
                              {getParseStatusBadge(liveParseStatus).label}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold leading-5 ${getParseStatusBadge(match.local_parse_status).className}`}>
                              {getParseStatusBadge(match.local_parse_status).label}
                            </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                void handleIngest([match.match_id]);
                              }}
                              disabled={ingesting || batchLoading}
                              className="rounded border border-emerald-500/60 px-2 py-1 text-xs whitespace-nowrap text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
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
                              className="rounded border border-cyan-500/60 px-2 py-1 text-xs whitespace-nowrap text-cyan-200 transition hover:border-cyan-400 hover:text-cyan-100"
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
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          getPipelineStatusBadge(
                            statusPanel.detail.download_task?.status,
                            statusPanel.detail.local_parse_status
                          ).className
                        }`}>
                          {
                            getPipelineStatusBadge(
                              statusPanel.detail.download_task?.status,
                              statusPanel.detail.local_parse_status
                            ).label
                          }
                        </span>
                        {typeof statusPanel.detail.download_task?.progress === 'number' && (
                          <span className="text-xs text-slate-400">
                            下载进度 {statusPanel.detail.download_task.progress}%
                          </span>
                        )}
                      </div>
                      {typeof statusPanel.detail.download_task?.progress === 'number' && (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-cyan-500 transition-[width] duration-300"
                            style={{ width: `${statusPanel.detail.download_task.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">下载阶段</div>
                      <div className="text-white">
                        {getDownloadStatusBadge(statusPanel.detail.download_task?.status).label}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">下载错误</div>
                      <div className="text-white break-words">
                        {statusPanel.detail.download_task?.error_code ?? '--'}
                        {statusPanel.detail.download_task?.error_message
                          ? `: ${statusPanel.detail.download_task.error_message}`
                          : ''}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">解析阶段</div>
                      <div className="text-white">
                        {getParseStatusBadge(statusPanel.detail.local_parse_status).label}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">文件状态</div>
                      <div className="text-white">
                        DEM {statusPanel.detail.replay_dem_exists ? '已生成' : '缺失'} | 压缩包{' '}
                        {statusPanel.detail.replay_bz2_exists ? '已保留' : '缺失'}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">本地录像路径</div>
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
