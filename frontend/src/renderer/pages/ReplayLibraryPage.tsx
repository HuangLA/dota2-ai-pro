import { useCallback, useEffect, useMemo, useState } from 'react';
import { libraryService, LibraryMatchRecord } from '../api/libraryService';
import { RemoteMatchRecord, remoteService } from '../api/remoteService';
import { formatDurationClock, formatUnixTimestampLocal } from './matchDatabaseFormatting';

const PAGE_LIMIT = 20;
const REMOTE_LIMIT = 20;

function getLastPageOffset(total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.floor((total - 1) / PAGE_LIMIT) * PAGE_LIMIT;
}

interface ReplayLibraryPageProps {
  onOpenReplay?: (matchId: number) => void;
}

interface FilterState {
  teamId: string;
  playerId: string;
  leagueId: string;
}

const DEFAULT_FILTERS: FilterState = {
  teamId: '',
  playerId: '',
  leagueId: '',
};

function toOptionalInt(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getTeamText(value: string | null | undefined): string {
  if (value && value.trim()) {
    return value;
  }
  return '未知战队';
}

function getLeagueText(value: string | null | undefined, leagueId: number | null | undefined): string {
  if (value && value.trim()) {
    return value;
  }
  if (leagueId !== undefined && leagueId !== null) {
    return `联赛 ${leagueId}`;
  }
  return '未知联赛';
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
  return { label: '未入库', className: 'border-slate-500/60 bg-slate-800/60 text-slate-300' };
}

function canIngestRemoteMatch(match: RemoteMatchRecord): boolean {
  const normalizedDownloadStatus = (match.download_status || '').toLowerCase();
  const normalizedParseStatus = (match.local_parse_status || '').toLowerCase();

  if (normalizedParseStatus === 'completed') {
    return false;
  }
  if (normalizedDownloadStatus === 'downloading' || normalizedDownloadStatus === 'prepared' || normalizedDownloadStatus === 'parsing') {
    return false;
  }
  if (normalizedDownloadStatus === 'completed' && normalizedParseStatus !== 'failed') {
    return false;
  }

  return true;
}

function getRemoteActionLabel(match: RemoteMatchRecord): string {
  const normalizedParseStatus = (match.local_parse_status || '').toLowerCase();
  const normalizedDownloadStatus = (match.download_status || '').toLowerCase();

  if (normalizedParseStatus === 'completed') {
    return '打开回放';
  }
  if (normalizedDownloadStatus === 'failed' || normalizedParseStatus === 'failed') {
    return '重新入库';
  }
  if (!canIngestRemoteMatch(match)) {
    return '处理中...';
  }
  return '下载并入库';
}

export function ReplayLibraryPage({ onOpenReplay }: ReplayLibraryPageProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState<LibraryMatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteMatches, setRemoteMatches] = useState<RemoteMatchRecord[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);
  const [ingestingMatchId, setIngestingMatchId] = useState<number | null>(null);

  const query = useMemo(
    () => ({
      team_id: toOptionalInt(appliedFilters.teamId),
      player_id: toOptionalInt(appliedFilters.playerId),
      leagueid: toOptionalInt(appliedFilters.leagueId),
      limit: PAGE_LIMIT,
      offset,
    }),
    [appliedFilters.leagueId, appliedFilters.playerId, appliedFilters.teamId, offset]
  );

  const remoteQuery = useMemo(
    () => ({
      player_id: toOptionalInt(appliedFilters.playerId),
      leagueid: toOptionalInt(appliedFilters.leagueId),
      limit: REMOTE_LIMIT,
    }),
    [appliedFilters.leagueId, appliedFilters.playerId]
  );

  const shouldSearchRemote = remoteQuery.player_id !== undefined || remoteQuery.leagueid !== undefined;

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await libraryService.getLibraryMatches(query);
      setMatches(result.matches ?? []);
      setTotal(result.total ?? 0);
    } catch (fetchError) {
      console.error('Failed to fetch replay library list:', fetchError);
      setMatches([]);
      setTotal(0);
      setError('本地录像库加载失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const fetchRemoteMatches = useCallback(async () => {
    if (!shouldSearchRemote) {
      setRemoteMatches([]);
      setRemoteError(null);
      setRemoteLoading(false);
      return;
    }

    setRemoteLoading(true);
    setRemoteError(null);

    try {
      const result = await remoteService.searchRemoteMatches(remoteQuery);
      setRemoteMatches(result.matches ?? []);
    } catch (fetchError) {
      console.error('Failed to search remote replay candidates:', fetchError);
      setRemoteMatches([]);
      setRemoteError('OpenDota 搜索失败，请稍后重试。');
    } finally {
      setRemoteLoading(false);
    }
  }, [remoteQuery, shouldSearchRemote]);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    void fetchRemoteMatches();
  }, [fetchRemoteMatches]);

  useEffect(() => {
    if (total === 0 || offset < total) {
      return;
    }

    setOffset(getLastPageOffset(total));
  }, [offset, total]);

  const handleDelete = async (matchId: number) => {
    const confirmed = window.confirm(`确认删除比赛 ${matchId} 的本地录像与解析产物吗？此操作不可撤销。`);
    if (!confirmed) {
      return;
    }

    setDeletingMatchId(matchId);
    setFeedback(null);

    try {
      const result = await libraryService.deleteLibraryMatch(matchId);
      setFeedback({
        type: result.status === 'ok' ? 'success' : 'error',
        message: result.message || `比赛 ${matchId} 删除请求已完成。`,
      });
      await Promise.all([fetchMatches(), fetchRemoteMatches()]);
    } catch (deleteError) {
      console.error('Failed to delete replay file from library:', deleteError);
      setFeedback({
        type: 'error',
        message: `比赛 ${matchId} 删除失败。`,
      });
    } finally {
      setDeletingMatchId(null);
    }
  };

  const handleRemoteIngest = async (match: RemoteMatchRecord) => {
    const matchId = match.match_id;
    if (!canIngestRemoteMatch(match)) {
      return;
    }

    setIngestingMatchId(matchId);
    setFeedback(null);

    try {
      const result = await remoteService.ingestMatches([matchId]);
      const currentResult = result.results?.[0];
      const hasFailed = currentResult?.status === 'failed' || (result.failed ?? 0) > 0;
      setFeedback({
        type: hasFailed ? 'error' : 'success',
        message: currentResult?.message || (hasFailed ? `比赛 ${matchId} 入库失败。` : `比赛 ${matchId} 已加入下载与解析流水线。`),
      });
      await Promise.all([fetchMatches(), fetchRemoteMatches()]);
    } catch (ingestError) {
      console.error('Failed to ingest remote match:', ingestError);
      setFeedback({
        type: 'error',
        message: `比赛 ${matchId} 入库失败。`,
      });
    } finally {
      setIngestingMatchId(null);
    }
  };

  const localReadyCount = matches.length;
  const remoteReadyCount = remoteMatches.filter((match) => (match.local_parse_status || '').toLowerCase() === 'completed').length;
  const remoteActionableCount = remoteMatches.filter(canIngestRemoteMatch).length;
  const activeRemoteFilterCount = [appliedFilters.playerId, appliedFilters.leagueId].filter((value) => value.trim().length > 0).length;

  return (
    <div className="workspace-page">
      <div className="workspace-stack">
        <div className="workspace-header">
          <div className="workspace-header-row">
            <div>
              <p className="workspace-eyebrow">Replay Workspace</p>
              <h1 className="workspace-title text-white">录像库与远端发现</h1>
              <p className="workspace-description">
                本地库负责直接回放，`player_id` 和 `leagueid` 会额外直连 OpenDota 搜索可下载比赛。
              </p>
            </div>
            <div className="workspace-kpi-grid">
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">本地可回放</p>
                <p className="workspace-kpi-value">{localReadyCount}</p>
                <p className="workspace-kpi-hint">当前页已解析完成</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">远端命中</p>
                <p className="workspace-kpi-value">{remoteMatches.length}</p>
                <p className="workspace-kpi-hint">来自 OpenDota 直连搜索</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">可立即入库</p>
                <p className="workspace-kpi-value">{remoteActionableCount}</p>
                <p className="workspace-kpi-hint">未下载且可触发流水线</p>
              </div>
            </div>
          </div>

          <div className="workspace-pill-row">
            <span className="workspace-pill">
              本地分页 {matches.length} / 总数 {total}
            </span>
            <span className="workspace-pill">
              远端激活筛选 {activeRemoteFilterCount}
            </span>
            <span className="workspace-pill">
              远端可回放 {remoteReadyCount}
            </span>
          </div>
        </div>

        <div className="workspace-panel">
          <div className="workspace-panel-header">
            <h2 className="workspace-panel-title">筛选与发现</h2>
            <p className="workspace-panel-description">
              `team_id` 只过滤本地已解析录像；`player_id`、`leagueid` 会同步检索 OpenDota 候选比赛。
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setOffset(0);
              setAppliedFilters(filters);
              setFeedback(null);
            }}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            <input
              aria-label="team_id"
              value={filters.teamId}
              onChange={(event) => setFilters((current) => ({ ...current, teamId: event.target.value }))}
              placeholder="team_id（本地过滤）"
              className="workspace-input focus:border-emerald-500"
            />
            <input
              aria-label="player_id"
              value={filters.playerId}
              onChange={(event) => setFilters((current) => ({ ...current, playerId: event.target.value }))}
              placeholder="player_id（OpenDota 搜索）"
              className="workspace-input focus:border-emerald-500"
            />
            <input
              aria-label="leagueid"
              value={filters.leagueId}
              onChange={(event) => setFilters((current) => ({ ...current, leagueId: event.target.value }))}
              placeholder="leagueid（OpenDota 搜索）"
              className="workspace-input focus:border-emerald-500"
            />
            <div className="workspace-action-row md:col-span-2 xl:col-span-3">
              <button
                type="submit"
                className="workspace-action-button min-w-[112px] border border-emerald-500/60 bg-emerald-700 text-white transition hover:bg-emerald-600"
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
                className="workspace-action-button min-w-[112px] border border-slate-500/60 bg-slate-700 text-white transition hover:bg-slate-600"
              >
                清空
              </button>
            </div>
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

        <div className="workspace-table-shell">
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">远端发现结果</h2>
              <p className="mt-1 text-sm text-slate-400">
                命中的比赛可以直接触发下载与解析；已经入库的比赛会直接显示为可回放。
              </p>
            </div>
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
              OpenDota 直连
            </span>
          </div>

          {!shouldSearchRemote ? (
            <div className="px-6 py-8 text-sm text-slate-400">
              输入 `player_id` 或 `leagueid` 后，这里会直接展示 OpenDota 搜索到的比赛，而不是只过滤本地库。
            </div>
          ) : remoteError ? (
            <div className="px-6 py-8 text-sm text-red-200">{remoteError}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left">
                <thead className="bg-gradient-to-r from-slate-900 to-slate-800 text-xs uppercase tracking-wide text-slate-300">
                  <tr>
                    <th className="px-4 py-3">match_id</th>
                    <th className="px-4 py-3">时间</th>
                    <th className="px-4 py-3">时长</th>
                    <th className="px-4 py-3">队伍</th>
                    <th className="px-4 py-3">联赛</th>
                    <th className="px-4 py-3">流水线</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80">
                  {remoteLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        正在从 OpenDota 搜索比赛...
                      </td>
                    </tr>
                  ) : remoteMatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        当前筛选没有命中远端比赛。
                      </td>
                    </tr>
                  ) : (
                    remoteMatches.map((match) => {
                      const pipelineStatus = getPipelineStatusBadge(match.download_status, match.local_parse_status);
                      const actionLabel = getRemoteActionLabel(match);
                      const isReplayReady = (match.local_parse_status || '').toLowerCase() === 'completed';
                      const isBusy = ingestingMatchId === match.match_id || (!canIngestRemoteMatch(match) && !isReplayReady);

                      return (
                        <tr key={`remote-${match.match_id}`} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono font-semibold text-dota-gold">{match.match_id}</td>
                          <td className="px-4 py-3 text-slate-300">{formatUnixTimestampLocal(match.start_time)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDurationClock(match.duration)}</td>
                          <td className="px-4 py-3 text-slate-200">
                            {getTeamText(match.radiant_team_name)} vs {getTeamText(match.dire_team_name)}
                          </td>
                          <td className="px-4 py-3 text-slate-200">{getLeagueText(match.league_name, match.leagueid)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${pipelineStatus.className}`}>
                              {pipelineStatus.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  if (isReplayReady) {
                                    onOpenReplay?.(match.match_id);
                                    return;
                                  }
                                  void handleRemoteIngest(match);
                                }}
                                disabled={isBusy || (isReplayReady && !onOpenReplay)}
                                className="rounded border border-cyan-500/50 px-3 py-1.5 text-sm text-cyan-100 transition hover:border-cyan-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {ingestingMatchId === match.match_id ? '处理中...' : actionLabel}
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
          )}
        </div>

        <div className="workspace-table-shell">
          <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">本地录像库</h2>
              <p className="mt-1 text-sm text-slate-400">仅展示已解析完成的本地录像，适合直接回放与复盘。</p>
            </div>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
              直接回放
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-left">
              <thead className="bg-gradient-to-r from-slate-900 to-slate-800 text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-4 py-3">match_id</th>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">时长</th>
                  <th className="px-4 py-3">队伍</th>
                  <th className="px-4 py-3">联赛</th>
                  <th className="px-4 py-3">replay_path</th>
                  <th className="px-4 py-3">parse_status</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/80">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      加载中...
                    </td>
                  </tr>
                ) : matches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      未找到已解析回放。
                    </td>
                  </tr>
                ) : (
                  matches.map((match) => (
                    <tr key={match.match_id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono font-semibold text-dota-gold">{match.match_id}</td>
                      <td className="px-4 py-3 text-slate-300">{formatUnixTimestampLocal(match.start_time)}</td>
                      <td className="px-4 py-3 text-slate-300">{formatDurationClock(match.duration)}</td>
                      <td className="px-4 py-3 text-slate-200">
                        {getTeamText(match.radiant_team_name)} vs {getTeamText(match.dire_team_name)}
                      </td>
                      <td className="px-4 py-3 text-slate-200">{getLeagueText(match.league_name, match.leagueid)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{match.replay_path ?? '--'}</td>
                      <td className="px-4 py-3 text-slate-200">{match.parse_status ?? '--'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onOpenReplay?.(match.match_id)}
                            className="rounded border border-amber-700/60 px-3 py-1.5 text-sm text-amber-200 transition hover:border-amber-500/70 hover:text-amber-100"
                          >
                            打开回放
                          </button>
                          <button
                            onClick={() => {
                              void handleDelete(match.match_id);
                            }}
                            disabled={deletingMatchId === match.match_id}
                            className="rounded border border-red-700/60 px-3 py-1.5 text-sm text-red-200 transition hover:border-red-500/70 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {deletingMatchId === match.match_id ? '删除中...' : '删除本地录像'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
      </div>
    </div>
  );
}

export default ReplayLibraryPage;
