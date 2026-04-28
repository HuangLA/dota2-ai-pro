import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Database, Info, Loader2, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  RemoteMatchPlayer,
  RemoteMatchRecord,
  RemoteMatchSource,
  RemoteMatchStatusResponse,
  remoteService,
} from '../api/remoteService';
import { getHeroById, getHeroByName, getHeroIconUrl } from '../data/heroes';
import { formatDurationClock, formatUnixTimestampLocal } from './matchDatabaseFormatting';

const PAGE_LIMIT = 20;
const DEFAULT_LIST_SOURCES: RemoteMatchSource[] = ['pro'];
const SEARCH_SOURCES: RemoteMatchSource[] = ['pro', 'public'];
const FALLBACK_MATCH_BANNER_URL = '/assets/dota/minimap/minimap_game.png';

type MatchSide = 'radiant' | 'dire';

interface UnifiedSearchSpec {
  label: string;
  error?: string;
}

interface TeamRosterEntry {
  heroId: number | null;
  heroName: string;
  heroIconUrl: string | null;
  playerLabel: string | null;
  playerMeta: string | null;
}

function toOptionalInt(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeTeamSide(team: string | number | null | undefined): MatchSide | null {
  const normalized = String(team ?? '').trim().toLowerCase();
  if (team === 2 || normalized === '2' || normalized === 'radiant' || normalized === 'goodguys') {
    return 'radiant';
  }
  if (team === 3 || normalized === '3' || normalized === 'dire' || normalized === 'badguys') {
    return 'dire';
  }
  return null;
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
  return '路人';
}

function hasLeagueMetadata(
  match: Pick<
    RemoteMatchRecord,
    'leagueid' | 'league_name' | 'league_icon_url' | 'league_image_url' | 'league_banner_url' | 'league_logo_url'
  >
): boolean {
  return Boolean(
    match.leagueid ||
      match.league_name ||
      match.league_icon_url ||
      match.league_image_url ||
      match.league_banner_url ||
      match.league_logo_url
  );
}

function shouldRenderLeagueBadge(
  match: Pick<
    RemoteMatchRecord,
    'source' | 'leagueid' | 'league_name' | 'league_icon_url' | 'league_image_url' | 'league_banner_url' | 'league_logo_url'
  >
): boolean {
  return !(match.source === 'public' && !hasLeagueMetadata(match));
}

function getRosterTeamName(match: RemoteMatchRecord, side: MatchSide): string {
  const teamName =
    side === 'radiant'
      ? getTeamLabel(match.radiant_team_name ?? match.radiant_name, match.radiant_team_id)
      : getTeamLabel(match.dire_team_name ?? match.dire_name, match.dire_team_id);
  if (teamName !== '未知战队') {
    return teamName;
  }
  if (match.source === 'public') {
    return side === 'radiant' ? '天辉' : '夜魇';
  }
  return teamName;
}

function shouldShowRosterTeamName(teamName: string): boolean {
  const normalized = teamName.trim().toLowerCase();
  return Boolean(normalized) && !['radiant', 'dire', '天辉', '夜魇', '未知战队'].includes(normalized);
}

function buildLeagueSearchQuery(match: RemoteMatchRecord, leagueName: string): string {
  return match.leagueid ? `联赛 ${match.leagueid}` : `联赛 ${leagueName}`;
}

function buildTeamSearchQuery(match: RemoteMatchRecord, side: MatchSide, teamName: string): string {
  const teamId = side === 'radiant' ? match.radiant_team_id : match.dire_team_id;
  return teamId ? `战队 ${teamId}` : `战队 ${teamName}`;
}

function getWinnerSide(match: {
  winner_team?: string | number | null;
  radiant_win?: boolean | null;
  winner_name?: string | null;
  winner_display_name?: string | null;
}): MatchSide | null {
  const normalizedWinner = normalizeTeamSide(match.winner_team);
  if (normalizedWinner) {
    return normalizedWinner;
  }
  if (typeof match.radiant_win === 'boolean') {
    return match.radiant_win ? 'radiant' : 'dire';
  }

  const winnerName = `${match.winner_display_name ?? ''} ${match.winner_name ?? ''}`.toLowerCase();
  if (winnerName.includes('radiant') || winnerName.includes('天辉')) {
    return 'radiant';
  }
  if (winnerName.includes('dire') || winnerName.includes('夜魇')) {
    return 'dire';
  }

  return null;
}

function getPlayerDisplayName(player: RemoteMatchPlayer | string | null | undefined): string | null {
  if (typeof player === 'string') {
    return player.trim() || null;
  }
  if (!player) {
    return null;
  }

  const name = player.display_name ?? player.pro_name ?? player.persona_name ?? player.player_name;
  if (name && name.trim()) {
    return name.trim();
  }

  if (typeof player.account_id === 'number') {
    return `ID ${player.account_id}`;
  }

  return null;
}

function getPlayerMetaLabel(player: RemoteMatchPlayer | string | null | undefined): string | null {
  if (!player || typeof player === 'string') {
    return null;
  }
  return typeof player.account_id === 'number' ? `ID ${player.account_id}` : null;
}

function getTeamLineup(match: RemoteMatchRecord, side: MatchSide): Array<string | RemoteMatchPlayer> {
  const teamPlayers = side === 'radiant' ? match.radiant_players : match.dire_players;
  if (Array.isArray(teamPlayers) && teamPlayers.length > 0) {
    return teamPlayers;
  }

  const genericPlayers = Array.isArray(match.players) ? match.players : [];
  const filteredPlayers = genericPlayers.filter((player) => normalizeTeamSide(player.team) === side);
  if (filteredPlayers.length > 0) {
    return filteredPlayers;
  }

  const teamLineup = side === 'radiant' ? match.radiant_lineup : match.dire_lineup;
  if (Array.isArray(teamLineup) && teamLineup.length > 0) {
    return teamLineup;
  }

  const nestedLineup = match.lineup?.[side];
  return Array.isArray(nestedLineup) ? nestedLineup : [];
}

function getTeamRosterEntries(match: RemoteMatchRecord, side: MatchSide): TeamRosterEntry[] {
  return getTeamLineup(match, side)
    .map((entry) => {
      if (typeof entry === 'string') {
        const rawHeroName = entry.trim();
        const hero = getHeroByName(rawHeroName);
        const heroName = hero?.chineseName || hero?.localizedName || rawHeroName;
        return {
          heroId: hero?.id ?? null,
          heroName: heroName || '未知英雄',
          heroIconUrl: hero ? getHeroIconUrl(hero.id) : null,
          playerLabel: heroName || null,
          playerMeta: null,
        };
      }

      const heroId = typeof entry.hero_id === 'number' ? entry.hero_id : null;
      const hero = (heroId ? getHeroById(heroId) : undefined) ?? getHeroByName(entry.hero_name ?? '');
      const resolvedHeroId = hero?.id ?? heroId;
      return {
        heroId: resolvedHeroId,
        heroName: hero?.chineseName || hero?.localizedName || entry.hero_name?.trim() || (heroId ? `英雄 ${heroId}` : '未知英雄'),
        heroIconUrl: resolvedHeroId ? getHeroIconUrl(resolvedHeroId) : null,
        playerLabel: getPlayerDisplayName(entry),
        playerMeta: getPlayerMetaLabel(entry),
      };
    })
    .filter((entry) => Boolean(entry.heroName || entry.playerLabel));
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
  return { label: '未开始', className: 'border-slate-500/60 bg-slate-800/60 text-slate-300' };
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

function pickAssetUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

function pickLeagueAssetUrl(
  match: Pick<RemoteMatchRecord, 'league_icon_url' | 'league_image_url' | 'league_banner_url' | 'league_logo_url'>
): string | null {
  return pickAssetUrl(match.league_banner_url, match.league_image_url, match.league_icon_url, match.league_logo_url);
}

function MatchIcon({
  url,
  label,
  iconClassName,
  fallbackClassName,
  fallbackSizeClassName,
}: {
  url?: string | null;
  label: string;
  iconClassName?: string;
  fallbackClassName?: string;
  fallbackSizeClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  const isRadiantLabel = label === 'Radiant' || label === '天辉';
  const isDireLabel = label === 'Dire' || label === '夜魇';
  const fallbackText = isRadiantLabel ? '天' : isDireLabel ? '夜' : '联';
  const defaultFallbackClassName =
    isRadiantLabel
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : isDireLabel
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  const resolvedIconClassName =
    iconClassName ??
    'max-h-7 max-w-[56px] shrink-0 rounded border border-slate-600/40 bg-slate-900/60 object-contain';
  const resolvedFallbackClassName = fallbackClassName ?? defaultFallbackClassName;

  if (!url || broken) {
    return (
      <div
        title={`${label} 图标缺失`}
        className={`flex ${fallbackSizeClassName ?? 'h-7 w-7'} shrink-0 items-center justify-center rounded border border-dashed text-xs font-semibold ${resolvedFallbackClassName}`}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={`${label} 图标`}
      className={resolvedIconClassName}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

function LeagueBadge({
  match,
  leagueName,
  onSearch,
}: {
  match: RemoteMatchRecord;
  leagueName: string;
  onSearch: (query: string) => void;
}) {
  if (!shouldRenderLeagueBadge(match)) {
    return null;
  }

  const isPublic = match.source === 'public';
  const leagueSearchQuery = buildLeagueSearchQuery(match, leagueName);

  const handleLeagueSearch = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSearch(leagueSearchQuery);
  };

  return (
    <div
      data-testid={`live-league-badge-${match.match_id}`}
      className="open-live-league-meta"
    >
      <span>{isPublic ? '公开匹配' : '联赛档案'}</span>
      <button
        type="button"
        title={leagueName}
        aria-label={`搜索联赛 ${leagueName}`}
        className="open-live-league-token open-live-league-token-strong"
        onClick={handleLeagueSearch}
      >
        {leagueName}
      </button>
      {match.leagueid ? (
        <button
          type="button"
          aria-label={`搜索联赛 ID ${match.leagueid}`}
          className="open-live-league-token"
          onClick={handleLeagueSearch}
        >
          联赛 {match.leagueid}
        </button>
      ) : null}
      <span className="sr-only">{isPublic ? '路人来源' : '职业镜像'} 检索标签</span>
    </div>
  );
}

function getMatchBannerUrl(match: RemoteMatchRecord): string {
  return pickLeagueAssetUrl(match) ?? FALLBACK_MATCH_BANNER_URL;
}

function formatLiveMatchStartTime(timestamp?: number | null): string | null {
  if (timestamp === undefined || timestamp === null) {
    return null;
  }

  const fullTimestamp = formatUnixTimestampLocal(timestamp);
  if (fullTimestamp === '--') {
    return null;
  }

  return fullTimestamp.replace(/^\d{4}-/, '');
}

function describeUnifiedSearchQuery(rawQuery: string): UnifiedSearchSpec {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return { label: '职业镜像' };
  }

  const prefixed = trimmed.match(
    /^(match|match_id|player|player_id|player_name|league|league_id|league_name|team|team_id|team_name|比赛|玩家|联赛|战队|队伍)\s*[:：=]?\s*(.+)$/i
  );

  if (prefixed) {
    const key = prefixed[1].toLowerCase();
    const value = prefixed[2].trim();
    if (!value) {
      return { label: '无效输入', error: '请输入具体的搜索内容。' };
    }

    if (key.startsWith('match') || key === '比赛') {
      const matchId = toOptionalInt(value);
      if (matchId === undefined) {
        return { label: '无效输入', error: '比赛关键词后请输入数字比赛 ID。' };
      }
      return { label: `比赛 ${matchId}` };
    }

    if (key === 'player' || key === 'player_name' || key === '玩家') {
      const playerId = toOptionalInt(value);
      if (playerId !== undefined) {
        return { label: `玩家 ID ${playerId}` };
      }

      return { label: `玩家 ${value}` };
    }

    if (key === 'league' || key === 'league_name' || key === '联赛') {
      const leagueId = toOptionalInt(value);
      if (leagueId !== undefined) {
        return { label: `联赛 ID ${leagueId}` };
      }

      return { label: `联赛 ${value}` };
    }

    if (key === 'league_id') {
      const leagueId = toOptionalInt(value);
      if (leagueId === undefined) {
        return { label: '无效输入', error: 'league_id 之后请输入数字联赛 ID。' };
      }
      return { label: `联赛 ID ${leagueId}` };
    }

    if (key === 'player_id') {
      const playerId = toOptionalInt(value);
      if (playerId === undefined) {
        return { label: '无效输入', error: 'player_id 之后请输入数字玩家 ID。' };
      }
      return { label: `玩家 ID ${playerId}` };
    }

    if (key === 'team' || key === 'team_name' || key === '战队' || key === '队伍') {
      const teamId = toOptionalInt(value);
      if (teamId !== undefined) {
        return { label: `战队 ID ${teamId}` };
      }

      return { label: `战队 ${value}` };
    }

    if (key === 'team_id') {
      const teamId = toOptionalInt(value);
      if (teamId === undefined) {
        return { label: '无效输入', error: 'team_id 之后请输入数字战队 ID。' };
      }
      return { label: `战队 ID ${teamId}` };
    }
  }

  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length >= 10) {
      const matchId = Number.parseInt(trimmed, 10);
      return { label: `比赛 ${matchId}` };
    }

    if (trimmed.length >= 7) {
      const playerId = Number.parseInt(trimmed, 10);
      return { label: `玩家 ID ${playerId}` };
    }

    const leagueId = Number.parseInt(trimmed, 10);
    return { label: `联赛 ID ${leagueId}` };
  }

  return { label: `全域 ${trimmed}` };
}

function SearchPresetButton({
  value,
  children,
  onPick,
}: {
  value: string;
  children: React.ReactNode;
  onPick: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className="open-live-preset"
    >
      {children}
    </button>
  );
}

function TeamRosterCard({
  match,
  side,
  winnerSide,
  onSearch,
}: {
  match: RemoteMatchRecord;
  side: MatchSide;
  winnerSide: MatchSide | null;
  onSearch: (query: string) => void;
}) {
  const teamName = getRosterTeamName(match, side);
  const entries = getTeamRosterEntries(match, side);
  const isWinner = winnerSide === side;
  const sideLabel = side === 'radiant' ? '天辉' : '夜魇';
  const teamScore = side === 'radiant' ? match.radiant_score : match.dire_score;
  const showTeamName = shouldShowRosterTeamName(teamName);
  const statusText = [
    isWinner ? '获胜' : null,
    typeof teamScore === 'number' ? `击杀 ${teamScore}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const rosterText = entries
    .map((entry) => `${entry.playerLabel ?? '未知玩家'} ${entry.heroName}${entry.playerMeta ? ` ${entry.playerMeta}` : ''}`)
    .join(' ');
  const logoUrl = pickAssetUrl(
    side === 'radiant'
      ? match.radiant_icon_url ?? match.radiant_logo_url ?? match.radiant_logo_sponsor_url
      : match.dire_icon_url ?? match.dire_logo_url ?? match.dire_logo_sponsor_url
  );
  const teamSearchQuery = showTeamName ? buildTeamSearchQuery(match, side, teamName) : null;

  const handleTeamSearch = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (teamSearchQuery) {
      onSearch(teamSearchQuery);
    }
  };

  return (
    <div
      data-testid={`live-team-${side}-${match.match_id}`}
      className={`open-live-side ${side === 'dire' ? 'open-live-side-dire' : ''} ${isWinner ? 'open-live-side-winner' : ''}`}
    >
      <div className="open-live-side-head">
        <div className="open-live-side-title">
          <span>{sideLabel}</span>
          {showTeamName ? (
            <button
              type="button"
              title={teamName}
              aria-label={`搜索战队 ${teamName}`}
              className="open-live-side-team-button"
              onClick={handleTeamSearch}
            >
              {teamName}
            </button>
          ) : null}
        </div>
        <MatchIcon
          label={sideLabel}
          url={logoUrl}
          iconClassName="open-live-team-logo"
          fallbackClassName="open-live-team-logo-fallback"
          fallbackSizeClassName="h-8 w-8"
        />
      </div>

      <div className="open-live-hero-row">
        {entries.length > 0 ? (
          entries.slice(0, 5).map((entry, index) => (
            <div
              key={`${match.match_id}-${side}-entry-${index}-${entry.heroName}-${entry.playerLabel ?? 'unknown'}`}
              className="open-live-hero"
              title={`${entry.playerLabel ?? '未知玩家'} / ${entry.heroName}${entry.playerMeta ? ` / ${entry.playerMeta}` : ''}`}
            >
              {entry.heroIconUrl ? (
                <img
                  src={entry.heroIconUrl}
                  alt={entry.heroName}
                  loading="lazy"
                />
              ) : (
                <span>{entry.heroName.slice(0, 2)}</span>
              )}
            </div>
          ))
        ) : (
          <div className="open-live-hero-placeholder">--</div>
        )}
      </div>
      <span className="sr-only">{`${rosterText} ${statusText}`.trim()}</span>
    </div>
  );
}

interface LiveMatchStatus {
  downloadStatus: string;
  downloadProgress: number;
  parseStatus: string | null;
}

export function OpenDotaLivePage() {
  const [searchText, setSearchText] = useState('');
  const [appliedSearchText, setAppliedSearchText] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [matches, setMatches] = useState<RemoteMatchRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedMatchIds, setSelectedMatchIds] = useState<number[]>([]);
  const [actionMatchId, setActionMatchId] = useState<number | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [statusPanel, setStatusPanel] = useState<{
    matchId: number;
    loading: boolean;
    error: string | null;
    detail: RemoteMatchStatusResponse | null;
    autoPolling: boolean;
  } | null>(null);
  const [liveStatus, setLiveStatus] = useState<Map<number, LiveMatchStatus>>(new Map());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const searchSpec = useMemo(() => describeUnifiedSearchQuery(appliedSearchText), [appliedSearchText]);
  const hasSearchQuery = appliedSearchText.trim().length > 0;
  const searchModeLabel = hasSearchQuery ? searchSpec.label : '职业镜像';

  const applySearchQuery = useCallback((query: string) => {
    const normalizedQuery = query.trim();
    setSearchText(normalizedQuery);
    setAppliedSearchText(normalizedQuery);
    setOffset(0);
    setSelectedMatchIds([]);
    setStatusPanel(null);
    setSearchNotice(null);
    setFeedback(null);
  }, []);

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
          autoPolling: isTerminalPipelineStatus(detail.download_task?.status, detail.local_parse_status)
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

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearchNotice(null);

    try {
      const result = hasSearchQuery
        ? await remoteService.searchRemoteMatches({
            q: appliedSearchText,
            limit: PAGE_LIMIT,
            offset,
            sources: SEARCH_SOURCES,
          })
        : await remoteService.getRemoteMatches({
            limit: PAGE_LIMIT,
            offset,
            sources: DEFAULT_LIST_SOURCES,
          });

      const incomingMatches = result.matches ?? [];
      setMatches((current) => {
        if (offset === 0) {
          return incomingMatches;
        }

        const seen = new Set(current.map((match) => match.match_id));
        return [...current, ...incomingMatches.filter((match) => !seen.has(match.match_id))];
      });
      setTotal(result.total ?? 0);
      setSearchNotice(hasSearchQuery ? result.message ?? null : null);
      setLiveStatus((prev) => {
        const next = new Map(prev);
        for (const match of incomingMatches) {
          if (next.has(match.match_id)) {
            continue;
          }
          const rawStatus = (match.download_status ?? '').toLowerCase();
          if (!rawStatus || isTerminalPipelineStatus(rawStatus, match.local_parse_status)) {
            continue;
          }
          const progress =
            rawStatus === 'parsing' ? 50 : rawStatus === 'completed' ? 100 : rawStatus === 'prepared' ? 5 : 10;
          next.set(match.match_id, {
            downloadStatus: rawStatus,
            downloadProgress: progress,
            parseStatus: match.local_parse_status ?? null,
          });
        }
        return next;
      });
    } catch (fetchError) {
      console.error('Failed to fetch remote matches:', fetchError);
      if (offset === 0) {
        setMatches([]);
      }
      setTotal(0);
      setSearchNotice(null);
      setError(hasSearchQuery ? 'OpenDota 搜索失败，请重试。' : 'OpenDota 实时列表加载失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [appliedSearchText, hasSearchQuery, offset]);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    if (hasSearchQuery) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await remoteService.syncRemoteMatches({ sources: DEFAULT_LIST_SOURCES });
          await fetchMatches();
        } catch (autoSyncError) {
          console.error('Failed to auto-sync remote matches:', autoSyncError);
        }
      })();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [fetchMatches, hasSearchQuery]);

  useEffect(() => {
    if (!statusPanel || !statusPanel.autoPolling) {
      return;
    }
    if (
      isTerminalPipelineStatus(statusPanel.detail?.download_task?.status, statusPanel.detail?.local_parse_status)
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshStatusPanel(statusPanel.matchId, false);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [refreshStatusPanel, statusPanel]);

  useEffect(() => {
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

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || loading || matches.length >= total) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }
        setOffset((current) => {
          const nextOffset = current + PAGE_LIMIT;
          return nextOffset >= total ? current : nextOffset;
        });
      },
      { root: null, rootMargin: '220px 0px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, matches.length, total]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = describeUnifiedSearchQuery(searchText);
    if (parsed.error) {
      setFeedback({ type: 'error', message: parsed.error });
      return;
    }

    applySearchQuery(searchText);
  };

  const handleClear = () => {
    setSearchText('');
    setAppliedSearchText('');
    setOffset(0);
    setSelectedMatchIds([]);
    setSearchNotice(null);
    setFeedback(null);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setFeedback(null);

    try {
      const result = await remoteService.syncRemoteMatches({
        sources: DEFAULT_LIST_SOURCES,
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
        message: singleMatchId !== null ? `比赛 ${singleMatchId} 入库失败。` : `批量入库失败（${matchIds.length} 场）。`,
      });
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

  const loadedMatchIds = matches.map((match) => match.match_id).filter((matchId) => Number.isFinite(matchId) && matchId > 0);
  const selectedLoadedCount = loadedMatchIds.filter((matchId) => selectedMatchIds.includes(matchId)).length;
  const isAllLoadedSelected = loadedMatchIds.length > 0 && selectedLoadedCount === loadedMatchIds.length;
  const activePipelineCount = matches.filter((match) => {
    const live = liveStatus.get(match.match_id);
    return !isTerminalPipelineStatus(live?.downloadStatus ?? match.download_status, live?.parseStatus ?? match.local_parse_status);
  }).length;
  const replayReadyCount = matches.filter((match) => {
    const live = liveStatus.get(match.match_id);
    return resolvePipelineParseStatus(live?.downloadStatus ?? match.download_status, live?.parseStatus ?? match.local_parse_status) === 'completed';
  }).length;
  const canLoadMore = matches.length < total;
  const resultHeading = hasSearchQuery ? searchModeLabel : '职业赛事';
  const currentQueryLabel = hasSearchQuery ? appliedSearchText.trim() : '职业赛事';
  const selectedPreviewIds = selectedMatchIds.slice(0, 4);

  const handleToggleLoadedSelection = () => {
    setSelectedMatchIds((current) => {
      if (isAllLoadedSelected) {
        return current.filter((id) => !loadedMatchIds.includes(id));
      }
      return Array.from(new Set([...current, ...loadedMatchIds]));
    });
  };

  return (
    <div className="workspace-page open-live-page">
      <div className="open-live-shell">
        <section className="open-live-stage">
          <div className="open-live-map-field" aria-hidden="true" />
          <div className="open-live-stage-content">
            <form onSubmit={handleSearch} className="open-live-command">
              <span className="sr-only">统一搜索</span>
              <span className="open-live-command-icon" aria-hidden="true">
                <Search className="h-4 w-4" />
              </span>
              <input
                aria-label="统一搜索"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="8735428765 / Ame / DreamLeague / 玩家 86745912"
              />
              <button type="submit" className="open-live-command-button open-live-command-button-primary">
                <Search className="h-3.5 w-3.5" />
                查询
              </button>
              <button type="button" onClick={handleClear} className="open-live-command-button">
                <X className="h-3.5 w-3.5" />
                清空
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleManualSync();
                }}
                disabled={syncing}
                className="open-live-command-button"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                同步
              </button>
            </form>

            <div className="open-live-presets">
              <SearchPresetButton value="8735428765" onPick={setSearchText}>
                比赛 8735428765
              </SearchPresetButton>
              <SearchPresetButton value="Ame" onPick={setSearchText}>
                玩家 Ame
              </SearchPresetButton>
              <SearchPresetButton value="DreamLeague" onPick={setSearchText}>
                联赛 DreamLeague
              </SearchPresetButton>
              <SearchPresetButton value="联赛 15475" onPick={setSearchText}>
                联赛 15475
              </SearchPresetButton>
            </div>

            <div className="open-live-search-head">
              <div className="min-w-0">
                <p className="open-live-eyebrow">{hasSearchQuery ? 'Search Results' : 'Live Intake'}</p>
                <h1>{resultHeading}</h1>
                <span className="sr-only">{hasSearchQuery ? '远端搜索结果' : '实时比赛列表'}</span>
              </div>
              <div className="open-live-query-summary">
                <span>Current Query</span>
                <strong title={currentQueryLabel}>{currentQueryLabel}</strong>
              </div>
            </div>

            <div className="open-live-alerts">
              {feedback && (
                <div className={`open-live-alert ${feedback.type === 'success' ? 'open-live-alert-success' : 'open-live-alert-error'}`}>
                  {feedback.message}
                </div>
              )}
              {error && <div className="open-live-alert open-live-alert-error">{error}</div>}
              {searchNotice && <div className="open-live-alert open-live-alert-warning">{searchNotice}</div>}
            </div>

            <div className="open-live-results-field">
              <div className="open-live-radar" aria-hidden="true" />
              <div className="open-live-result-lane">
                {loading && offset === 0 ? (
                  <div className="open-live-empty">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {searchModeLabel}加载中...
                  </div>
                ) : matches.length === 0 ? (
                  <div className="open-live-empty">
                    {hasSearchQuery ? '未找到匹配的远端比赛。' : '未找到实时比赛。'}
                  </div>
                ) : (
                  matches.map((match) => {
                    const leagueName = getLeagueLabel(match.league_name, match.leagueid);
                    const winnerSide = getWinnerSide(match);
                    const ingesting = actionMatchId === match.match_id;
                    const live = liveStatus.get(match.match_id);
                    const liveParseStatus = live ? resolvePipelineParseStatus(live.downloadStatus, live.parseStatus) : null;
                    const effectiveDownloadStatus = live?.downloadStatus ?? match.download_status;
                    const effectiveParseStatus = live?.parseStatus ?? match.local_parse_status;
                    const pipelineBadge = getPipelineStatusBadge(effectiveDownloadStatus, effectiveParseStatus);
                    const sourceLabel = match.source === 'public' ? '公开匹配' : '职业赛事';
                    const winnerLabel = winnerSide === 'radiant' ? '天辉胜' : winnerSide === 'dire' ? '夜魇胜' : null;
                    const fullStartTimeLabel = formatUnixTimestampLocal(match.start_time);
                    const compactStartTimeLabel = formatLiveMatchStartTime(match.start_time);
                    const isSelected = selectedMatchIds.includes(match.match_id);
                    const cardStyle = {
                      '--open-live-banner': `url(${getMatchBannerUrl(match)})`,
                    } as React.CSSProperties & { '--open-live-banner': string };

                    return (
                      <article
                        key={match.match_id}
                        data-testid={`live-match-card-${match.match_id}`}
                        className={`open-live-result-card ${isSelected ? 'open-live-result-card-selected' : ''}`}
                        style={cardStyle}
                        onClick={() => {
                          setSelectedMatchIds((current) =>
                            current.includes(match.match_id)
                              ? current.filter((id) => id !== match.match_id)
                              : [...current, match.match_id]
                          );
                        }}
                      >
                        <div className="open-live-result-main">
                          <div className="open-live-result-top">
                            <span className="open-live-match-id">比赛 {match.match_id}</span>
                            <button
                              type="button"
                              aria-label={`选择比赛 ${match.match_id}`}
                              aria-pressed={isSelected}
                              className="open-live-select-control"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedMatchIds((current) =>
                                  current.includes(match.match_id)
                                    ? current.filter((id) => id !== match.match_id)
                                    : [...current, match.match_id]
                                );
                              }}
                            >
                              {isSelected ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  已勾选
                                </>
                              ) : (
                                <span aria-hidden="true" />
                              )}
                            </button>
                          </div>

                          <h2 title={leagueName}>
                            <button
                              type="button"
                              aria-label={`搜索联赛 ${leagueName}`}
                              className="open-live-title-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                applySearchQuery(buildLeagueSearchQuery(match, leagueName));
                              }}
                            >
                              {leagueName}
                            </button>
                          </h2>
                          <LeagueBadge match={match} leagueName={leagueName} onSearch={applySearchQuery} />
                        </div>

                        <div className="open-live-lineup-block">
                          <TeamRosterCard match={match} side="radiant" winnerSide={winnerSide} onSearch={applySearchQuery} />
                          <TeamRosterCard match={match} side="dire" winnerSide={winnerSide} onSearch={applySearchQuery} />
                        </div>

                        <div className="open-live-result-footer">
                          <div className="open-live-tag-list">
                            <span className={`open-live-tag ${match.source === 'public' ? 'open-live-tag-amber' : 'open-live-tag-cyan'}`}>
                              {sourceLabel}
                            </span>
                            {winnerLabel ? <span className="open-live-tag open-live-tag-green">{winnerLabel}</span> : null}
                            {compactStartTimeLabel ? (
                              <span className="open-live-tag open-live-tag-time" title={`比赛时间 ${fullStartTimeLabel}`}>
                                {compactStartTimeLabel}
                              </span>
                            ) : null}
                            <span className="open-live-tag">{formatDurationClock(match.duration)}</span>
                            <span className={`open-live-status-pill ${pipelineBadge.className}`}>{pipelineBadge.label}</span>
                          </div>

                          <div className="open-live-card-actions">
                            {live?.downloadStatus === 'downloading' ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCancel(match.match_id);
                                }}
                                className="open-live-card-button open-live-card-button-danger"
                              >
                                取消下载 {live.downloadProgress}%
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleIngest([match.match_id]);
                                }}
                                disabled={ingesting || batchLoading}
                                className="open-live-card-button open-live-card-button-ingest"
                              >
                                <Database className="h-3.5 w-3.5" />
                                {ingesting ? '入库中...' : '下载并入库'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async (event) => {
                                event.stopPropagation();
                                setStatusPanel({
                                  matchId: match.match_id,
                                  loading: true,
                                  error: null,
                                  detail: null,
                                  autoPolling: true,
                                });
                                await refreshStatusPanel(match.match_id, false);
                              }}
                              className="open-live-card-button"
                            >
                              <Info className="h-3.5 w-3.5" />
                              状态详情
                            </button>
                          </div>
                        </div>

                        {liveParseStatus === 'parsing' ? <div className="open-live-parse-bar" aria-hidden="true" /> : null}
                      </article>
                    );
                  })
                )}

                {matches.length > 0 ? (
                  <div ref={loadMoreRef} className="open-live-load-sentinel">
                    {loading && offset > 0 ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        加载中
                      </>
                    ) : canLoadMore ? (
                      <strong>加载更多</strong>
                    ) : (
                      <span>已加载 {matches.length} / {total}</span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <aside className="open-live-inspector">
          <div className="open-live-inspector-scroll">
            <section className="open-live-section">
              <p className="open-live-eyebrow">Facets</p>
              <h2><SlidersHorizontal className="h-4 w-4" />筛选</h2>
              <div className="open-live-filter-list">
                <div className="open-live-filter-row"><span>来源</span><strong>{hasSearchQuery ? '职业 + 公开' : '职业'}</strong></div>
                <div className="open-live-filter-row"><span>状态</span><strong>未入库优先</strong></div>
                <div className="open-live-filter-row"><span>联赛</span><strong>{hasSearchQuery ? searchModeLabel.replace(/^全域\s+/, '') : 'OpenDota'}</strong></div>
                <div className="open-live-filter-row"><span>排序</span><strong>时间 / 相关度</strong></div>
              </div>
            </section>

            <section className="open-live-section">
              <p className="open-live-eyebrow">Batch Intake</p>
              <h2><Database className="h-4 w-4" />批量入库</h2>
              <div data-testid="live-batch-button-row" className="workspace-action-row open-live-batch-actions">
                <button
                  type="button"
                  onClick={() => {
                    void handleIngest(selectedMatchIds);
                  }}
                  disabled={selectedMatchIds.length === 0 || batchLoading || actionMatchId !== null}
                  className="open-live-large-action"
                >
                  {batchLoading ? '批量入库中...' : '下载选中并入库'}
                </button>
              </div>
              <div className="open-live-mini-list">
                <div className="open-live-mini-row"><span>已加载</span><strong>{matches.length} / {total}</strong></div>
                <div className="open-live-mini-row"><span>流水线</span><strong>{activePipelineCount}</strong></div>
                <div className="open-live-mini-row"><span>可回放</span><strong>{replayReadyCount}</strong></div>
              </div>

              {selectedMatchIds.length > 0 ? (
                <div className="open-live-selected-block">
                  <div className="open-live-mini-row"><span>已勾选</span><strong>{selectedMatchIds.length}</strong></div>
                  {selectedPreviewIds.map((matchId) => (
                    <div key={matchId} className="open-live-mini-row"><span>{matchId}</span><strong>selected</strong></div>
                  ))}
                  {selectedMatchIds.length > selectedPreviewIds.length ? (
                    <div className="open-live-mini-row"><span>更多</span><strong>+{selectedMatchIds.length - selectedPreviewIds.length}</strong></div>
                  ) : null}
                </div>
              ) : null}

              <div className="open-live-side-buttons">
                <button type="button" onClick={handleToggleLoadedSelection} disabled={loadedMatchIds.length === 0}>
                  {isAllLoadedSelected ? '取消已加载' : '全选已加载'}
                </button>
                <button type="button" onClick={() => setSelectedMatchIds([])} disabled={selectedMatchIds.length === 0}>
                  清空勾选
                </button>
              </div>
            </section>
          </div>
        </aside>
      </div>

      {statusPanel && (
        <div className="open-live-status-drawer">
          <div className="open-live-status-head">
            <div>
              <h2>下载/解析状态</h2>
              <p>match_id: {statusPanel.matchId}</p>
              <span>{statusPanel.autoPolling ? '自动轮询中' : '自动轮询已停止'}</span>
            </div>
            <div className="open-live-status-actions">
              <button
                type="button"
                onClick={() => {
                  void refreshStatusPanel(statusPanel.matchId, true);
                }}
              >
                刷新
              </button>
              <button
                type="button"
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
              >
                {statusPanel.autoPolling ? '停止轮询' : '开启轮询'}
              </button>
              <button type="button" onClick={() => setStatusPanel(null)}>
                关闭
              </button>
            </div>
          </div>

          <div className="open-live-status-body">
            {statusPanel.loading && <div className="open-live-status-item">状态加载中...</div>}
            {statusPanel.error && <div className="open-live-status-item open-live-alert-error">{statusPanel.error}</div>}
            {statusPanel.detail && (
              <>
                <div className="open-live-status-item">
                  <div className="open-live-status-chip-row">
                    <span
                      className={`open-live-status-pill ${getPipelineStatusBadge(
                        statusPanel.detail.download_task?.status,
                        statusPanel.detail.local_parse_status
                      ).className}`}
                    >
                      {getPipelineStatusBadge(statusPanel.detail.download_task?.status, statusPanel.detail.local_parse_status).label}
                    </span>
                    {typeof statusPanel.detail.download_task?.progress === 'number' ? (
                      <span>下载 {statusPanel.detail.download_task.progress}%</span>
                    ) : null}
                  </div>
                  {typeof statusPanel.detail.download_task?.progress === 'number' ? (
                    <div className="open-live-progress">
                      <div style={{ width: `${statusPanel.detail.download_task.progress}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="open-live-status-item"><span>下载阶段</span><strong>{getDownloadStatusBadge(statusPanel.detail.download_task?.status).label}</strong></div>
                <div className="open-live-status-item"><span>下载错误</span><strong>{statusPanel.detail.download_task?.error_code ?? '--'}{statusPanel.detail.download_task?.error_message ? `: ${statusPanel.detail.download_task.error_message}` : ''}</strong></div>
                <div className="open-live-status-item"><span>解析阶段</span><strong>{getParseStatusBadge(statusPanel.detail.local_parse_status).label}</strong></div>
                <div className="open-live-status-item"><span>文件状态</span><strong>DEM {statusPanel.detail.replay_dem_exists ? '已生成' : '缺失'} | 压缩包 {statusPanel.detail.replay_bz2_exists ? '已保留' : '缺失'}</strong></div>
                <div className="open-live-status-item"><span>本地录像路径</span><strong>{statusPanel.detail.local_replay_path ?? '--'}</strong></div>
              </>
            )}
          </div>
        </div>
      )}
      </div>
  );
}

export default OpenDotaLivePage;
