import React, { useEffect, useMemo, useRef, useState } from 'react';
import { matchDatabaseService } from '../api/matchDatabaseService';
import { TeamProfileMatchRecord, teamProfileService } from '../api/teamProfileService';
import { formatDurationClock, formatUnixTimestampLocal } from './matchDatabaseFormatting';
import { TeamProfileReplayContext } from '../types/replayContext';

interface TeamProfilePageProps {
  onOpenReplay?: (context: TeamProfileReplayContext) => void;
  onOpenMatchDatabase?: (context: { teamId: number; leagueId?: number; hasDownload?: boolean }) => void;
  onBackHome?: () => void;
  initialViewState?: TeamProfileViewState;
  onViewStateChange?: (viewState: TeamProfileViewState) => void;
}

type SortOrder = 'desc' | 'asc';
type TeamProfilePresetKey = 'all_matches' | 'with_download_status' | 'latest_20';

interface TeamProfileQuickSnapshot {
  name: string;
  teamIdInput: string;
  limitInput: string;
  selectedLeagueFilterKey: string;
  sortOrder: SortOrder;
  onlyWithDownloadStatus: boolean;
  focusLatestLeague: boolean;
  savedAtMs: number;
}

interface TeamProfileSnapshotTransferItem {
  name: string;
  teamIdInput: string;
  limitInput: string;
  selectedLeagueFilterKey: string;
  sortOrder: SortOrder;
  onlyWithDownloadStatus: boolean;
  focusLatestLeague: boolean;
}

interface TeamProfileSnapshotTransferPayload {
  snapshots: TeamProfileSnapshotTransferItem[];
}

interface TeamProfileLegacyQuickSnapshot {
  teamIdInput: string;
  limitInput: string;
  selectedLeagueFilterKey: string;
  sortOrder: SortOrder;
  onlyWithDownloadStatus: boolean;
  focusLatestLeague: boolean;
  savedAtMs: number;
}

export interface TeamProfileViewState {
  teamIdInput: string;
  limitInput: string;
  currentTeamId: number | null;
  matches: TeamProfileMatchRecord[];
  onlyWithDownloadStatus: boolean;
  sortOrder: SortOrder;
  selectedLeagueFilterKey: string;
  focusLatestLeague: boolean;
  snapshotNameInput: string;
  selectedSnapshotName: string;
  quickSnapshots: TeamProfileQuickSnapshot[];
  selectedLeagueCompareKeys?: string[];
  appliedLeagueCompareFilterKeys?: string[];
  quickSnapshot?: TeamProfileLegacyQuickSnapshot | null;
}

interface LeagueGroup {
  key: string;
  label: string;
  leagueId?: number | null;
  matches: TeamProfileMatchRecord[];
}

interface LeagueQuickFilterOption {
  key: string;
  label: string;
}

interface LeagueCompareItem {
  key: string;
  label: string;
  matchCount: number;
  averageDurationSeconds: number | null;
  recentMatchStartTime: number | null;
}

type ActionHistoryType =
  | 'prepare_visible_matches'
  | 'prepare_selected_leagues'
  | 'open_compare_first_3_replays'
  | 'open_visible_in_match_database';

type ActionHistoryFilterKey = 'all' | ActionHistoryType;

type ActionHistoryPayload =
  | {
      type: 'prepare_visible_matches' | 'prepare_selected_leagues';
      matchIds: number[];
    }
  | {
      type: 'open_compare_first_3_replays';
      matchIds: number[];
      openedMatchId: number | null;
    }
  | {
      type: 'open_visible_in_match_database';
      context: {
        teamId: number;
        leagueId?: number;
        hasDownload?: boolean;
      };
      visibleCount: number;
    };

interface ActionHistoryEntry {
  id: string;
  type: ActionHistoryType;
  actionName: string;
  executedAtMs: number;
  summary: string;
  payload: ActionHistoryPayload;
  lastRunStatus: 'succeeded' | 'failed';
  lastRunAt: number;
  lastRunMessage: string;
}

interface ActionReplayResult {
  status: 'succeeded' | 'failed';
  message: string;
  total?: number;
  success?: number;
  failed?: number;
}

type GroupViewState = 'expanded' | 'collapsed';

const DEFAULT_LIMIT_INPUT = '20';
const DEFAULT_LEAGUE_FILTER = 'all';
const DEFAULT_SORT_ORDER: SortOrder = 'desc';
const ACTION_HISTORY_LIMIT = 10;
const DEFAULT_ACTION_HISTORY_FILTER: ActionHistoryFilterKey = 'all';
const ACTION_HISTORY_FILTER_OPTIONS: Array<{
  key: ActionHistoryFilterKey;
  label: string;
}> = [
  { key: 'all', label: '全部' },
  { key: 'prepare_visible_matches', label: '准备当前可见比赛' },
  { key: 'prepare_selected_leagues', label: '准备已选联赛' },
  { key: 'open_compare_first_3_replays', label: '打开对比首 3 场回放' },
  { key: 'open_visible_in_match_database', label: '在比赛数据库打开当前可见项' },
];

function toOptionalPositiveInt(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function getTeamTag(match: TeamProfileMatchRecord, teamId: number): 'Radiant' | 'Dire' | '-' {
  if (match.radiant_team_id === teamId) {
    return '天辉';
  }
  if (match.dire_team_id === teamId) {
    return '夜魇';
  }
  return '-';
}

function getLeagueGroupLabel(name?: string | null, leagueId?: number | null): string {
  if (name && name.trim()) {
    return name;
  }

  if (leagueId !== undefined && leagueId !== null) {
    return `联赛 ${leagueId}`;
  }

  return '未知联赛';
}

function getLeagueGroupKey(leagueId?: number | null): string {
  if (leagueId === undefined || leagueId === null) {
    return 'unknown';
  }

  return `league-${leagueId}`;
}

function parseLeagueIdFromFilterKey(filterKey: string): number | undefined {
  if (!filterKey.startsWith('league-')) {
    return undefined;
  }

  const parsed = Number.parseInt(filterKey.slice('league-'.length), 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

function hasDownloadStatusSignal(match: TeamProfileMatchRecord): boolean {
  if (typeof match.download_status === 'string' && match.download_status.trim().length > 0) {
    return true;
  }

  if (typeof match.download_task_id === 'string' && match.download_task_id.trim().length > 0) {
    return true;
  }

  if (typeof match.replay_url === 'string' && match.replay_url.trim().length > 0) {
    return true;
  }

  return false;
}

function isValidSortOrder(value: unknown): value is SortOrder {
  return value === 'asc' || value === 'desc';
}

function validateSnapshotTransferItem(value: unknown): TeamProfileSnapshotTransferItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<TeamProfileSnapshotTransferItem>;
  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    return null;
  }
  if (typeof candidate.teamIdInput !== 'string') {
    return null;
  }
  if (typeof candidate.limitInput !== 'string') {
    return null;
  }
  if (typeof candidate.selectedLeagueFilterKey !== 'string') {
    return null;
  }
  if (!isValidSortOrder(candidate.sortOrder)) {
    return null;
  }
  if (typeof candidate.onlyWithDownloadStatus !== 'boolean') {
    return null;
  }
  if (typeof candidate.focusLatestLeague !== 'boolean') {
    return null;
  }

  return {
    name: candidate.name.trim(),
    teamIdInput: candidate.teamIdInput,
    limitInput: candidate.limitInput,
    selectedLeagueFilterKey: candidate.selectedLeagueFilterKey,
    sortOrder: candidate.sortOrder,
    onlyWithDownloadStatus: candidate.onlyWithDownloadStatus,
    focusLatestLeague: candidate.focusLatestLeague,
  };
}

function parseSnapshotTransferPayload(raw: unknown): TeamProfileSnapshotTransferItem[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => validateSnapshotTransferItem(item))
      .filter((item): item is TeamProfileSnapshotTransferItem => item !== null);
  }

  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const payload = raw as Partial<TeamProfileSnapshotTransferPayload>;
  if (!Array.isArray(payload.snapshots)) {
    return [];
  }

  return payload.snapshots
    .map((item) => validateSnapshotTransferItem(item))
    .filter((item): item is TeamProfileSnapshotTransferItem => item !== null);
}

