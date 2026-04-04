import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MatchDatabaseActionMode,
  MatchDatabaseActionTask,
  MatchDatabaseRecord,
  matchDatabaseService,
} from '../api/matchDatabaseService';
import {
  formatDurationClock,
  formatUnixTimestampLocal,
  getDownloadStatusMeta,
  normalizeDownloadStatus,
} from './matchDatabaseFormatting';
import { ReplayEntryContext } from '../types/replayContext';

type HasDownloadFilter = 'all' | 'true' | 'false';

interface FilterFormState {
  teamId: string;
  leagueId: string;
  startTimeFrom: string;
  startTimeTo: string;
  hasDownload: HasDownloadFilter;
  professionalOnly: boolean;
}

export interface MatchDatabaseReplayContext extends ReplayEntryContext {
  source: 'match_database';
}

export interface MatchDatabaseViewState {
  filters: FilterFormState;
  appliedFilters: FilterFormState;
  offset: number;
}

interface FilterPreset {
  name: string;
  filters: FilterFormState;
}

interface BatchFailureItem {
  matchId: number;
  message: string;
}

interface MatchDatabasePageProps {
  onOpenReplay?: (context: MatchDatabaseReplayContext) => void;
  initialViewState?: MatchDatabaseViewState;
  onViewStateChange?: (viewState: MatchDatabaseViewState) => void;
}

const DEFAULT_LIMIT = 20;
const TASK_DETAILS_POLLING_INTERVAL_MS = 4000;
const DEFAULT_FILTERS: FilterFormState = {
  teamId: '',
  leagueId: '',
  startTimeFrom: '',
  startTimeTo: '',
  hasDownload: 'all',
  professionalOnly: true,
};

function normalizeFilters(filters?: Partial<FilterFormState>): FilterFormState {
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    professionalOnly: filters?.professionalOnly ?? true,
  };
}

function isTaskStatusPolling(status: string | undefined): boolean {
  if (!status) {
    return false;
  }

  return status === 'pending' || status === 'prepared' || status === 'downloading';
}

function toUnixSeconds(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.floor(parsed / 1000);
}

