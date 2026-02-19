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

  const batchActionsDisabled = loading || activeActionMatchId !== null || actionableMatches.length === 0;

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

  const handleAction = async (matchId: number, mode: MatchDatabaseActionMode) => {
    if (activeBatchMode || batchActionInFlightRef.current) {
      return;
    }

    setActiveActionMatchId(matchId);
    setFeedback(null);

    try {
      const result = await matchDatabaseService.triggerDownloadAction(matchId, mode);

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

  const handleBatchAction = async (mode: MatchDatabaseActionMode) => {
    if (activeBatchMode || batchActionsDisabled || batchActionInFlightRef.current) {
      return;
    }

    batchActionInFlightRef.current = true;
    setActiveBatchMode(mode);
    setFeedback(null);

    const failures: BatchFailureItem[] = [];
    let successCount = 0;
    let withTaskIdCount = 0;
    let lastTaskIdFromBatch: string | null = null;

    for (const match of actionableMatches) {
      try {
        const result = await matchDatabaseService.triggerDownloadAction(match.match_id, mode);
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
          matchId: match.match_id,
          message: result.message || '请求失败。',
        });
      } catch (batchError) {
        console.error('Failed to trigger batch match database action:', batchError);
        failures.push({
          matchId: match.match_id,
          message: '请求失败。',
        });
      }
    }

    const totalCount = actionableMatches.length;
    const failedCount = failures.length;
    const summaryPrefix =
      mode === 'prepare'
        ? '批量准备完成。'
        : '批量准备并执行完成。';
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
      if (lastTaskIdFromBatch) {
        await handleOpenTaskDetails(lastTaskIdFromBatch, { autoOpened: true });
      }
    } finally {
      setActiveBatchMode(null);
      batchActionInFlightRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const handleOpenReplay = (match: MatchDatabaseRecord) => {
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
    <div className="p-6 text-white min-h-screen bg-dota-bg relative">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-dota-gold">比赛数据库</h1>
          <p className="text-gray-400 mt-1">
            默认仅显示职业联赛。可关闭“仅职业联赛”查看全部比赛（含路人局）。
          </p>
        </div>

        <div className="bg-dota-surface p-6 rounded-lg mb-6 shadow-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">筛选条件</h2>
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 items-end">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">战队 ID</label>
              <input
                aria-label="战队 ID"
                value={filters.teamId}
                onChange={(event) => setFilters((prev) => ({ ...prev, teamId: event.target.value }))}
                placeholder="例如 15"
                className="w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-dota-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">联赛 ID</label>
              <input
                aria-label="联赛 ID"
                value={filters.leagueId}
                onChange={(event) => setFilters((prev) => ({ ...prev, leagueId: event.target.value }))}
                placeholder="例如 15475"
                className="w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-dota-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">开始时间（起）</label>
              <input
                aria-label="开始时间（起）"
                type="datetime-local"
                value={filters.startTimeFrom}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, startTimeFrom: event.target.value }))
                }
                className="w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-dota-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">开始时间（止）</label>
              <input
                aria-label="开始时间（止）"
                type="datetime-local"
                value={filters.startTimeTo}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, startTimeTo: event.target.value }))
                }
                className="w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-dota-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">是否已有下载任务</label>
              <select
                aria-label="是否已有下载任务"
                value={filters.hasDownload}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    hasDownload: event.target.value as HasDownloadFilter,
                  }))
                }
                className="w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-dota-primary"
              >
                <option value="all">全部</option>
                <option value="true">是</option>
                <option value="false">否</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">仅职业联赛</label>
              <label className="h-[42px] w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white flex items-center gap-2 cursor-pointer">
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
            <div className="flex gap-2 xl:col-span-6">
              <button
                type="submit"
                className="bg-dota-primary hover:bg-blue-600 text-white px-5 py-2 rounded transition-colors font-medium"
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
                className="bg-cyan-700 hover:bg-cyan-600 text-white px-5 py-2 rounded transition-colors"
              >
                刷新当前页
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="bg-gray-600 hover:bg-gray-500 text-white px-5 py-2 rounded transition-colors"
              >
                清空
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleBatchAction('prepare');
                }}
                disabled={batchActionsDisabled || activeBatchMode !== null}
                className="bg-blue-700 hover:bg-blue-600 text-white px-5 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {activeBatchMode === 'prepare'
                  ? '正在批量准备（当前页）...'
                  : '批量准备（当前页）'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleBatchAction('prepare_and_execute');
                }}
                disabled={batchActionsDisabled || activeBatchMode !== null}
                className="bg-emerald-700 hover:bg-emerald-600 text-white px-5 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {activeBatchMode === 'prepare_and_execute'
                  ? '正在批量准备并执行（当前页）...'
                  : '批量准备并执行（当前页）'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_auto_1fr_auto] gap-2 xl:col-span-6">
              <input
                aria-label="预设名称"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="预设名称"
                className="w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-dota-primary"
              />
              <button
                type="button"
                onClick={handleSavePreset}
                className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded transition-colors"
              >
                 保存预设
              </button>
              <select
                aria-label="预设"
                value={selectedPresetName}
                onChange={(event) => setSelectedPresetName(event.target.value)}
                className="w-full bg-dota-bg border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-dota-primary"
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
                className="bg-sky-700 hover:bg-sky-600 text-white px-4 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                应用
              </button>
            </div>
          </form>
        </div>

        {feedback && (
          <div
            className={`mb-4 px-4 py-3 rounded border ${
              feedback.type === 'success'
                ? 'bg-green-900/30 border-green-600 text-green-200'
                : 'bg-red-900/30 border-red-600 text-red-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="mb-4 bg-dota-surface border border-gray-700 rounded px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCopyFailedItems();
              }}
              disabled={lastBatchFailures.length === 0}
              className="bg-orange-700 hover:bg-orange-600 text-white px-4 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              复制失败项
            </button>
            <button
              type="button"
              onClick={handleExportFailedItems}
              disabled={lastBatchFailures.length === 0}
              className="bg-orange-800 hover:bg-orange-700 text-white px-4 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              导出失败项（.txt）
            </button>
            <span className="text-xs text-gray-400">
              失败项：<span className="text-gray-200">{lastBatchFailures.length}</span>
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded border bg-red-900/30 border-red-600 text-red-200">{error}</div>
        )}

        <div className="bg-dota-surface rounded-lg shadow-xl overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left">
              <thead className="bg-gradient-to-r from-gray-900 to-gray-800 text-gray-300 text-sm uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">比赛 ID</th>
                  <th className="px-4 py-3 font-semibold">开始时间</th>
                  <th className="px-4 py-3 font-semibold">时长</th>
                  <th className="px-4 py-3 font-semibold">Radiant</th>
                  <th className="px-4 py-3 font-semibold">Dire</th>
                  <th className="px-4 py-3 font-semibold">联赛</th>
                  <th className="px-4 py-3 font-semibold">下载状态</th>
                  <th className="px-4 py-3 font-semibold">尝试次数</th>
                  <th className="px-4 py-3 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      加载中...
                    </td>
                  </tr>
                ) : matches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      未找到记录。
                    </td>
                  </tr>
                ) : (
                  matches.map((match) => (
                    <tr
                      key={match.match_id}
                      className={`transition-colors ${
                        highlightedMatchId === match.match_id
                          ? 'bg-emerald-900/30 ring-1 ring-emerald-500/40'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-dota-gold font-semibold">{match.match_id}</td>
                      <td
                        className="px-4 py-3 text-gray-300"
                        title={match.start_time !== undefined && match.start_time !== null ? String(match.start_time) : '--'}
                      >
                        {formatUnixTimestampLocal(match.start_time)}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{formatDurationClock(match.duration)}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {getTeamLabel(match.radiant_team_name, match.radiant_team_id)}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {getTeamLabel(match.dire_team_name, match.dire_team_id)}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {getLeagueLabel(match.league_name, match.leagueid)}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        <span
                          data-testid={`download-status-${match.match_id}`}
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${
                            getDownloadStatusMeta(match.download_status).className
                          }`}
                          title={normalizeDownloadStatus(match.download_status)}
                        >
                          {getDownloadStatusMeta(match.download_status).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{match.download_attempt_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenReplay(match)}
                            disabled={activeBatchMode !== null}
                            className="text-amber-300 hover:text-amber-200 border border-amber-700/50 hover:border-amber-500/50 rounded px-3 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
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
                            onClick={() => handleAction(match.match_id, 'prepare')}
                            disabled={
                              activeActionMatchId === match.match_id ||
                              activeBatchMode !== null ||
                              batchActionInFlightRef.current
                            }
                            className="text-blue-300 hover:text-blue-200 border border-blue-700/50 hover:border-blue-500/50 rounded px-3 py-1.5 text-sm disabled:opacity-50"
                          >
                             准备下载
                          </button>
                          <button
                            onClick={() => handleAction(match.match_id, 'prepare_and_execute')}
                            disabled={
                              activeActionMatchId === match.match_id ||
                              activeBatchMode !== null ||
                              batchActionInFlightRef.current
                            }
                            className="text-green-300 hover:text-green-200 border border-green-700/50 hover:border-green-500/50 rounded px-3 py-1.5 text-sm disabled:opacity-50"
                          >
                             准备并执行
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
                      <div className="text-gray-400">task_id</div>
                      <div className="text-white font-mono break-all">{taskDetails.task_id}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">status</div>
                      <div className="text-white">{taskDetails.status ?? '--'}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">attempt_count</div>
                      <div className="text-white">{taskDetails.attempt_count ?? 0}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">error_code</div>
                      <div className="text-white">{taskDetails.error_code ?? '--'}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">error_message</div>
                      <div className="text-white break-words">{taskDetails.error_message ?? '--'}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">download_path</div>
                      <div className="text-white break-all">{taskDetails.download_path ?? '--'}</div>
                    </div>
                    <div className="bg-gray-800/70 border border-gray-700 rounded px-3 py-2">
                      <div className="text-gray-400">updated_at</div>
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