export function TeamProfilePage({
  onOpenReplay,
  onOpenMatchDatabase,
  onBackHome,
  initialViewState,
  onViewStateChange,
}: TeamProfilePageProps) {
  const initialQuickSnapshots = useMemo<TeamProfileQuickSnapshot[]>(() => {
    if (Array.isArray(initialViewState?.quickSnapshots)) {
      return initialViewState.quickSnapshots;
    }

    if (initialViewState?.quickSnapshot) {
      return [
        {
          name: 'Quick Snapshot',
          ...initialViewState.quickSnapshot,
        },
      ];
    }

    return [];
  }, [initialViewState]);
  const [teamIdInput, setTeamIdInput] = useState(initialViewState?.teamIdInput ?? '');
  const [limitInput, setLimitInput] = useState(initialViewState?.limitInput ?? DEFAULT_LIMIT_INPUT);
  const [currentTeamId, setCurrentTeamId] = useState<number | null>(initialViewState?.currentTeamId ?? null);
  const [matches, setMatches] = useState<TeamProfileMatchRecord[]>(initialViewState?.matches ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activePrepareMatchId, setActivePrepareMatchId] = useState<number | null>(null);
  const [onlyWithDownloadStatus, setOnlyWithDownloadStatus] = useState(
    initialViewState?.onlyWithDownloadStatus ?? false
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialViewState?.sortOrder ?? DEFAULT_SORT_ORDER);
  const [selectedLeagueFilterKey, setSelectedLeagueFilterKey] = useState(
    initialViewState?.selectedLeagueFilterKey ?? DEFAULT_LEAGUE_FILTER
  );
  const [focusLatestLeague, setFocusLatestLeague] = useState(
    initialViewState?.focusLatestLeague ?? false
  );
  const [snapshotNameInput, setSnapshotNameInput] = useState(
    initialViewState?.snapshotNameInput ?? ''
  );
  const [quickSnapshots, setQuickSnapshots] = useState<TeamProfileQuickSnapshot[]>(initialQuickSnapshots);
  const [selectedSnapshotName, setSelectedSnapshotName] = useState(
    initialViewState?.selectedSnapshotName ?? initialQuickSnapshots[0]?.name ?? ''
  );
  const [selectedLeagueCompareKeys, setSelectedLeagueCompareKeys] = useState<string[]>(
    Array.isArray(initialViewState?.selectedLeagueCompareKeys)
      ? initialViewState.selectedLeagueCompareKeys
      : []
  );
  const [appliedLeagueCompareFilterKeys, setAppliedLeagueCompareFilterKeys] = useState<string[]>(
    Array.isArray(initialViewState?.appliedLeagueCompareFilterKeys)
      ? initialViewState.appliedLeagueCompareFilterKeys
      : []
  );
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Record<string, boolean>>({});
  const [activePrepareAndOpenMatchId, setActivePrepareAndOpenMatchId] = useState<number | null>(null);
  const [isPreparingVisibleMatches, setIsPreparingVisibleMatches] = useState(false);
  const [isPreparingAndOpeningVisibleReplay, setIsPreparingAndOpeningVisibleReplay] = useState(false);
  const [isPreparingSelectedLeagues, setIsPreparingSelectedLeagues] = useState(false);
  const [isOpeningCompareFirstReplays, setIsOpeningCompareFirstReplays] = useState(false);
  const [visiblePrepareSummary, setVisiblePrepareSummary] = useState<{
    action: 'prepare_visible' | 'prepare_open_first_visible' | 'prepare_selected_leagues';
    total: number;
    success: number;
    failed: number;
    openedMatchId?: number;
  } | null>(null);
  const replayOpenTimeoutRef = useRef<number | null>(null);
  const snapshotImportInputRef = useRef<HTMLInputElement | null>(null);
  const compareFirstThreeRunningRef = useRef(false);
  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([]);
  const [activeReplayHistoryId, setActiveReplayHistoryId] = useState<string | null>(null);
  const [isReplayingVisibleHistory, setIsReplayingVisibleHistory] = useState(false);
  const [historyFilterKey, setHistoryFilterKey] = useState<ActionHistoryFilterKey>(
    DEFAULT_ACTION_HISTORY_FILTER
  );

  useEffect(() => {
    return () => {
      if (replayOpenTimeoutRef.current !== null) {
        window.clearTimeout(replayOpenTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (quickSnapshots.length === 0) {
      if (selectedSnapshotName !== '') {
        setSelectedSnapshotName('');
      }
      return;
    }

    if (!quickSnapshots.some((snapshot) => snapshot.name === selectedSnapshotName)) {
      setSelectedSnapshotName(quickSnapshots[0].name);
    }
  }, [quickSnapshots, selectedSnapshotName]);

  useEffect(() => {
    if (!onViewStateChange) {
      return;
    }

    onViewStateChange({
      teamIdInput,
      limitInput,
      currentTeamId,
      matches,
      onlyWithDownloadStatus,
      sortOrder,
      selectedLeagueFilterKey,
      focusLatestLeague,
      snapshotNameInput,
      selectedSnapshotName,
      quickSnapshots,
      selectedLeagueCompareKeys,
      appliedLeagueCompareFilterKeys,
    });
  }, [
    appliedLeagueCompareFilterKeys,
    currentTeamId,
    focusLatestLeague,
    limitInput,
    matches,
    onViewStateChange,
    onlyWithDownloadStatus,
    quickSnapshots,
    selectedLeagueCompareKeys,
    selectedSnapshotName,
    selectedLeagueFilterKey,
    snapshotNameInput,
    sortOrder,
    teamIdInput,
  ]);

  const selectedSnapshot = useMemo(
    () => quickSnapshots.find((snapshot) => snapshot.name === selectedSnapshotName) ?? null,
    [quickSnapshots, selectedSnapshotName]
  );

  const fetchMatchesByTeamId = async (teamId: number, limitValue: number) => {
    const result = await teamProfileService.getTeamMatches({
      team_id: teamId,
      limit: limitValue,
      offset: 0,
    });
    setCurrentTeamId(teamId);
    setMatches(result.matches ?? []);
  };

  const appendActionHistory = (entry: Omit<ActionHistoryEntry, 'id' | 'executedAtMs' | 'lastRunAt'>) => {
    const now = Date.now();
    const nextEntry: ActionHistoryEntry = {
      ...entry,
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      executedAtMs: now,
      lastRunAt: now,
    };

    setActionHistory((current) => [nextEntry, ...current].slice(0, ACTION_HISTORY_LIMIT));
  };

  const updateActionHistoryRunResult = (
    entryId: string,
    result: ActionReplayResult,
    options?: { bumpExecutedAt?: boolean }
  ) => {
    const now = Date.now();
    setActionHistory((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              lastRunStatus: result.status,
              lastRunAt: now,
              lastRunMessage: result.message,
              ...(options?.bumpExecutedAt ? { executedAtMs: now } : {}),
            }
          : entry
      )
    );
  };

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setVisiblePrepareSummary(null);
    setError(null);

    const parsedTeamId = toOptionalPositiveInt(teamIdInput);
    const parsedLimit = toOptionalPositiveInt(limitInput) ?? 20;

    if (!parsedTeamId) {
      setError('战队 ID 必须是正整数。');
      setMatches([]);
      setCurrentTeamId(null);
      return;
    }

    setLoading(true);
    try {
      await fetchMatchesByTeamId(parsedTeamId, parsedLimit);
    } catch (fetchError) {
      console.error('Failed to fetch team profile matches:', fetchError);
      setMatches([]);
      setCurrentTeamId(parsedTeamId);
      setError('加载战队比赛失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const handlePrepareDownload = async (matchId: number) => {
    setFeedback(null);
    setVisiblePrepareSummary(null);
    setActivePrepareMatchId(matchId);
    try {
      const result = await matchDatabaseService.triggerDownloadAction(matchId, 'prepare');
      setFeedback(`比赛 ${matchId}：${result.message}`);
    } catch (actionError) {
      console.error('Failed to prepare download from team profile:', actionError);
      setFeedback(`比赛 ${matchId}：请求失败。`);
    } finally {
      setActivePrepareMatchId(null);
    }
  };

  const openReplayWithLightweightFeedback = (matchId: number) => {
    if (replayOpenTimeoutRef.current !== null) {
      window.clearTimeout(replayOpenTimeoutRef.current);
    }

    replayOpenTimeoutRef.current = window.setTimeout(() => {
      onOpenReplay?.({
        source: 'team_profile',
        matchId,
      });
      replayOpenTimeoutRef.current = null;
    }, 120);
  };

  const handlePrepareAndOpenReplay = async (matchId: number) => {
    setVisiblePrepareSummary(null);
    setActivePrepareAndOpenMatchId(matchId);
    try {
      await matchDatabaseService.triggerDownloadAction(matchId, 'prepare');
      setFeedback(`比赛 ${matchId}：准备完成，正在打开回放...`);
    } catch (actionError) {
      console.error('Failed to prepare before opening replay from team profile:', actionError);
      setFeedback(`比赛 ${matchId}：准备失败，仍将打开回放...`);
    } finally {
      setActivePrepareAndOpenMatchId(null);
      openReplayWithLightweightFeedback(matchId);
    }
  };

  const sortedMatches = useMemo(() => {
    const safeMatches = [...matches];
    safeMatches.sort((left, right) => {
      const leftStart = left.start_time ?? 0;
      const rightStart = right.start_time ?? 0;

      if (sortOrder === 'asc') {
        return leftStart - rightStart;
      }

      return rightStart - leftStart;
    });
    return safeMatches;
  }, [matches, sortOrder]);

  const hasAnyDownloadMetadata = useMemo(
    () => sortedMatches.some((match) => hasDownloadStatusSignal(match)),
    [sortedMatches]
  );

  const leagueQuickFilterOptions = useMemo(() => {
    const optionsByKey = new Map<string, LeagueQuickFilterOption>();

    for (const match of sortedMatches) {
      const key = getLeagueGroupKey(match.leagueid);
      if (!optionsByKey.has(key)) {
        optionsByKey.set(key, {
          key,
          label: getLeagueGroupLabel(match.league_name, match.leagueid),
        });
      }
    }

    return Array.from(optionsByKey.values());
  }, [sortedMatches]);

  useEffect(() => {
    if (selectedLeagueFilterKey === 'all') {
      return;
    }

    const hasSelectedLeague = leagueQuickFilterOptions.some(
      (option) => option.key === selectedLeagueFilterKey
    );

    if (!hasSelectedLeague) {
      setSelectedLeagueFilterKey('all');
    }
  }, [leagueQuickFilterOptions, selectedLeagueFilterKey]);

  const downloadFilteredMatches = useMemo(() => {
    if (!onlyWithDownloadStatus || !hasAnyDownloadMetadata) {
      return sortedMatches;
    }

    return sortedMatches.filter((match) => hasDownloadStatusSignal(match));
  }, [hasAnyDownloadMetadata, onlyWithDownloadStatus, sortedMatches]);

  const focusedLatestLeagueFilterKey = useMemo(() => {
    if (!focusLatestLeague || downloadFilteredMatches.length === 0) {
      return null;
    }

    let latestMatch = downloadFilteredMatches[0];
    let latestStartTime = latestMatch.start_time ?? Number.MIN_SAFE_INTEGER;

    for (const match of downloadFilteredMatches) {
      const startTime = match.start_time ?? Number.MIN_SAFE_INTEGER;
      if (startTime > latestStartTime) {
        latestStartTime = startTime;
        latestMatch = match;
      }
    }

    return getLeagueGroupKey(latestMatch.leagueid);
  }, [downloadFilteredMatches, focusLatestLeague]);

  const effectiveLeagueFilterKey = focusLatestLeague
    ? focusedLatestLeagueFilterKey ?? DEFAULT_LEAGUE_FILTER
    : selectedLeagueFilterKey;

  const filteredMatches = useMemo(() => {
    if (appliedLeagueCompareFilterKeys.length > 0) {
      const selectedKeys = new Set(appliedLeagueCompareFilterKeys);
      return downloadFilteredMatches.filter((match) => selectedKeys.has(getLeagueGroupKey(match.leagueid)));
    }

    if (effectiveLeagueFilterKey === 'all') {
      return downloadFilteredMatches;
    }

    return downloadFilteredMatches.filter(
      (match) => getLeagueGroupKey(match.leagueid) === effectiveLeagueFilterKey
    );
  }, [appliedLeagueCompareFilterKeys, downloadFilteredMatches, effectiveLeagueFilterKey]);

  const groupedMatches = useMemo(() => {
    const groupsByKey = new Map<string, LeagueGroup>();

    for (const match of filteredMatches) {
      const key = getLeagueGroupKey(match.leagueid);

      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, {
          key,
          label: getLeagueGroupLabel(match.league_name, match.leagueid),
          leagueId: match.leagueid,
          matches: [],
        });
      }

      groupsByKey.get(key)?.matches.push(match);
    }

    return Array.from(groupsByKey.values());
  }, [filteredMatches]);

  const leagueCompareItems = useMemo<LeagueCompareItem[]>(() => {
    const compareMap = new Map<
      string,
      {
        key: string;
        label: string;
        matchCount: number;
        totalDurationSeconds: number;
        durationSamples: number;
        recentMatchStartTime: number | null;
      }
    >();

    for (const match of downloadFilteredMatches) {
      const key = getLeagueGroupKey(match.leagueid);
      const existing = compareMap.get(key);

      if (!existing) {
        compareMap.set(key, {
          key,
          label: getLeagueGroupLabel(match.league_name, match.leagueid),
          matchCount: 1,
          totalDurationSeconds:
            typeof match.duration === 'number' && match.duration >= 0 ? match.duration : 0,
          durationSamples: typeof match.duration === 'number' && match.duration >= 0 ? 1 : 0,
          recentMatchStartTime: typeof match.start_time === 'number' ? match.start_time : null,
        });
        continue;
      }

      existing.matchCount += 1;
      if (typeof match.duration === 'number' && match.duration >= 0) {
        existing.totalDurationSeconds += match.duration;
        existing.durationSamples += 1;
      }
      if (typeof match.start_time === 'number') {
        if (existing.recentMatchStartTime === null || match.start_time > existing.recentMatchStartTime) {
          existing.recentMatchStartTime = match.start_time;
        }
      }
    }

    return Array.from(compareMap.values())
      .sort((left, right) => {
        if (left.matchCount !== right.matchCount) {
          return right.matchCount - left.matchCount;
        }
        const leftRecent = left.recentMatchStartTime ?? Number.MIN_SAFE_INTEGER;
        const rightRecent = right.recentMatchStartTime ?? Number.MIN_SAFE_INTEGER;
        if (leftRecent !== rightRecent) {
          return rightRecent - leftRecent;
        }
        return left.label.localeCompare(right.label);
      })
      .slice(0, 5)
      .map((item) => ({
        key: item.key,
        label: item.label,
        matchCount: item.matchCount,
        averageDurationSeconds:
          item.durationSamples > 0 ? Math.round(item.totalDurationSeconds / item.durationSamples) : null,
        recentMatchStartTime: item.recentMatchStartTime,
      }));
  }, [downloadFilteredMatches]);

  useEffect(() => {
    const availableLeagueKeys = new Set(leagueCompareItems.map((item) => item.key));
    setSelectedLeagueCompareKeys((current) =>
      current.filter((leagueKey) => availableLeagueKeys.has(leagueKey))
    );
    setAppliedLeagueCompareFilterKeys((current) =>
      current.filter((leagueKey) => availableLeagueKeys.has(leagueKey))
    );
  }, [leagueCompareItems]);

  const tournamentSummary = useMemo(() => {
    const totalMatches = filteredMatches.length;
    const leagueIds = new Set<number>();
    let recentMatchStartTime: number | null = null;

    for (const match of filteredMatches) {
      if (typeof match.leagueid === 'number') {
        leagueIds.add(match.leagueid);
      }

      if (typeof match.start_time === 'number') {
        if (recentMatchStartTime === null || match.start_time > recentMatchStartTime) {
          recentMatchStartTime = match.start_time;
        }
      }
    }

    return {
      totalMatches,
      tournamentsCount: leagueIds.size,
      recentMatchStartTime,
    };
  }, [filteredMatches]);

  const getGroupAverageDuration = (group: LeagueGroup): string => {
    const validDurations = group.matches
      .map((match) => match.duration)
      .filter((duration): duration is number => typeof duration === 'number' && duration >= 0);

    if (validDurations.length === 0) {
      return '--';
    }

    const averageDuration =
      validDurations.reduce((total, duration) => total + duration, 0) / validDurations.length;
    return formatDurationClock(Math.round(averageDuration));
  };

  const handleOpenInMatchDatabase = (leagueId?: number | null) => {
    if (!currentTeamId || leagueId === undefined || leagueId === null) {
      return;
    }

    onOpenMatchDatabase?.({
      teamId: currentTeamId,
      leagueId,
    });
  };

  const handleOpenVisibleInMatchDatabase = () => {
    if (currentTeamId === null) {
      return;
    }

    if (visibleMatches.length === 0) {
      setVisiblePrepareSummary(null);
      setFeedback('当前没有可见比赛可在比赛数据库中打开。');
      return;
    }

    const currentVisibleLeagueFilterKey = focusLatestLeague
      ? focusedLatestLeagueFilterKey ?? DEFAULT_LEAGUE_FILTER
      : selectedLeagueFilterKey;
    const mappedLeagueId =
      currentVisibleLeagueFilterKey === DEFAULT_LEAGUE_FILTER
        ? undefined
        : parseLeagueIdFromFilterKey(currentVisibleLeagueFilterKey);

    const mappedContext = {
      teamId: currentTeamId,
      ...(mappedLeagueId !== undefined ? { leagueId: mappedLeagueId } : {}),
      ...(onlyWithDownloadStatus ? { hasDownload: true } : {}),
    };

    onOpenMatchDatabase?.({
      ...mappedContext,
    });

    appendActionHistory({
      type: 'open_visible_in_match_database',
       actionName: '在比赛数据库打开当前可见项',
      summary: `Visible ${visibleMatches.length} / team ${mappedContext.teamId}${
        mappedContext.leagueId !== undefined ? ` / league ${mappedContext.leagueId}` : ''
      }${mappedContext.hasDownload ? ' / has_download=true' : ''}`,
      payload: {
        type: 'open_visible_in_match_database',
        context: mappedContext,
        visibleCount: visibleMatches.length,
      },
      lastRunStatus: 'succeeded',
       lastRunMessage: '已触发跳转。',
    });
  };

  const handleApplyLeagueQuickFilter = (leagueFilterKey: string) => {
    setFocusLatestLeague(false);
    setAppliedLeagueCompareFilterKeys([]);
    setSelectedLeagueCompareKeys([]);
    setSelectedLeagueFilterKey(leagueFilterKey);
    setVisiblePrepareSummary(null);
  };

  const handleToggleLeagueCompareSelection = (leagueKey: string, checked: boolean) => {
    setSelectedLeagueCompareKeys((current) => {
      if (checked) {
        if (current.includes(leagueKey)) {
          return current;
        }
        return [...current, leagueKey];
      }

      return current.filter((key) => key !== leagueKey);
    });
  };

  const handleApplySelectedLeagues = () => {
    if (selectedLeagueCompareKeys.length === 0) {
      return;
    }

    setFocusLatestLeague(false);
    setSelectedLeagueFilterKey(DEFAULT_LEAGUE_FILTER);
    setAppliedLeagueCompareFilterKeys(selectedLeagueCompareKeys);
    setVisiblePrepareSummary(null);
    setFeedback(`已将 ${selectedLeagueCompareKeys.length} 个已选联赛应用到当前视图。`);
  };

  const handleClearLeagueSelection = () => {
    setSelectedLeagueCompareKeys([]);
    setAppliedLeagueCompareFilterKeys([]);
    setVisiblePrepareSummary(null);
    setFeedback('已清除联赛对比多选，已恢复快捷筛选视图。');
  };

  const topLeagueCompareItem = leagueCompareItems[0] ?? null;
  const canPinTopLeague =
    topLeagueCompareItem !== null &&
    leagueQuickFilterOptions.some((option) => option.key === topLeagueCompareItem.key);

  const handlePinTopLeague = () => {
    if (!topLeagueCompareItem || !canPinTopLeague) {
      return;
    }

    setFocusLatestLeague(false);
    setAppliedLeagueCompareFilterKeys([]);
    setSelectedLeagueCompareKeys([]);
    setSelectedLeagueFilterKey(topLeagueCompareItem.key);
    setVisiblePrepareSummary(null);
    setFeedback(`已固定榜首联赛：${topLeagueCompareItem.label}。`);
  };

  const handleSaveQuickSnapshot = () => {
    const trimmedSnapshotName = snapshotNameInput.trim();
    if (!trimmedSnapshotName) {
      setVisiblePrepareSummary(null);
      setFeedback('快照名称不能为空。');
      return;
    }

    const existingIndex = quickSnapshots.findIndex((snapshot) => snapshot.name === trimmedSnapshotName);
    if (existingIndex < 0 && quickSnapshots.length >= 5) {
      setVisiblePrepareSummary(null);
      setFeedback('快照数量已达上限（最多 5 个）。请先删除后再保存。');
      return;
    }

    const nextSnapshot: TeamProfileQuickSnapshot = {
      name: trimmedSnapshotName,
      teamIdInput,
      limitInput,
      selectedLeagueFilterKey,
      sortOrder,
      onlyWithDownloadStatus,
      focusLatestLeague,
      savedAtMs: Date.now(),
    };

    if (existingIndex >= 0) {
      setQuickSnapshots((current) =>
        current.map((snapshot, index) => (index === existingIndex ? nextSnapshot : snapshot))
      );
      setFeedback(`快照“${trimmedSnapshotName}”已更新。`);
    } else {
      setQuickSnapshots((current) => [...current, nextSnapshot]);
      setFeedback(`快照“${trimmedSnapshotName}”已保存。`);
    }
    setSnapshotNameInput(trimmedSnapshotName);
    setSelectedSnapshotName(trimmedSnapshotName);
    setVisiblePrepareSummary(null);
  };

  const handleApplySnapshot = async (actionLabel: 'loaded' | 'applied') => {
    if (!selectedSnapshot) {
      return;
    }

    setVisiblePrepareSummary(null);
    setError(null);
    setTeamIdInput(selectedSnapshot.teamIdInput);
    setLimitInput(selectedSnapshot.limitInput);
    setSelectedLeagueFilterKey(selectedSnapshot.selectedLeagueFilterKey);
    setSortOrder(selectedSnapshot.sortOrder);
    setOnlyWithDownloadStatus(selectedSnapshot.onlyWithDownloadStatus);
    setFocusLatestLeague(selectedSnapshot.focusLatestLeague);
    setSelectedLeagueCompareKeys([]);
    setAppliedLeagueCompareFilterKeys([]);
    setSnapshotNameInput(selectedSnapshot.name);

    const parsedTeamId = toOptionalPositiveInt(selectedSnapshot.teamIdInput);
    const parsedLimit = toOptionalPositiveInt(selectedSnapshot.limitInput) ?? 20;

    if (!parsedTeamId) {
      setFeedback(
        `快照“${selectedSnapshot.name}”已${actionLabel === 'loaded' ? '加载' : '应用'}。请输入有效战队 ID 以刷新数据。`
      );
      return;
    }

    setLoading(true);
    try {
      await fetchMatchesByTeamId(parsedTeamId, parsedLimit);
      setFeedback(`快照“${selectedSnapshot.name}”已${actionLabel === 'loaded' ? '加载' : '应用'}并刷新数据。`);
    } catch (fetchError) {
      console.error('Failed to load quick snapshot for team profile:', fetchError);
      setCurrentTeamId(parsedTeamId);
      setMatches([]);
      setError(`快照“${selectedSnapshot.name}”已${actionLabel === 'loaded' ? '加载' : '应用'}，但刷新数据失败，请重试。`);
      setFeedback(`快照“${selectedSnapshot.name}”已${actionLabel === 'loaded' ? '加载' : '应用'}，数据刷新失败。`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadQuickSnapshot = async () => {
    await handleApplySnapshot('loaded');
  };

  const handleApplyQuickSnapshot = async () => {
    await handleApplySnapshot('applied');
  };

  const handleDeleteSnapshot = () => {
    if (!selectedSnapshot) {
      return;
    }

    const deletingName = selectedSnapshot.name;
    setQuickSnapshots((current) => current.filter((snapshot) => snapshot.name !== deletingName));
    setVisiblePrepareSummary(null);
    setFeedback(`快照“${deletingName}”已删除。`);
  };

  const handleClearAllSnapshots = () => {
    if (quickSnapshots.length === 0) {
      return;
    }

    const clearedCount = quickSnapshots.length;
    setQuickSnapshots([]);
    setSelectedSnapshotName('');
    setSnapshotNameInput('');
    setVisiblePrepareSummary(null);
    setFeedback(`已清空 ${clearedCount} 个快照。`);
  };

  const handleExportSnapshots = () => {
    if (quickSnapshots.length === 0) {
      return;
    }

    const payload: TeamProfileSnapshotTransferPayload = {
      snapshots: quickSnapshots.map((snapshot) => ({
        name: snapshot.name,
        teamIdInput: snapshot.teamIdInput,
        limitInput: snapshot.limitInput,
        selectedLeagueFilterKey: snapshot.selectedLeagueFilterKey,
        sortOrder: snapshot.sortOrder,
        onlyWithDownloadStatus: snapshot.onlyWithDownloadStatus,
        focusLatestLeague: snapshot.focusLatestLeague,
      })),
    };

    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `team-profile-snapshots-${Date.now()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
      setVisiblePrepareSummary(null);
      setFeedback(`已导出 ${quickSnapshots.length} 个快照。`);
    } catch (exportError) {
      console.error('Failed to export team profile snapshots:', exportError);
      setVisiblePrepareSummary(null);
      setFeedback('导出快照失败。');
    }
  };

  const handleTriggerSnapshotImport = () => {
    snapshotImportInputRef.current?.click();
  };

  const handleImportSnapshots = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setVisiblePrepareSummary(null);

    let raw: unknown;
    try {
      raw = JSON.parse(await file.text()) as unknown;
    } catch (parseError) {
      console.error('Failed to parse imported team profile snapshot file:', parseError);
      setFeedback('导入失败：JSON 文件无效。');
      return;
    }

    const inputItems = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { snapshots?: unknown }).snapshots)
        ? ((raw as { snapshots: unknown[] }).snapshots as unknown[])
        : [];
    const validItems = parseSnapshotTransferPayload(raw);
    const invalidCount = Math.max(inputItems.length - validItems.length, 0);

    if (inputItems.length === 0) {
      setFeedback('已跳过导入：文件中未找到快照。');
      return;
    }

    let overwrittenCount = 0;
    let truncatedCount = 0;

    setQuickSnapshots((current) => {
      const merged = [...current];
      for (const item of validItems) {
        const existingIndex = merged.findIndex((snapshot) => snapshot.name === item.name);
        const nextSnapshot: TeamProfileQuickSnapshot = {
          ...item,
          savedAtMs: Date.now(),
        };
        if (existingIndex >= 0) {
          merged[existingIndex] = nextSnapshot;
          overwrittenCount += 1;
        } else {
          merged.push(nextSnapshot);
        }
      }

      if (merged.length > 5) {
        truncatedCount = merged.length - 5;
      }

      return merged.slice(0, 5);
    });

    if (validItems.length > 0) {
      setSelectedSnapshotName(validItems[0].name);
      setSnapshotNameInput(validItems[0].name);
    }

    const feedbackParts = [
      `导入完成：有效 ${validItems.length}`,
      `无效 ${invalidCount}`,
      `覆盖 ${overwrittenCount}`,
    ];
    if (truncatedCount > 0) {
      feedbackParts.push(`因最多 5 个限制被截断 ${truncatedCount}`);
    }
    setFeedback(`${feedbackParts.join(', ')}.`);
  };

  const handleCopyVisibleMatchIds = async () => {
    if (visibleMatches.length === 0 || isVisibleBatchActionRunning) {
      return;
    }

    const copiedContent = visibleMatches.map((match) => String(match.match_id)).join(',');
    setVisiblePrepareSummary(null);

    try {
      const clipboard = window.navigator?.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        setFeedback('复制失败：当前环境不支持剪贴板。');
        return;
      }

      await clipboard.writeText(copiedContent);
      setFeedback(`已复制 ${visibleMatches.length} 个比赛 ID。`);
    } catch (copyError) {
      console.error('Failed to copy visible match ids from team profile:', copyError);
      setFeedback('复制失败：无法访问剪贴板。');
    }
  };

  const toggleGroupCollapsed = (groupKey: string) => {
    setCollapsedGroupKeys((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  };

  const getGroupViewState = (groupKey: string): GroupViewState => {
    if (collapsedGroupKeys[groupKey]) {
      return 'collapsed';
    }
    return 'expanded';
  };

  const visibleMatches = useMemo(() => {
    const expandedGroupKeys = new Set(
      groupedMatches
        .filter((group) => getGroupViewState(group.key) === 'expanded')
        .map((group) => group.key)
    );
    return filteredMatches.filter((match) => expandedGroupKeys.has(getLeagueGroupKey(match.leagueid)));
  }, [collapsedGroupKeys, filteredMatches, groupedMatches]);

  const selectedLeagueCompareVisibleMatches = useMemo(() => {
    if (selectedLeagueCompareKeys.length === 0) {
      return [] as TeamProfileMatchRecord[];
    }

    const selectedKeys = new Set(selectedLeagueCompareKeys);
    return visibleMatches.filter((match) => selectedKeys.has(getLeagueGroupKey(match.leagueid)));
  }, [selectedLeagueCompareKeys, visibleMatches]);

  const compareSelectedVisibleTop3Matches = useMemo(
    () => selectedLeagueCompareVisibleMatches.slice(0, 3),
    [selectedLeagueCompareVisibleMatches]
  );

  const isVisibleBatchActionRunning =
    isPreparingVisibleMatches ||
    isPreparingAndOpeningVisibleReplay ||
    isPreparingSelectedLeagues ||
    isOpeningCompareFirstReplays ||
    isReplayingVisibleHistory;

  const activePresetKey = useMemo<TeamProfilePresetKey | null>(() => {
    if (onlyWithDownloadStatus) {
      return 'with_download_status';
    }
    if (limitInput === '20' && sortOrder === 'desc') {
      return 'latest_20';
    }
    return 'all_matches';
  }, [limitInput, onlyWithDownloadStatus, sortOrder]);

  const applyPreset = async (presetKey: TeamProfilePresetKey) => {
    setFeedback(null);
    setVisiblePrepareSummary(null);
    setAppliedLeagueCompareFilterKeys([]);
    setSelectedLeagueCompareKeys([]);

    if (presetKey === 'all_matches') {
      setOnlyWithDownloadStatus(false);
      setSelectedLeagueFilterKey(DEFAULT_LEAGUE_FILTER);
    }

    if (presetKey === 'with_download_status') {
      setOnlyWithDownloadStatus(true);
      setSelectedLeagueFilterKey(DEFAULT_LEAGUE_FILTER);
    }

    if (presetKey === 'latest_20') {
      setLimitInput(DEFAULT_LIMIT_INPUT);
      setSortOrder('desc');
      setOnlyWithDownloadStatus(false);
      setSelectedLeagueFilterKey(DEFAULT_LEAGUE_FILTER);
    }

    if (currentTeamId === null) {
      return;
    }

    const parsedLimit =
      presetKey === 'latest_20' ? 20 : toOptionalPositiveInt(limitInput) ?? Number(DEFAULT_LIMIT_INPUT);

    setLoading(true);
    setError(null);
    try {
      await fetchMatchesByTeamId(currentTeamId, parsedLimit);
    } catch (fetchError) {
      console.error('Failed to apply Team Profile preset:', fetchError);
      setError('应用预设失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const handlePrepareVisibleMatches = async () => {
    if (isVisibleBatchActionRunning || visibleMatches.length === 0) {
      return;
    }

    setFeedback(null);
    setVisiblePrepareSummary(null);
    setIsPreparingVisibleMatches(true);

    let success = 0;
    let failed = 0;

    for (const match of visibleMatches) {
      try {
        const result = await matchDatabaseService.triggerDownloadAction(match.match_id, 'prepare');
        if (result.status === 'ok') {
          success += 1;
        } else {
          failed += 1;
        }
      } catch (actionError) {
        console.error('Failed to prepare visible match from team profile:', actionError);
        failed += 1;
      }
    }

    setVisiblePrepareSummary({
      action: 'prepare_visible',
      total: visibleMatches.length,
      success,
      failed,
    });

    appendActionHistory({
      type: 'prepare_visible_matches',
      actionName: '准备当前可见比赛',
      summary: `总计 ${visibleMatches.length} / 成功 ${success} / 失败 ${failed}`,
      payload: {
        type: 'prepare_visible_matches',
        matchIds: visibleMatches.map((match) => match.match_id),
      },
      lastRunStatus: failed === 0 ? 'succeeded' : 'failed',
      lastRunMessage: `总计 ${visibleMatches.length} / 成功 ${success} / 失败 ${failed}`,
    });

    if (currentTeamId !== null) {
      const parsedLimit = toOptionalPositiveInt(limitInput) ?? 20;
      try {
        await fetchMatchesByTeamId(currentTeamId, parsedLimit);
      } catch (refreshError) {
        console.error('Failed to refresh team profile after preparing visible matches:', refreshError);
      }
    }

    setIsPreparingVisibleMatches(false);
  };

  const handlePrepareAndOpenFirstVisibleReplay = async () => {
    if (isVisibleBatchActionRunning || visibleMatches.length === 0) {
      return;
    }

    const firstVisibleMatch = visibleMatches[0];
    setFeedback(null);
    setVisiblePrepareSummary(null);
    setIsPreparingAndOpeningVisibleReplay(true);

    let success = 0;
    let failed = 0;

    for (const match of visibleMatches) {
      try {
        const result = await matchDatabaseService.triggerDownloadAction(match.match_id, 'prepare');
        if (result.status === 'ok') {
          success += 1;
        } else {
          failed += 1;
        }
      } catch (actionError) {
        console.error('Failed to prepare visible match before opening replay from team profile:', actionError);
        failed += 1;
      }
    }

    setVisiblePrepareSummary({
      action: 'prepare_open_first_visible',
      total: visibleMatches.length,
      success,
      failed,
      openedMatchId: firstVisibleMatch.match_id,
    });

    if (failed === visibleMatches.length) {
      setFeedback(
        `全部 ${visibleMatches.length} 场可见比赛准备失败。正在打开首场回放 ${firstVisibleMatch.match_id}...`
      );
    } else {
      setFeedback(`准备批量完成后，正在打开首场可见回放 ${firstVisibleMatch.match_id}...`);
    }
    openReplayWithLightweightFeedback(firstVisibleMatch.match_id);

    if (currentTeamId !== null) {
      const parsedLimit = toOptionalPositiveInt(limitInput) ?? 20;
      try {
        await fetchMatchesByTeamId(currentTeamId, parsedLimit);
      } catch (refreshError) {
        console.error('Failed to refresh team profile after prepare+open visible action:', refreshError);
      }
    }

    setIsPreparingAndOpeningVisibleReplay(false);
  };

  const handlePrepareSelectedLeagues = async () => {
    if (isVisibleBatchActionRunning || selectedLeagueCompareVisibleMatches.length === 0) {
      return;
    }

    setFeedback(null);
    setVisiblePrepareSummary(null);
    setIsPreparingSelectedLeagues(true);

    let success = 0;
    let failed = 0;

    for (const match of selectedLeagueCompareVisibleMatches) {
      try {
        const result = await matchDatabaseService.triggerDownloadAction(match.match_id, 'prepare');
        if (result.status === 'ok') {
          success += 1;
        } else {
          failed += 1;
        }
      } catch (actionError) {
        console.error('Failed to prepare selected-league visible match from team profile:', actionError);
        failed += 1;
      }
    }

    setVisiblePrepareSummary({
      action: 'prepare_selected_leagues',
      total: selectedLeagueCompareVisibleMatches.length,
      success,
      failed,
    });

    appendActionHistory({
      type: 'prepare_selected_leagues',
      actionName: '准备已选联赛',
      summary: `总计 ${selectedLeagueCompareVisibleMatches.length} / 成功 ${success} / 失败 ${failed}`,
      payload: {
        type: 'prepare_selected_leagues',
        matchIds: selectedLeagueCompareVisibleMatches.map((match) => match.match_id),
      },
      lastRunStatus: failed === 0 ? 'succeeded' : 'failed',
      lastRunMessage: `总计 ${selectedLeagueCompareVisibleMatches.length} / 成功 ${success} / 失败 ${failed}`,
    });

    if (currentTeamId !== null) {
      const parsedLimit = toOptionalPositiveInt(limitInput) ?? 20;
      try {
        await fetchMatchesByTeamId(currentTeamId, parsedLimit);
      } catch (refreshError) {
        console.error('Failed to refresh team profile after preparing selected leagues:', refreshError);
      }
    }

    setIsPreparingSelectedLeagues(false);
  };

  const handleExportVisibleMatches = () => {
    if (visibleMatches.length === 0) {
      return;
    }

    const lines = visibleMatches.map((match) => {
      const startTime = typeof match.start_time === 'number' ? String(match.start_time) : '';
      const leagueId = typeof match.leagueid === 'number' ? String(match.leagueid) : '';
      return `${match.match_id}\t${startTime}\t${leagueId}`;
    });

    try {
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `team-profile-visible-matches-${currentTeamId ?? 'unknown'}-${Date.now()}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);

      setVisiblePrepareSummary(null);
      setFeedback(`已导出 ${visibleMatches.length} 场可见比赛。`);
    } catch (exportError) {
      console.error('Failed to export visible matches from team profile:', exportError);
      setVisiblePrepareSummary(null);
      setFeedback('导出可见比赛失败。');
    }
  };

  const handleExportCompareSelection = () => {
    if (selectedLeagueCompareVisibleMatches.length === 0 || isVisibleBatchActionRunning) {
      return;
    }

    const lines = selectedLeagueCompareVisibleMatches.map((match) => {
      const leagueId = typeof match.leagueid === 'number' ? String(match.leagueid) : '';
      const startTime = typeof match.start_time === 'number' ? String(match.start_time) : '';
      return `${match.match_id}\t${leagueId}\t${startTime}`;
    });

    try {
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `team-profile-compare-selection-${currentTeamId ?? 'unknown'}-${Date.now()}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);

      setVisiblePrepareSummary(null);
      setFeedback(`已导出 ${selectedLeagueCompareVisibleMatches.length} 场对比已选可见比赛。`);
    } catch (exportError) {
      console.error('Failed to export compare selection from team profile:', exportError);
      setVisiblePrepareSummary(null);
      setFeedback('导出对比选择失败。');
    }
  };

  const handleOpenCompareFirst3Replays = async () => {
    if (compareFirstThreeRunningRef.current) {
      return;
    }

    if (isVisibleBatchActionRunning || compareSelectedVisibleTop3Matches.length === 0) {
      return;
    }

    compareFirstThreeRunningRef.current = true;
    setFeedback(null);
    setVisiblePrepareSummary(null);
    setIsOpeningCompareFirstReplays(true);

    let preparedCount = 0;
    let failedCount = 0;
    const openedMatchId = compareSelectedVisibleTop3Matches[0]?.match_id ?? null;

    try {
      for (const match of compareSelectedVisibleTop3Matches) {
        try {
          const result = await matchDatabaseService.triggerDownloadAction(match.match_id, 'prepare');
          if (result.status === 'ok') {
            preparedCount += 1;
          } else {
            failedCount += 1;
          }
        } catch (prepareError) {
          console.error('Failed to prepare compare-selected match from team profile:', prepareError);
          failedCount += 1;
        }
      }

      if (typeof openedMatchId === 'number') {
        onOpenReplay?.({
          source: 'team_profile',
          matchId: openedMatchId,
        });
      }

      setFeedback(
        `打开对比首 3 场回放完成：准备成功=${preparedCount}，准备失败=${failedCount}，已打开比赛=${openedMatchId ?? '无'}。`
      );

      appendActionHistory({
        type: 'open_compare_first_3_replays',
        actionName: '打开对比首 3 场回放',
        summary: `准备成功 ${preparedCount} / 准备失败 ${failedCount} / 已打开 ${openedMatchId ?? '无'}`,
        payload: {
          type: 'open_compare_first_3_replays',
          matchIds: compareSelectedVisibleTop3Matches.map((match) => match.match_id),
          openedMatchId,
        },
        lastRunStatus: failedCount === 0 ? 'succeeded' : 'failed',
        lastRunMessage: `准备成功=${preparedCount}，准备失败=${failedCount}，已打开比赛=${openedMatchId ?? '无'}`,
      });

      if (currentTeamId !== null) {
        const parsedLimit = toOptionalPositiveInt(limitInput) ?? 20;
        try {
          await fetchMatchesByTeamId(currentTeamId, parsedLimit);
        } catch (refreshError) {
          console.error('Failed to refresh team profile after open compare first 3 action:', refreshError);
        }
      }
    } finally {
      setIsOpeningCompareFirstReplays(false);
      compareFirstThreeRunningRef.current = false;
    }
  };

  const runReplayAction = async (entry: ActionHistoryEntry): Promise<ActionReplayResult> => {
    if (entry.payload.type === 'prepare_visible_matches' || entry.payload.type === 'prepare_selected_leagues') {
      const matchIds = entry.payload.matchIds;
      if (matchIds.length === 0) {
        return {
          status: 'failed',
            message: `重放已跳过：${entry.actionName} 未记录目标。`,
        };
      }

      const availableMatchIds = new Set(matches.map((match) => match.match_id));
      const replayTargets = matchIds.filter((matchId) => availableMatchIds.has(matchId));
      if (replayTargets.length === 0) {
        return {
          status: 'failed',
            message: '重放已跳过：记录的目标在当前会话数据中已不可见。',
        };
      }

      if (entry.payload.type === 'prepare_visible_matches') {
        setIsPreparingVisibleMatches(true);
      } else {
        setIsPreparingSelectedLeagues(true);
      }

      let success = 0;
      let failed = 0;
      for (const matchId of replayTargets) {
        try {
          const result = await matchDatabaseService.triggerDownloadAction(matchId, 'prepare');
          if (result.status === 'ok') {
            success += 1;
          } else {
            failed += 1;
          }
        } catch (replayError) {
          console.error('Failed to replay prepare action from team profile:', replayError);
          failed += 1;
        }
      }

      setVisiblePrepareSummary({
        action: entry.payload.type === 'prepare_visible_matches' ? 'prepare_visible' : 'prepare_selected_leagues',
        total: replayTargets.length,
        success,
        failed,
      });

      if (currentTeamId !== null) {
        const parsedLimit = toOptionalPositiveInt(limitInput) ?? 20;
        try {
          await fetchMatchesByTeamId(currentTeamId, parsedLimit);
        } catch (refreshError) {
          console.error('Failed to refresh team profile after replay prepare action:', refreshError);
        }
      }

      return {
        status: failed === 0 ? 'succeeded' : 'failed',
        message: `重放完成：${entry.actionName}。总计 ${replayTargets.length} / 成功 ${success} / 失败 ${failed}。`,
        total: replayTargets.length,
        success,
        failed,
      };
    }

    if (entry.payload.type === 'open_visible_in_match_database') {
      if (!onOpenMatchDatabase) {
        return {
          status: 'failed',
          message: '重放已跳过：比赛数据库跳转回调不可用。',
        };
      }

      if (entry.payload.visibleCount <= 0) {
        return {
          status: 'failed',
          message: '重放已跳过：记录动作没有可见目标。',
        };
      }

      onOpenMatchDatabase(entry.payload.context);
      return {
        status: 'succeeded',
        message: '重放完成：已在比赛数据库打开当前可见项。',
      };
    }

    const recordedIds = entry.payload.matchIds;
    if (recordedIds.length === 0) {
      return {
        status: 'failed',
        message: '重放已跳过：未记录对比目标。',
      };
    }

    const availableMatchIds = new Set(matches.map((match) => match.match_id));
    const replayTargets = recordedIds.filter((matchId) => availableMatchIds.has(matchId));
    if (replayTargets.length === 0) {
      return {
        status: 'failed',
        message: '重放已跳过：记录的对比目标在当前会话数据中不可用。',
      };
    }

    compareFirstThreeRunningRef.current = true;
    setIsOpeningCompareFirstReplays(true);

    let preparedCount = 0;
    let failedCount = 0;
    for (const matchId of replayTargets) {
      try {
        const result = await matchDatabaseService.triggerDownloadAction(matchId, 'prepare');
        if (result.status === 'ok') {
          preparedCount += 1;
        } else {
          failedCount += 1;
        }
      } catch (replayError) {
        console.error('Failed to replay compare first 3 action from team profile:', replayError);
        failedCount += 1;
      }
    }

    const openedMatchId = replayTargets[0] ?? null;
    if (typeof openedMatchId === 'number') {
      onOpenReplay?.({
        source: 'team_profile',
        matchId: openedMatchId,
      });
    }

    if (currentTeamId !== null) {
      const parsedLimit = toOptionalPositiveInt(limitInput) ?? 20;
      try {
        await fetchMatchesByTeamId(currentTeamId, parsedLimit);
      } catch (refreshError) {
        console.error('Failed to refresh team profile after replay compare action:', refreshError);
      }
    }

    return {
      status: failedCount === 0 ? 'succeeded' : 'failed',
      message: `重放完成：打开对比首 3 场回放（准备成功=${preparedCount}，准备失败=${failedCount}，已打开比赛=${openedMatchId ?? '无'}）。`,
      total: replayTargets.length,
      success: preparedCount,
      failed: failedCount,
    };
  };

  const handleReplayAction = async (entry: ActionHistoryEntry, mode: 'replay' | 'retry' = 'replay') => {
    if (isVisibleBatchActionRunning || activeReplayHistoryId !== null || isReplayingVisibleHistory) {
      setFeedback('重放已跳过：仍有其他操作在执行。');
      return;
    }

    setActiveReplayHistoryId(entry.id);
    setVisiblePrepareSummary(null);
    setFeedback(null);

    try {
      const result = await runReplayAction(entry);
      updateActionHistoryRunResult(entry.id, result, { bumpExecutedAt: true });
      const prefix = mode === 'retry' ? '重试' : '重放';
      setFeedback(`${prefix}: ${result.message}`);
    } finally {
      setActiveReplayHistoryId(null);
      setIsPreparingVisibleMatches(false);
      setIsPreparingSelectedLeagues(false);
      setIsOpeningCompareFirstReplays(false);
      compareFirstThreeRunningRef.current = false;
    }
  };

  const handleReplayVisibleHistory = async () => {
    if (
      visibleActionHistory.length === 0 ||
      isVisibleBatchActionRunning ||
      activeReplayHistoryId !== null ||
      isReplayingVisibleHistory
    ) {
      return;
    }

    setVisiblePrepareSummary(null);
    setFeedback(null);
    setIsReplayingVisibleHistory(true);

    const replayQueue = [...visibleActionHistory].sort((left, right) => left.executedAtMs - right.executedAtMs);
    let succeeded = 0;
    let failed = 0;

    try {
      for (const entry of replayQueue) {
        const result = await runReplayAction(entry);
        updateActionHistoryRunResult(entry.id, result, { bumpExecutedAt: true });
        if (result.status === 'succeeded') {
          succeeded += 1;
        } else {
          failed += 1;
        }

        setIsPreparingVisibleMatches(false);
        setIsPreparingSelectedLeagues(false);
        setIsOpeningCompareFirstReplays(false);
        compareFirstThreeRunningRef.current = false;
      }

      setFeedback(
        `重放可见历史完成：重放 ${replayQueue.length} / 成功 ${succeeded} / 失败 ${failed}。`
      );
    } finally {
      setIsPreparingVisibleMatches(false);
      setIsPreparingSelectedLeagues(false);
      setIsOpeningCompareFirstReplays(false);
      compareFirstThreeRunningRef.current = false;
      setIsReplayingVisibleHistory(false);
    }
  };

  const visibleActionHistory = useMemo(() => {
    if (historyFilterKey === DEFAULT_ACTION_HISTORY_FILTER) {
      return actionHistory;
    }

    return actionHistory.filter((entry) => entry.type === historyFilterKey);
  }, [actionHistory, historyFilterKey]);

  const handleClearVisibleHistory = () => {
    if (visibleActionHistory.length === 0) {
      return;
    }

    const visibleEntryIds = new Set(visibleActionHistory.map((entry) => entry.id));
    setActionHistory((current) => current.filter((entry) => !visibleEntryIds.has(entry.id)));
    if (activeReplayHistoryId !== null && visibleEntryIds.has(activeReplayHistoryId)) {
      setActiveReplayHistoryId(null);
    }
    setVisiblePrepareSummary(null);
    setFeedback(`已清除 ${visibleActionHistory.length} 条可见历史记录。`);
  };

  const handleClearAllHistory = () => {
    if (actionHistory.length === 0) {
      return;
    }

    const clearedCount = actionHistory.length;
    setActionHistory([]);
    setActiveReplayHistoryId(null);
    setVisiblePrepareSummary(null);
    setFeedback(`已清除 ${clearedCount} 条历史记录。`);
  };

  return (
    <div className="min-h-screen bg-dota-bg p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-dota-gold">战队档案</h1>
            <p className="mt-1 text-gray-400">
              基于 OpenDota 同步比赛的战队档案视图。
            </p>
          </div>
          <button
            onClick={onBackHome}
            className="rounded border border-gray-600 bg-dota-surface px-4 py-2 text-sm text-white hover:bg-dota-primary"
          >
            返回首页
          </button>
        </div>

        <div className="mb-5 rounded-lg border border-gray-700 bg-dota-surface p-5">
          <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">战队 ID</label>
              <input
                aria-label="战队 ID"
                value={teamIdInput}
                onChange={(event) => setTeamIdInput(event.target.value)}
                placeholder="例如 15"
                className="w-full rounded border border-gray-600 bg-dota-bg px-3 py-2 text-white placeholder-gray-500 focus:border-dota-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">数量上限</label>
              <input
                aria-label="数量上限"
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
                placeholder="20"
                className="w-full rounded border border-gray-600 bg-dota-bg px-3 py-2 text-white placeholder-gray-500 focus:border-dota-primary focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="rounded bg-dota-primary px-5 py-2 font-medium text-white hover:bg-blue-700"
              >
                查询
              </button>
            </div>
          </form>
          <div className="mt-4 border-t border-gray-700 pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-300">预设视图</span>
              <button
                type="button"
                aria-label="预设 全部比赛"
                onClick={() => {
                  void applyPreset('all_matches');
                }}
                className={`rounded border px-3 py-1.5 text-sm ${
                  activePresetKey === 'all_matches'
                    ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100'
                    : 'border-gray-600 bg-dota-bg text-gray-200 hover:border-gray-500'
                }`}
              >
                全部比赛
              </button>
              <button
                type="button"
                aria-label="预设 仅有下载状态"
                onClick={() => {
                  void applyPreset('with_download_status');
                }}
                className={`rounded border px-3 py-1.5 text-sm ${
                  activePresetKey === 'with_download_status'
                    ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100'
                    : 'border-gray-600 bg-dota-bg text-gray-200 hover:border-gray-500'
                }`}
              >
                仅有下载状态
              </button>
              <button
                type="button"
                aria-label="预设 最近 20 场"
                onClick={() => {
                  void applyPreset('latest_20');
                }}
                className={`rounded border px-3 py-1.5 text-sm ${
                  activePresetKey === 'latest_20'
                    ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100'
                    : 'border-gray-600 bg-dota-bg text-gray-200 hover:border-gray-500'
                }`}
              >
                最近 20 场
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-300">快速快照</span>
              <label className="sr-only" htmlFor="team-profile-snapshot-name">
                 快照名称
              </label>
              <input
                id="team-profile-snapshot-name"
                aria-label="快照名称"
                value={snapshotNameInput}
                onChange={(event) => setSnapshotNameInput(event.target.value)}
                placeholder="快照名称"
                className="w-44 rounded border border-gray-600 bg-dota-bg px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-dota-primary focus:outline-none"
              />
              <button
                type="button"
                aria-label="保存快照"
                onClick={handleSaveQuickSnapshot}
                className="rounded border border-violet-700/50 bg-violet-900/20 px-3 py-1.5 text-sm text-violet-200 hover:border-violet-500/60 hover:text-violet-100"
              >
                保存快照
              </button>
              <label className="sr-only" htmlFor="team-profile-snapshot-list">
                 快照列表
              </label>
              <select
                id="team-profile-snapshot-list"
                aria-label="快照列表"
                value={selectedSnapshotName}
                onChange={(event) => setSelectedSnapshotName(event.target.value)}
                disabled={quickSnapshots.length === 0}
                className="w-48 rounded border border-gray-600 bg-dota-bg px-2.5 py-1.5 text-sm text-gray-200 focus:border-dota-primary focus:outline-none disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
              >
                {quickSnapshots.length === 0 ? (
                    <option value="">暂无快照</option>
                ) : (
                  quickSnapshots.map((snapshot) => (
                    <option key={snapshot.name} value={snapshot.name}>
                      {snapshot.name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                aria-label="加载快照"
                onClick={() => {
                  void handleLoadQuickSnapshot();
                }}
                disabled={!selectedSnapshot || loading}
                className="rounded border border-violet-700/50 bg-violet-900/20 px-3 py-1.5 text-sm text-violet-200 hover:border-violet-500/60 hover:text-violet-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
              >
                加载快照
              </button>
              <button
                type="button"
                aria-label="应用快照"
                onClick={() => {
                  void handleApplyQuickSnapshot();
                }}
                disabled={!selectedSnapshot || loading}
                className="rounded border border-violet-700/50 bg-violet-900/20 px-3 py-1.5 text-sm text-violet-200 hover:border-violet-500/60 hover:text-violet-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
              >
                应用快照
              </button>
              <button
                type="button"
                aria-label="删除快照"
                onClick={handleDeleteSnapshot}
                disabled={!selectedSnapshot || loading}
                className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-1.5 text-sm text-rose-200 hover:border-rose-500/60 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
              >
                删除快照
              </button>
              <button
                type="button"
                aria-label="清空全部快照"
                onClick={handleClearAllSnapshots}
                disabled={quickSnapshots.length === 0 || loading}
                className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-1.5 text-sm text-rose-200 hover:border-rose-500/60 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
              >
                清空全部快照
              </button>
              <button
                type="button"
                aria-label="导出快照（.json）"
                onClick={handleExportSnapshots}
                disabled={quickSnapshots.length === 0}
                className="rounded border border-sky-700/60 bg-sky-900/20 px-3 py-1.5 text-sm text-sky-200 hover:border-sky-500/60 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
              >
                导出快照（.json）
              </button>
              <button
                type="button"
                aria-label="导入快照（.json）"
                onClick={handleTriggerSnapshotImport}
                className="rounded border border-sky-700/60 bg-sky-900/20 px-3 py-1.5 text-sm text-sky-200 hover:border-sky-500/60 hover:text-sky-100"
              >
                导入快照（.json）
              </button>
              <input
                ref={snapshotImportInputRef}
                aria-label="导入快照文件"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  void handleImportSnapshots(event);
                }}
                className="hidden"
              />
              <span className="text-xs text-gray-500">
                {selectedSnapshot
                  ? `已选择：${selectedSnapshot.name}（${new Date(selectedSnapshot.savedAtMs).toLocaleTimeString()}）`
                  : '尚未保存快照。'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                aria-label="仅显示有下载状态"
                type="checkbox"
                checked={onlyWithDownloadStatus}
                onChange={(event) => setOnlyWithDownloadStatus(event.target.checked)}
                className="h-4 w-4 rounded border-gray-500 bg-dota-bg"
              />
              仅显示有下载状态
            </label>
            <button
              type="button"
              aria-label="切换开始时间排序"
              onClick={() => setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
              className="rounded border border-gray-600 bg-dota-bg px-3 py-1.5 text-sm text-gray-200 hover:border-gray-500"
            >
              排序：{sortOrder === 'desc' ? '最新优先' : '最旧优先'}
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <span>联赛快捷筛选</span>
              <select
                aria-label="联赛快捷筛选"
                value={selectedLeagueFilterKey}
                onChange={(event) => handleApplyLeagueQuickFilter(event.target.value)}
                disabled={focusLatestLeague}
                className="rounded border border-gray-600 bg-dota-bg px-2.5 py-1.5 text-sm text-gray-200 focus:border-dota-primary focus:outline-none"
              >
                <option value="all">全部</option>
                {leagueQuickFilterOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                aria-label="聚焦：最近联赛"
                type="checkbox"
                checked={focusLatestLeague}
                onChange={(event) => setFocusLatestLeague(event.target.checked)}
                className="h-4 w-4 rounded border-gray-500 bg-dota-bg"
              />
              聚焦：最近联赛
            </label>
            <button
              type="button"
              aria-label="在比赛数据库打开当前可见项"
              onClick={handleOpenVisibleInMatchDatabase}
              disabled={isVisibleBatchActionRunning || currentTeamId === null}
              className="rounded border border-cyan-700/60 bg-cyan-900/20 px-3 py-1.5 text-sm text-cyan-200 hover:border-cyan-500/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
              在比赛数据库打开当前可见项
            </button>
            <button
              type="button"
              aria-label="准备当前可见比赛"
              onClick={() => {
                void handlePrepareVisibleMatches();
              }}
              disabled={isVisibleBatchActionRunning || visibleMatches.length === 0}
              className="rounded border border-emerald-700/60 bg-emerald-900/20 px-3 py-1.5 text-sm text-emerald-200 hover:border-emerald-500/60 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
              {isPreparingVisibleMatches ? '正在准备当前可见比赛...' : '准备当前可见比赛'}
            </button>
            <button
              type="button"
              aria-label="准备并打开首场回放（可见）"
              onClick={() => {
                void handlePrepareAndOpenFirstVisibleReplay();
              }}
              disabled={isVisibleBatchActionRunning || visibleMatches.length === 0}
              className="rounded border border-fuchsia-700/60 bg-fuchsia-900/20 px-3 py-1.5 text-sm text-fuchsia-200 hover:border-fuchsia-500/60 hover:text-fuchsia-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
              {isPreparingAndOpeningVisibleReplay
                ? '正在准备可见比赛并打开回放...'
                : '准备并打开首场回放（可见）'}
            </button>
            <button
              type="button"
              aria-label="导出可见比赛（.txt）"
              onClick={handleExportVisibleMatches}
              disabled={visibleMatches.length === 0 || isVisibleBatchActionRunning}
              className="rounded border border-orange-700/60 bg-orange-900/20 px-3 py-1.5 text-sm text-orange-200 hover:border-orange-500/60 hover:text-orange-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
              导出可见比赛（.txt）
            </button>
            <button
              type="button"
              aria-label="复制可见比赛 ID"
              onClick={() => {
                void handleCopyVisibleMatchIds();
              }}
              disabled={visibleMatches.length === 0 || isVisibleBatchActionRunning}
              className="rounded border border-indigo-700/60 bg-indigo-900/20 px-3 py-1.5 text-sm text-indigo-200 hover:border-indigo-500/60 hover:text-indigo-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
              复制可见比赛 ID
            </button>
            <span className="text-xs text-gray-500">
              已按联赛分组。当前显示 {filteredMatches.length} / {matches.length} 场比赛。
            </span>
            {focusLatestLeague && (
              <span className="text-xs text-fuchsia-300">
                聚焦已开启：锁定到当前筛选结果中的最近联赛。
              </span>
            )}
          </div>
        </div>

        {visiblePrepareSummary && (
          <div
            data-testid="prepare-visible-summary"
            className="mb-4 rounded border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-emerald-100"
          >
            {visiblePrepareSummary.action === 'prepare_visible'
              ? '准备当前可见比赛完成：'
              : visiblePrepareSummary.action === 'prepare_selected_leagues'
                ? '准备已选联赛完成：'
              : '准备并打开首场回放（可见）完成：'}{' '}
            总计 {visiblePrepareSummary.total} / 成功 {visiblePrepareSummary.success} / 失败{' '}
            {visiblePrepareSummary.failed}
            {visiblePrepareSummary.action === 'prepare_open_first_visible' &&
            typeof visiblePrepareSummary.openedMatchId === 'number'
              ? ` / 已打开回放 ${visiblePrepareSummary.openedMatchId}`
              : ''}
          </div>
        )}

        <div className="mb-5 rounded-lg border border-gray-700 bg-dota-surface p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-dota-gold">操作历史</h2>
              <span className="text-xs text-gray-500">仅会话内有效，最多保留最近 {ACTION_HISTORY_LIMIT} 条。</span>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-300">
                <span>历史筛选</span>
              <select
                aria-label="历史筛选"
                value={historyFilterKey}
                onChange={(event) => setHistoryFilterKey(event.target.value as ActionHistoryFilterKey)}
                className="rounded border border-gray-600 bg-dota-bg px-2.5 py-1.5 text-sm text-gray-200 focus:border-dota-primary focus:outline-none"
              >
                {ACTION_HISTORY_FILTER_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
                aria-label="重放可见历史"
              onClick={() => {
                void handleReplayVisibleHistory();
              }}
              disabled={
                visibleActionHistory.length === 0 ||
                isVisibleBatchActionRunning ||
                activeReplayHistoryId !== null
              }
              className="rounded border border-cyan-700/60 bg-cyan-900/20 px-3 py-1.5 text-xs text-cyan-200 hover:border-cyan-500/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
              {isReplayingVisibleHistory ? '正在重放可见历史...' : '重放可见历史'}
            </button>
            <button
              type="button"
               aria-label="清除可见历史"
              onClick={handleClearVisibleHistory}
              disabled={visibleActionHistory.length === 0}
              className="rounded border border-orange-700/60 bg-orange-900/20 px-3 py-1.5 text-xs text-orange-200 hover:border-orange-500/60 hover:text-orange-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
               清除可见历史
            </button>
            <button
              type="button"
               aria-label="清除全部历史"
              onClick={handleClearAllHistory}
              disabled={actionHistory.length === 0}
              className="rounded border border-rose-700/60 bg-rose-900/20 px-3 py-1.5 text-xs text-rose-200 hover:border-rose-500/60 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
            >
               清除全部历史
            </button>
          </div>
          {actionHistory.length === 0 ? (
            <div className="rounded border border-gray-700 bg-dota-bg/70 px-4 py-3 text-sm text-gray-400">
               暂无操作记录。
            </div>
          ) : visibleActionHistory.length === 0 ? (
            <div className="rounded border border-gray-700 bg-dota-bg/70 px-4 py-3 text-sm text-gray-400">
               当前筛选下无历史记录。
            </div>
          ) : (
            <div className="space-y-2" data-testid="action-history-list">
              {visibleActionHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-700 bg-dota-bg/70 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-100">{entry.actionName}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(entry.executedAtMs).toLocaleTimeString()} | {entry.summary}
                    </p>
                    <p className="text-xs text-gray-500">
                      最近执行：{entry.lastRunStatus === 'succeeded' ? '成功' : '失败'}（{new Date(entry.lastRunAt).toLocaleTimeString()}） |{' '}
                      {entry.lastRunMessage}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.lastRunStatus === 'failed' && (
                      <button
                        type="button"
                         aria-label={`重试操作 ${entry.actionName}`}
                        onClick={() => {
                          void handleReplayAction(entry, 'retry');
                        }}
                        disabled={activeReplayHistoryId !== null || isVisibleBatchActionRunning}
                        className="rounded border border-amber-700/60 bg-amber-900/20 px-3 py-1.5 text-xs text-amber-200 hover:border-amber-500/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                      >
                        {activeReplayHistoryId === entry.id ? '重试中...' : '重试'}
                      </button>
                    )}
                    <button
                      type="button"
                       aria-label={`重放操作 ${entry.actionName}`}
                      onClick={() => {
                        void handleReplayAction(entry);
                      }}
                      disabled={activeReplayHistoryId !== null || isVisibleBatchActionRunning}
                      className="rounded border border-cyan-700/60 bg-cyan-900/20 px-3 py-1.5 text-xs text-cyan-200 hover:border-cyan-500/60 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                    >
                      {activeReplayHistoryId === entry.id ? '重放中...' : '重放操作'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {currentTeamId !== null && (
          <div className="mb-5 rounded-lg border border-gray-700 bg-dota-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-dota-gold">赛事摘要</h2>
              <span className="text-xs text-gray-500">
                基于当前战队档案视图（显示 {filteredMatches.length} 场）。
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded border border-gray-700 bg-dota-bg/70 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">总比赛数</p>
                <p className="mt-1 text-2xl font-semibold text-white">{tournamentSummary.totalMatches}</p>
              </div>
              <div className="rounded border border-gray-700 bg-dota-bg/70 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">赛事数</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {tournamentSummary.tournamentsCount}
                </p>
              </div>
              <div className="rounded border border-gray-700 bg-dota-bg/70 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">最近比赛</p>
                <p className="mt-1 text-base font-medium text-white">
                  {formatUnixTimestampLocal(tournamentSummary.recentMatchStartTime)}
                </p>
              </div>
            </div>
          </div>
        )}

        {currentTeamId !== null && (
          <div className="mb-5 rounded-lg border border-gray-700 bg-dota-surface p-5" data-testid="league-compare">
            <div className="mb-3 flex items-center justify-between gap-3">
               <h2 className="text-xl font-semibold text-dota-gold">联赛对比</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                   aria-label="固定榜首联赛"
                  onClick={handlePinTopLeague}
                  disabled={!canPinTopLeague}
                  className="rounded border border-cyan-700/50 px-3 py-1.5 text-xs text-cyan-200 hover:border-cyan-500/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                >
                   固定榜首联赛
                </button>
                <button
                  type="button"
                   aria-label="应用已选联赛"
                  onClick={handleApplySelectedLeagues}
                  disabled={leagueCompareItems.length === 0 || selectedLeagueCompareKeys.length === 0}
                  className="rounded border border-emerald-700/50 px-3 py-1.5 text-xs text-emerald-200 hover:border-emerald-500/50 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                >
                   应用已选联赛
                </button>
                <button
                  type="button"
                   aria-label="准备已选联赛"
                  onClick={() => {
                    void handlePrepareSelectedLeagues();
                  }}
                  disabled={
                    selectedLeagueCompareVisibleMatches.length === 0 || isVisibleBatchActionRunning
                  }
                  className="rounded border border-emerald-700/50 px-3 py-1.5 text-xs text-emerald-200 hover:border-emerald-500/50 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                >
                  {isPreparingSelectedLeagues
                    ? '正在准备已选联赛...'
                    : '准备已选联赛'}
                </button>
                <button
                  type="button"
                   aria-label="导出对比选择（.txt）"
                  onClick={handleExportCompareSelection}
                  disabled={
                    selectedLeagueCompareVisibleMatches.length === 0 || isVisibleBatchActionRunning
                  }
                  className="rounded border border-orange-700/50 px-3 py-1.5 text-xs text-orange-200 hover:border-orange-500/50 hover:text-orange-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                >
                   导出对比选择（.txt）
                </button>
                <button
                  type="button"
                   aria-label="打开对比首 3 场回放"
                  onClick={() => {
                    void handleOpenCompareFirst3Replays();
                  }}
                  disabled={compareSelectedVisibleTop3Matches.length === 0 || isVisibleBatchActionRunning}
                  className="rounded border border-fuchsia-700/50 px-3 py-1.5 text-xs text-fuchsia-200 hover:border-fuchsia-500/50 hover:text-fuchsia-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                >
                  {isOpeningCompareFirstReplays
                    ? '正在打开对比首 3 场回放...'
                    : '打开对比首 3 场回放'}
                </button>
                <button
                  type="button"
                   aria-label="清除选择"
                  onClick={handleClearLeagueSelection}
                  disabled={
                    leagueCompareItems.length === 0 &&
                    selectedLeagueCompareKeys.length === 0 &&
                    appliedLeagueCompareFilterKeys.length === 0
                  }
                  className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                >
                   清除选择
                </button>
                <span className="text-xs text-gray-500">
                   当前结果集中按比赛数排序的前 5 联赛。
                </span>
                {selectedLeagueCompareKeys.length > 0 && (
                  <span className="text-xs text-gray-500">
                     已选可见比赛：{selectedLeagueCompareVisibleMatches.length}
                  </span>
                )}
              </div>
            </div>
            {appliedLeagueCompareFilterKeys.length > 0 && (
              <div className="mb-3 rounded border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-100">
                 联赛对比多选筛选已启用：已选择 {appliedLeagueCompareFilterKeys.length} 个联赛。
              </div>
            )}
            {leagueCompareItems.length === 0 ? (
              <div className="rounded border border-gray-700 bg-dota-bg/70 px-4 py-3 text-sm text-gray-400">
                 暂无联赛对比数据。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[700px] w-full text-left text-sm">
                  <thead className="bg-gradient-to-r from-gray-900 to-gray-800 uppercase text-gray-300">
                    <tr>
                       <th className="px-3 py-2.5 font-semibold">选择</th>
                       <th className="px-3 py-2.5 font-semibold">联赛</th>
                       <th className="px-3 py-2.5 font-semibold">场次</th>
                       <th className="px-3 py-2.5 font-semibold">平均时长</th>
                       <th className="px-3 py-2.5 font-semibold">最近比赛</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {leagueCompareItems.map((item) => (
                      <tr key={item.key} data-testid={`league-compare-row-${item.key}`} className="hover:bg-white/5">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                             aria-label={`选择联赛对比 ${item.label}`}
                            checked={selectedLeagueCompareKeys.includes(item.key)}
                            onChange={(event) =>
                              handleToggleLeagueCompareSelection(item.key, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-gray-500 bg-dota-bg"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                             aria-label={`应用联赛对比筛选 ${item.label}`}
                            onClick={() => handleApplyLeagueQuickFilter(item.key)}
                            className="rounded border border-cyan-700/50 px-2.5 py-1 text-left text-cyan-200 hover:border-cyan-500/50 hover:text-cyan-100"
                          >
                            {item.label}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-gray-200">{item.matchCount}</td>
                        <td className="px-3 py-2.5 text-gray-300">
                          {item.averageDurationSeconds === null
                            ? '--'
                            : formatDurationClock(item.averageDurationSeconds)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-300">
                          {formatUnixTimestampLocal(item.recentMatchStartTime)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {feedback && (
          <div className="mb-4 rounded border border-blue-600 bg-blue-900/20 px-4 py-3 text-blue-100">
            {feedback}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded border border-red-600 bg-red-900/20 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-700 bg-dota-surface px-4 py-8 text-center text-gray-400">
             加载中...
          </div>
        ) : currentTeamId === null ? (
          <div className="rounded-lg border border-gray-700 bg-dota-surface px-4 py-8 text-center text-gray-400">
             请输入战队 ID 并点击查询。
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-dota-surface px-4 py-8 text-center text-gray-400">
             未找到 team_id 为 {currentTeamId} 的近期比赛。
          </div>
        ) : groupedMatches.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-dota-surface px-4 py-8 text-center text-gray-400">
             当前筛选条件下没有匹配比赛。
          </div>
        ) : (
          <div className="space-y-4">
            {onlyWithDownloadStatus && !hasAnyDownloadMetadata && (
              <div className="rounded border border-yellow-700/50 bg-yellow-900/20 px-4 py-3 text-yellow-200">
                 当前数据不包含下载状态字段，已展示全部比赛。
              </div>
            )}
            {groupedMatches.map((group) => (
              <div
                key={group.key}
                data-testid={`league-group-${group.key}`}
                className="overflow-hidden rounded-lg border border-gray-700 bg-dota-surface shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-gray-700 bg-gray-900/50 px-4 py-3">
                  <div>
                    <h2 className="text-lg font-semibold text-dota-gold">{group.label}</h2>
                    <p className="text-xs text-gray-400">
                       最近比赛：{formatUnixTimestampLocal(group.matches[0]?.start_time)}
                    </p>
                    <p className="text-xs text-gray-500">
                       {group.matches.length} 场 | 平均时长：{getGroupAverageDuration(group)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                       aria-label={`在比赛数据库打开联赛 ${group.label}`}
                      onClick={() => handleOpenInMatchDatabase(group.leagueId)}
                      disabled={!currentTeamId || group.leagueId === undefined || group.leagueId === null}
                      title={
                        group.leagueId === undefined || group.leagueId === null
                           ? '不可用：该分组缺少 leagueid。'
                           : '在比赛数据库中打开该战队 + 联赛筛选。'
                      }
                      className="rounded border border-cyan-700/50 px-3 py-1.5 text-xs text-cyan-200 hover:border-cyan-500/50 hover:text-cyan-100 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                    >
                       在比赛数据库中打开
                    </button>
                    <button
                      type="button"
                       aria-label={`切换分组 ${group.label}`}
                      onClick={() => toggleGroupCollapsed(group.key)}
                      className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-200 hover:border-gray-500"
                    >
                       {getGroupViewState(group.key) === 'expanded' ? '折叠' : '展开'} |{' '}
                       {getGroupViewState(group.key) === 'expanded' ? '已展开' : '已折叠'} |{' '}
                       {group.matches.length} 场
                    </button>
                  </div>
                </div>
                {getGroupViewState(group.key) === 'expanded' ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-[960px] w-full text-left">
                      <thead className="bg-gradient-to-r from-gray-900 to-gray-800 text-sm uppercase text-gray-300">
                        <tr>
                           <th className="px-4 py-3 font-semibold">比赛 ID</th>
                           <th className="px-4 py-3 font-semibold">开始时间</th>
                           <th className="px-4 py-3 font-semibold">时长</th>
                           <th className="px-4 py-3 font-semibold">阵营</th>
                           <th className="px-4 py-3 font-semibold">天辉战队 ID</th>
                           <th className="px-4 py-3 font-semibold">夜魇战队 ID</th>
                           <th className="px-4 py-3 font-semibold">联赛 ID</th>
                           <th className="px-4 py-3 font-semibold text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {group.matches.map((match) => (
                          <tr key={match.match_id} className="hover:bg-white/5">
                            <td
                              className="px-4 py-3 font-mono text-dota-gold"
                              data-testid="team-profile-match-id"
                            >
                              {match.match_id}
                            </td>
                            <td
                              className="px-4 py-3 text-gray-300"
                              title={match.start_time !== undefined ? String(match.start_time) : '--'}
                            >
                              {formatUnixTimestampLocal(match.start_time)}
                            </td>
                            <td className="px-4 py-3 text-gray-300">{formatDurationClock(match.duration)}</td>
                            <td className="px-4 py-3 text-gray-300">
                              {currentTeamId ? getTeamTag(match, currentTeamId) : '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-300">{match.radiant_team_id ?? '--'}</td>
                            <td className="px-4 py-3 text-gray-300">{match.dire_team_id ?? '--'}</td>
                            <td className="px-4 py-3 text-gray-300">{match.leagueid ?? '--'}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() =>
                                    onOpenReplay?.({
                                      source: 'team_profile',
                                      matchId: match.match_id,
                                    })
                                  }
                                  className="rounded border border-amber-700/50 px-3 py-1.5 text-sm text-amber-300 hover:border-amber-500/50 hover:text-amber-200"
                                >
                                  打开回放
                                </button>
                                <button
                                  onClick={() => {
                                    void handlePrepareAndOpenReplay(match.match_id);
                                  }}
                                  disabled={
                                    activePrepareAndOpenMatchId === match.match_id ||
                                    isVisibleBatchActionRunning
                                  }
                                  className="rounded border border-teal-700/50 px-3 py-1.5 text-sm text-teal-200 hover:border-teal-500/50 hover:text-teal-100 disabled:opacity-50"
                                >
                                  准备并打开回放
                                </button>
                                <button
                                  onClick={() => {
                                    void handlePrepareDownload(match.match_id);
                                  }}
                                  disabled={
                                    activePrepareMatchId === match.match_id || isVisibleBatchActionRunning
                                  }
                                  className="rounded border border-blue-700/50 px-3 py-1.5 text-sm text-blue-300 hover:border-blue-500/50 hover:text-blue-200 disabled:opacity-50"
                                >
                                  准备下载
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                   <div className="px-4 py-3 text-sm text-gray-400">分组已折叠。</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamProfilePage;