function toOptionalInt(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getTeamLabel(name: string | null | undefined, teamId: number | null | undefined): string {
  if (name && name.trim()) {
    return name;
  }

  if (teamId !== undefined && teamId !== null) {
    return `未知战队（ID: ${teamId}）`;
  }

  return '未知战队';
}

function getLeagueLabel(name: string | null | undefined, leagueId: number | null | undefined): string {
  if (name && name.trim()) {
    return name;
  }

  if (leagueId !== undefined && leagueId !== null) {
    return `未知联赛（ID: ${leagueId}）`;
  }

  return '未知联赛';
}

function isReplayReady(downloadStatus: string | null | undefined): boolean {
  return normalizeDownloadStatus(downloadStatus) === 'completed';
}

function getReplayAvailabilityHint(downloadStatus: string | null | undefined): string {
  return isReplayReady(downloadStatus) ? '可直接打开本地回放。' : '录像尚未准备好，请先下载。';
}

export function MatchDatabasePage({
  onOpenReplay,
  initialViewState,
  onViewStateChange,
}: MatchDatabasePageProps) {
  const [matches, setMatches] = useState<MatchDatabaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(initialViewState?.offset ?? 0);
  const [total, setTotal] = useState(0);
  const [activeActionMatchId, setActiveActionMatchId] = useState<number | null>(null);
  const [activeBatchMode, setActiveBatchMode] = useState<MatchDatabaseActionMode | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [taskDetailsTaskId, setTaskDetailsTaskId] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<MatchDatabaseActionTask | null>(null);
  const [taskDetailsLoading, setTaskDetailsLoading] = useState(false);
  const [taskDetailsError, setTaskDetailsError] = useState<string | null>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const batchActionInFlightRef = useRef(false);
  const [taskDetailsAutoOpened, setTaskDetailsAutoOpened] = useState(false);
  const [lastBatchFailures, setLastBatchFailures] = useState<BatchFailureItem[]>([]);
  const [presetName, setPresetName] = useState('');
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [selectedPresetName, setSelectedPresetName] = useState('');
  const [selectedMatchIds, setSelectedMatchIds] = useState<number[]>([]);

  const [filters, setFilters] = useState<FilterFormState>(
    normalizeFilters(initialViewState?.filters)
  );

  const [appliedFilters, setAppliedFilters] = useState<FilterFormState>(
    normalizeFilters(initialViewState?.appliedFilters ?? initialViewState?.filters)
  );

  const queryParams = useMemo(() => {
    const hasDownload =
      appliedFilters.hasDownload === 'all'
        ? undefined
        : appliedFilters.hasDownload === 'true';

    return {
      limit: DEFAULT_LIMIT,
      offset,
      team_id: toOptionalInt(appliedFilters.teamId),
      leagueid: toOptionalInt(appliedFilters.leagueId),
      start_time_from: toUnixSeconds(appliedFilters.startTimeFrom),
      start_time_to: toUnixSeconds(appliedFilters.startTimeTo),
      has_download: hasDownload,
      professional_only: appliedFilters.professionalOnly,
    };
  }, [appliedFilters, offset]);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await matchDatabaseService.getMatchDatabase(queryParams);
      setMatches(data.matches ?? []);
      setTotal(data.total ?? 0);
    } catch (fetchError) {
      console.error('Failed to fetch match database:', fetchError);
      setMatches([]);
      setTotal(0);
      setError('比赛数据库加载失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  const actionableMatches = useMemo(
    () => matches.filter((match) => Number.isFinite(match.match_id) && match.match_id > 0),
    [matches]
  );

  const allCurrentPageMatchIds = useMemo(
    () => actionableMatches.map((match) => match.match_id),
    [actionableMatches]
  );

  const selectedMatchCount = selectedMatchIds.length;
  const selectedCurrentPageCount = allCurrentPageMatchIds.filter((matchId) =>
    selectedMatchIds.includes(matchId)
  ).length;
  const isAllCurrentPageSelected =
    allCurrentPageMatchIds.length > 0 && selectedCurrentPageCount === allCurrentPageMatchIds.length;
  const isSomeCurrentPageSelected =
    selectedCurrentPageCount > 0 && selectedCurrentPageCount < allCurrentPageMatchIds.length;
  const batchActionsDisabled =
    loading ||
    activeActionMatchId !== null ||
    selectedMatchCount === 0;
  const readyReplayCount = actionableMatches.filter((match) => isReplayReady(match.download_status)).length;
  const activeFilterCount = [
    filters.teamId,
    filters.leagueId,
    filters.startTimeFrom,
    filters.startTimeTo,
  ].filter((value) => value.trim().length > 0).length +
    (filters.hasDownload !== 'all' ? 1 : 0) +
    (filters.professionalOnly ? 1 : 0);

  const failedItemsText = useMemo(() => {
    if (lastBatchFailures.length === 0) {
      return '';
    }

    return lastBatchFailures.map((item) => `${item.matchId}\t${item.message}`).join('\n');
  }, [lastBatchFailures]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    if (!onViewStateChange) {
      return;
    }

    onViewStateChange({
      filters,
      appliedFilters,
      offset,
    });
  }, [appliedFilters, filters, offset, onViewStateChange]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOffset(0);
    setAppliedFilters(filters);
    setFeedback(null);
  };

  const handleClear = () => {
    const cleared: FilterFormState = {
      ...DEFAULT_FILTERS,
    };

    setFilters(cleared);
    setAppliedFilters(cleared);
    setOffset(0);
    setFeedback(null);
  };

  const handleSavePreset = () => {
    const normalizedName = presetName.trim();

    if (!normalizedName) {
      setFeedback({
        type: 'error',
        message: '预设名称不能为空。',
      });
      return;
    }

    const nextPreset: FilterPreset = {
      name: normalizedName,
      filters: {
        ...filters,
      },
    };

    setFilterPresets((current) => {
      const existingIndex = current.findIndex((preset) => preset.name === normalizedName);
      if (existingIndex === -1) {
        return [...current, nextPreset];
      }

      const updated = [...current];
      updated[existingIndex] = nextPreset;
      return updated;
    });
    setSelectedPresetName(normalizedName);
    setFeedback({
      type: 'success',
      message: `已保存预设：${normalizedName}`,
    });
  };

  const handleApplyPreset = () => {
    if (!selectedPresetName) {
      return;
    }

    const selectedPreset = filterPresets.find((preset) => preset.name === selectedPresetName);
    if (!selectedPreset) {
      setFeedback({
        type: 'error',
        message: `未找到预设：${selectedPresetName}`,
      });
      return;
    }

    const nextFilters = {
      ...selectedPreset.filters,
    };
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setOffset(0);
    setFeedback({
      type: 'success',
      message: `已应用预设：${selectedPresetName}`,
    });
  };

  const handleCopyFailedItems = async () => {
    if (!failedItemsText) {
      return;
    }

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setFeedback({
        type: 'error',
        message: '当前环境不支持剪贴板功能。',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(failedItemsText);
      setFeedback({
        type: 'success',
        message: `已复制 ${lastBatchFailures.length} 条失败项。`,
      });
    } catch (copyError) {
      console.error('Failed to copy failed items:', copyError);
      setFeedback({
        type: 'error',
        message: '复制失败项失败。',
      });
    }
  };

  const handleExportFailedItems = () => {
    if (!failedItemsText) {
      return;
    }

    try {
      const blob = new Blob([failedItemsText], { type: 'text/plain;charset=utf-8' });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `match-database-failed-items-${Date.now()}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'success',
        message: `已导出 ${lastBatchFailures.length} 条失败项到 .txt`,
      });
    } catch (exportError) {
      console.error('Failed to export failed items:', exportError);
      setFeedback({
        type: 'error',
        message: '导出失败项失败。',
      });
    }
  };

  const handleAction = async (matchId: number) => {
    if (activeBatchMode || batchActionInFlightRef.current) {
      return;
    }

    setActiveActionMatchId(matchId);
    setFeedback(null);

    try {
      const result = await matchDatabaseService.triggerDownloadAction(matchId, 'prepare_and_execute');

      if (result.status === 'ok') {
        setFeedback({
          type: 'success',
          message: `比赛 ${matchId}：${result.message}`,
        });
        if (highlightTimeoutRef.current) {
          window.clearTimeout(highlightTimeoutRef.current);
        }
        setHighlightedMatchId(matchId);
        highlightTimeoutRef.current = window.setTimeout(() => {
          setHighlightedMatchId((current) => (current === matchId ? null : current));
          highlightTimeoutRef.current = null;
        }, 2500);
      } else {
        setFeedback({
          type: 'error',
          message: `比赛 ${matchId}：${result.message}`,
        });
      }

      await fetchMatches();
    } catch (actionError) {
      console.error('Failed to trigger match database action:', actionError);
      setFeedback({
        type: 'error',
        message: `比赛 ${matchId}：请求失败。`,
      });
    } finally {
      setActiveActionMatchId(null);
    }
  };

  const handleBatchAction = async () => {
    if (activeBatchMode || batchActionsDisabled || batchActionInFlightRef.current) {
      return;
    }

    batchActionInFlightRef.current = true;
    setActiveBatchMode('prepare_and_execute');
    setFeedback(null);

    const failures: BatchFailureItem[] = [];
    let successCount = 0;
    let withTaskIdCount = 0;
    let lastTaskIdFromBatch: string | null = null;
    const selectedMatches = [...selectedMatchIds];

    for (const matchId of selectedMatches) {
      try {
        const result = await matchDatabaseService.triggerDownloadAction(
          matchId,
          'prepare_and_execute'
        );
        if (result.task?.task_id) {
          lastTaskIdFromBatch = result.task.task_id;
        }

        if (result.status === 'ok') {
          successCount += 1;
          if (result.task?.task_id) {
            withTaskIdCount += 1;
          }
          continue;
        }

        failures.push({
          matchId,
          message: result.message || '请求失败。',
        });
      } catch (batchError) {
        console.error('Failed to trigger batch match database action:', batchError);
        failures.push({
          matchId,
          message: '请求失败。',
        });
      }
    }

    const totalCount = selectedMatches.length;
    const failedCount = failures.length;
    const summaryPrefix = '勾选批量下载完成。';
    const failurePreview = failures
      .slice(0, 3)
      .map((item) => `${item.matchId}: ${item.message}`)
      .join(' | ');
    const summaryMessage =
      failedCount > 0
        ? `${summaryPrefix} 总数：${totalCount}，成功：${successCount}，失败：${failedCount}，含任务ID：${withTaskIdCount}。失败示例：${failurePreview}`
        : `${summaryPrefix} 总数：${totalCount}，成功：${successCount}，失败：0，含任务ID：${withTaskIdCount}。`;

    setFeedback({
      type: failedCount > 0 ? 'error' : 'success',
      message: summaryMessage,
    });
    setLastBatchFailures(failures);

    try {
      await fetchMatches();
      setSelectedMatchIds([]);
      if (lastTaskIdFromBatch) {
        await handleOpenTaskDetails(lastTaskIdFromBatch, { autoOpened: true });
      }
    } finally {
      setActiveBatchMode(null);
      batchActionInFlightRef.current = false;
    }
  };

  const handleDeleteReplay = async (matchId: number) => {
    if (activeBatchMode || batchActionInFlightRef.current) {
      return;
    }

    const confirmed = window.confirm(`确定删除比赛 ${matchId} 的本地录像文件吗？`);
    if (!confirmed) {
      return;
    }

    setActiveActionMatchId(matchId);
    setFeedback(null);

    try {
      const result = await matchDatabaseService.deleteReplay(matchId);
      setFeedback({
        type: result.status === 'ok' ? 'success' : 'error',
        message: `比赛 ${matchId}：${result.message}`,
      });
      await fetchMatches();
    } catch (deleteError) {
      console.error('Failed to delete replay files:', deleteError);
      setFeedback({
        type: 'error',
        message: `比赛 ${matchId}：删除录像失败。`,
      });
    } finally {
      setActiveActionMatchId(null);
    }
  };

  const handleToggleMatchSelection = (matchId: number) => {
    setSelectedMatchIds((current) => {
      if (current.includes(matchId)) {
        return current.filter((id) => id !== matchId);
      }

      return [...current, matchId];
    });
  };

  const handleToggleSelectAllCurrentPage = () => {
    setSelectedMatchIds((current) => {
      if (isAllCurrentPageSelected) {
        return current.filter((id) => !allCurrentPageMatchIds.includes(id));
      }

      const union = new Set([...current, ...allCurrentPageMatchIds]);
      return Array.from(union);
    });
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const handleOpenReplay = (match: MatchDatabaseRecord) => {
    if (!isReplayReady(match.download_status)) {
      setFeedback({
        type: 'error',
        message: `比赛 ${match.match_id} 的录像尚未准备好，请先下载完成后再打开。`,
      });
      return;
    }

    onOpenReplay?.({
      source: 'match_database',
      matchId: match.match_id,
      downloadStatus: match.download_status ?? 'none',
      downloadTaskId: match.download_task_id ?? undefined,
    });
  };

  const fetchTaskDetails = useCallback(
    async (taskId: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (!silent) {
        setTaskDetailsLoading(true);
      }
      setTaskDetailsError(null);

      try {
        const result = await matchDatabaseService.getDownloadTaskDetails(taskId);
        if (result.status === 'ok') {
          setTaskDetails(result.task);
          return;
        }

        setTaskDetails(result.task);
        setTaskDetailsError(result.message || '任务详情加载失败。');
      } catch (taskError) {
        console.error('Failed to fetch replay task details:', taskError);
        setTaskDetailsError('任务详情加载失败，请重试。');
      } finally {
        if (!silent) {
          setTaskDetailsLoading(false);
        }
      }
    },
    []
  );

  const handleOpenTaskDetails = async (taskId: string, options?: { autoOpened?: boolean }) => {
    setTaskDetailsAutoOpened(options?.autoOpened ?? false);
    setTaskDetailsTaskId(taskId);
    setTaskDetails(null);
    await fetchTaskDetails(taskId);
  };

  const handleCloseTaskDetails = () => {
    setTaskDetailsAutoOpened(false);
    setTaskDetailsTaskId(null);
    setTaskDetails(null);
    setTaskDetailsError(null);
    setTaskDetailsLoading(false);
  };

  const handleRefreshTaskDetails = async () => {
    if (!taskDetailsTaskId) {
      return;
    }

    await fetchTaskDetails(taskDetailsTaskId);
  };

  useEffect(() => {
    if (!taskDetailsTaskId || !isTaskStatusPolling(taskDetails?.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchTaskDetails(taskDetailsTaskId, { silent: true });
    }, TASK_DETAILS_POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [fetchTaskDetails, taskDetails?.status, taskDetailsTaskId]);

  return (
    <div className="workspace-page relative bg-dota-bg">
      <div className="workspace-stack">
        <div className="workspace-header">
          <div className="workspace-header-row">
            <div>
              <p className="workspace-eyebrow">Match Database</p>
              <h1 className="workspace-title">比赛数据库</h1>
              <p className="workspace-description">
                先筛出目标比赛，再决定下载、查看任务或直接进入回放。默认仅展示职业联赛。
              </p>
            </div>
            <div className="workspace-kpi-grid xl:min-w-[420px]">
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">当前页</p>
                <p className="workspace-kpi-value">{actionableMatches.length}</p>
                <p className="workspace-kpi-hint">可操作比赛</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">已勾选</p>
                <p className="workspace-kpi-value">{selectedMatchCount}</p>
                <p className="workspace-kpi-hint">等待批量处理</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">可回放</p>
                <p className="workspace-kpi-value">{readyReplayCount}</p>
                <p className="workspace-kpi-hint">当前页已下载完成</p>
              </div>
            </div>
          </div>

          <div className="workspace-pill-row">
            <span className="workspace-pill">
              激活筛选 {activeFilterCount}
            </span>
            <span className="workspace-pill">
              总记录 {total}
            </span>
            <span className="workspace-pill">
              当前偏移 {offset}
            </span>
            {filters.professionalOnly && (
              <span className="rounded-sm border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200">
                仅职业联赛
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.95fr)]">
          <div className="workspace-panel">
            <div className="workspace-panel-header">
              <h2 className="workspace-panel-title">查找比赛</h2>
              <p className="workspace-panel-description">
                适合先用战队、联赛和时间范围缩小集合，再做下载或进入回放。
              </p>
            </div>

            <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">战队 ID</label>
                <input
                  aria-label="战队 ID"
                  value={filters.teamId}
                  onChange={(event) => setFilters((prev) => ({ ...prev, teamId: event.target.value }))}
                  placeholder="例如 15"
                  className="workspace-input focus:border-dota-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">联赛 ID</label>
                <input
                  aria-label="联赛 ID"
                  value={filters.leagueId}
                  onChange={(event) => setFilters((prev) => ({ ...prev, leagueId: event.target.value }))}
                  placeholder="例如 15475"
                  className="workspace-input focus:border-dota-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">开始时间（起）</label>
                <input
                  aria-label="开始时间（起）"
                  type="datetime-local"
                  value={filters.startTimeFrom}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, startTimeFrom: event.target.value }))
                  }
                  className="workspace-input focus:border-dota-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">开始时间（止）</label>
                <input
                  aria-label="开始时间（止）"
                  type="datetime-local"
                  value={filters.startTimeTo}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, startTimeTo: event.target.value }))
                  }
                  className="workspace-input focus:border-dota-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">是否已有下载任务</label>
                <select
                  aria-label="是否已有下载任务"
                  value={filters.hasDownload}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      hasDownload: event.target.value as HasDownloadFilter,
                    }))
                  }
                  className="workspace-select focus:border-dota-primary"
                >
                  <option value="all">全部</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-gray-400">仅职业联赛</label>
                <label className="workspace-checkpanel h-[46px] w-full cursor-pointer text-white">
                  <input
                    aria-label="仅职业联赛"
                    type="checkbox"
                    checked={filters.professionalOnly}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        professionalOnly: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-dota-primary"
                  />
                  <span className="text-sm text-gray-200">仅显示职业联赛</span>
                </label>
              </div>
              <div className="workspace-action-row xl:col-span-6">
                <button
                  type="submit"
                  className="workspace-action-button min-w-[112px] bg-dota-primary text-white transition-colors hover:bg-blue-600"
                >
                  查询
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeBatchMode || batchActionInFlightRef.current) {
                      setFeedback({
                        type: 'error',
                        message: '批量任务进行中。当前页将在完成后自动刷新。',
                      });
                      return;
                    }
                    void fetchMatches();
                  }}
                  className="workspace-action-button min-w-[136px] bg-cyan-700 text-white transition-colors hover:bg-cyan-600"
                >
                  刷新当前页
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="workspace-action-button min-w-[112px] bg-gray-600 text-white transition-colors hover:bg-gray-500"
                >
                  清空
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <div className="workspace-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">批量处理</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    先勾选比赛，再执行批量下载。回放入口只会对已准备好的录像开放。
                  </p>
                </div>
                <span className="rounded-sm border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
                  已勾选 {selectedMatchCount}
                </span>
              </div>

              <div className="mt-4 workspace-action-row">
                <button
                  type="button"
                  onClick={() => {
                    void handleBatchAction();
                  }}
                  disabled={batchActionsDisabled || activeBatchMode !== null}
                  className="workspace-action-button min-w-[160px] bg-emerald-700 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {activeBatchMode === 'prepare_and_execute' ? '正在批量下载（勾选项）...' : '批量下载（勾选项）'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMatchIds([])}
                  disabled={selectedMatchCount === 0}
                  className="workspace-action-button min-w-[120px] border border-slate-600 text-white transition-colors hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  清空勾选
                </button>
                <span className="self-center text-sm text-gray-300">
                  {selectedMatchCount === 0
                    ? '请先勾选要批量下载的比赛。'
                    : selectedCurrentPageCount === selectedMatchCount
                      ? `本次将处理 ${selectedMatchCount} 场比赛。`
                      : `本次将处理 ${selectedMatchCount} 场比赛，其中当前页 ${selectedCurrentPageCount} 场。`}
                </span>
              </div>
            </div>

            <div className="workspace-panel">
              <h2 className="text-lg font-semibold text-gray-100">筛选预设</h2>
              <p className="mt-1 text-sm text-gray-400">把常用查询条件保存下来，避免重复输入。</p>
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_auto]">
                <input
                  aria-label="预设名称"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="预设名称"
                  className="workspace-input focus:border-dota-primary"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="rounded bg-indigo-700 px-4 py-2 text-white transition-colors hover:bg-indigo-600"
                >
                  保存预设
                </button>
                <select
                  aria-label="预设"
                  value={selectedPresetName}
                  onChange={(event) => setSelectedPresetName(event.target.value)}
                  className="workspace-select focus:border-dota-primary"
                >
                  <option value="">选择预设</option>
                  {filterPresets.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  disabled={!selectedPresetName}
                  className="rounded bg-sky-700 px-4 py-2 text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  应用
                </button>
              </div>
            </div>

            <div className="workspace-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">失败项处理</h2>
                  <p className="mt-1 text-sm text-gray-400">批量下载失败后，可直接复制或导出失败明细。</p>
                </div>
                <span className="rounded-sm border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
                  {lastBatchFailures.length} 条
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyFailedItems();
                  }}
                  disabled={lastBatchFailures.length === 0}
                  className="rounded bg-orange-700 px-4 py-2 text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  复制失败项
                </button>
                <button
                  type="button"
                  onClick={handleExportFailedItems}
                  disabled={lastBatchFailures.length === 0}
                  className="rounded bg-orange-800 px-4 py-2 text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  导出失败项（.txt）
                </button>
              </div>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`mb-4 px-4 py-3 rounded border ${feedback.type === 'success'
              ? 'bg-green-900/30 border-green-600 text-green-200'
              : 'bg-red-900/30 border-red-600 text-red-200'
              }`}
          >
            {feedback.message}
          </div>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 rounded border bg-red-900/30 border-red-600 text-red-200">{error}</div>
        )}

        <div className="workspace-table-shell">
          <div className="overflow-x-auto">
            <table className="w-full text-left table-auto">
              <thead className="bg-gradient-to-r from-gray-900 to-gray-800 text-gray-300 text-sm uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    <input
                      aria-label="全选当前页"
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      ref={(element) => {
                        if (!element) {
                          return;
                        }
                        element.indeterminate = isSomeCurrentPageSelected;
                      }}
                      onChange={handleToggleSelectAllCurrentPage}
                      disabled={allCurrentPageMatchIds.length === 0 || activeBatchMode !== null}
                      className="h-4 w-4 accent-dota-primary disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">比赛 ID</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">开始时间</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">时长</th>
                  <th className="px-4 py-3 font-semibold">天辉</th>
                  <th className="px-4 py-3 font-semibold">夜魇</th>
                  <th className="px-4 py-3 font-semibold">联赛</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">下载状态</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">尝试次数</th>
                  <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                      加载中...
                    </td>
                  </tr>
                ) : matches.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                      未找到记录。
                    </td>
                  </tr>
                ) : (
                  matches.map((match) => {
                    const normalizedDownloadStatus = normalizeDownloadStatus(match.download_status);
                    const canDownloadReplay =
                      normalizedDownloadStatus === 'unknown' || normalizedDownloadStatus === 'failed';

                    return (
                      <tr
                        key={match.match_id}
                        className={`transition-colors ${highlightedMatchId === match.match_id
                          ? 'bg-emerald-900/30 ring-1 ring-emerald-500/40'
                          : 'hover:bg-white/5'
                          }`}
                      >
                      <td className="px-4 py-3">
                        <input
                          aria-label={`选择比赛 ${match.match_id}`}
                          type="checkbox"
                          checked={selectedMatchIds.includes(match.match_id)}
                          onChange={() => handleToggleMatchSelection(match.match_id)}
                          disabled={activeBatchMode !== null}
                          className="h-4 w-4 accent-dota-primary disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{match.match_id}</td>
                      <td
                        className="px-4 py-3 text-gray-300 whitespace-nowrap"
                        title={match.start_time !== undefined && match.start_time !== null ? String(match.start_time) : '--'}
                      >
                        {formatUnixTimestampLocal(match.start_time)}
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDurationClock(match.duration)}</td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {getTeamLabel(match.radiant_team_name, match.radiant_team_id)}
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {getTeamLabel(match.dire_team_name, match.dire_team_id)}
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {getLeagueLabel(match.league_name, match.leagueid)}
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        <span
                          data-testid={`download-status-${match.match_id}`}
                          className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-xs font-semibold tracking-wide ${getDownloadStatusMeta(match.download_status).className
                            }`}
                          title={normalizeDownloadStatus(match.download_status)}
                        >
                          {getDownloadStatusMeta(match.download_status).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{match.download_attempt_count ?? 0}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenReplay(match)}
                            disabled={activeBatchMode !== null || !isReplayReady(match.download_status)}
                            title={getReplayAvailabilityHint(match.download_status)}
                            className="rounded border border-amber-700/50 px-3 py-1.5 text-sm text-amber-300 hover:border-amber-500/50 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            打开回放
                          </button>
                          <button
                            onClick={() => {
                              if (activeBatchMode !== null) {
                                return;
                              }
                              if (!match.download_task_id) {
                                return;
                              }
                              void handleOpenTaskDetails(match.download_task_id);
                            }}
                            disabled={!match.download_task_id || activeBatchMode !== null}
                            className="text-cyan-300 hover:text-cyan-200 border border-cyan-700/50 hover:border-cyan-500/50 rounded px-3 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            任务详情
                          </button>
                          <button
                            onClick={() => handleAction(match.match_id)}
                            disabled={
                              !canDownloadReplay ||
                              activeActionMatchId === match.match_id ||
                              activeBatchMode !== null ||
                              batchActionInFlightRef.current
                            }
                            title={canDownloadReplay ? '触发下载任务' : '当前状态下无需重复触发下载'}
                            className="rounded border border-green-700/50 px-3 py-1.5 text-sm text-green-300 hover:border-green-500/50 hover:text-green-200 disabled:opacity-50"
                          >
                            {normalizedDownloadStatus === 'completed'
                              ? '已下载'
                              : normalizedDownloadStatus === 'downloading' || normalizedDownloadStatus === 'prepared'
                                ? '下载进行中'
                                : '下载录像'}
                          </button>
                          <button
                            onClick={() => {
                              void handleDeleteReplay(match.match_id);
                            }}
                            disabled={
                              activeActionMatchId === match.match_id ||
                              activeBatchMode !== null ||
                              batchActionInFlightRef.current ||
                              normalizeDownloadStatus(match.download_status) !== 'completed'
                            }
                            className="text-red-300 hover:text-red-200 border border-red-700/50 hover:border-red-500/50 rounded px-3 py-1.5 text-sm disabled:opacity-50"
                          >
                            删除录像
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

          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex items-center justify-between border-t border-gray-700">
            <div className="text-sm text-gray-400">
              偏移：<span data-testid="pagination-offset" className="text-white">{offset}</span> | 总数：{' '}
              <span className="text-white">{total}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset((prev) => Math.max(0, prev - DEFAULT_LIMIT))}
                disabled={offset === 0}
                className="px-4 py-2 rounded bg-gray-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm font-medium border border-gray-600"
              >
                上一页
              </button>
              <button
                onClick={() => setOffset((prev) => prev + DEFAULT_LIMIT)}
                disabled={offset + matches.length >= total}
                className="px-4 py-2 rounded bg-gray-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm font-medium border border-gray-600"
              >
                下一页
              </button>
            </div>
          </div>
        </div>

        {taskDetailsTaskId && (
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-gray-900/95 border-l border-gray-700 shadow-2xl z-40">
            <div className="h-full flex flex-col">
              <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">任务详情</h2>
                  <p className="text-xs text-gray-400 mt-1 font-mono">{taskDetailsTaskId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      void handleRefreshTaskDetails();
                    }}
                    disabled={taskDetailsLoading}
                    className="text-blue-300 hover:text-blue-200 border border-blue-700/50 hover:border-blue-500/50 rounded px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    刷新
                  </button>
                  <button
                    onClick={handleCloseTaskDetails}
                    className="text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded px-3 py-1.5 text-sm"
                  >
                    关闭
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {taskDetailsLoading && <div className="text-sm text-gray-400">任务详情加载中...</div>}

                {taskDetailsError && (
                  <div className="px-3 py-2 rounded border bg-red-900/30 border-red-600 text-red-200 text-sm">
                    {taskDetailsError}
                  </div>
                )}

                {taskDetails && (
                  <div className="space-y-2 text-sm">
                    {taskDetailsAutoOpened && (
                      <div className="px-3 py-2 rounded border bg-blue-900/20 border-blue-500/40 text-blue-200 text-xs">
                        已从批量结果自动打开。
                      </div>
                    )}
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">任务 ID</div>
                      <div className="text-white font-mono break-all">{taskDetails.task_id}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">任务状态</div>
                      <div className="text-white">
                        {getDownloadStatusMeta(taskDetails.status).label}
                      </div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">尝试次数</div>
                      <div className="text-white">{taskDetails.attempt_count ?? 0}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">错误代码</div>
                      <div className="text-white">{taskDetails.error_code ?? '--'}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">错误信息</div>
                      <div className="text-white break-words">{taskDetails.error_message ?? '--'}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">下载文件路径</div>
                      <div className="text-white break-all">{taskDetails.download_path ?? '--'}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">最近更新时间</div>
                      <div className="text-white" title={taskDetails.updated_at ? String(taskDetails.updated_at) : '--'}>
                        {taskDetails.updated_at ? formatUnixTimestampLocal(taskDetails.updated_at) : '--'}
                      </div>
                    </div>

                    <div className="pt-2 text-xs text-gray-500">
                      自动刷新：{isTaskStatusPolling(taskDetails.status) ? '每 4 秒（进行中）' : '已停止'}
                    </div>
                    {!isTaskStatusPolling(taskDetails.status) && (
                      <div className="px-3 py-2 rounded border bg-emerald-900/20 border-emerald-600/40 text-emerald-200 text-xs">
                        终态：自动刷新已停止。
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MatchDatabasePage;
