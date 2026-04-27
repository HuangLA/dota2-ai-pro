import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

function pickLeagueAssetVariant(
  match: Pick<RemoteMatchRecord, 'league_image_url' | 'league_banner_url'>
): 'banner' | 'logo' {
  return match.league_banner_url || match.league_image_url ? 'banner' : 'logo';
}

function LeagueArtwork({
  match,
  leagueName,
  subtitle,
  archiveLabel,
}: {
  match: RemoteMatchRecord;
  leagueName: string;
  subtitle: string;
  archiveLabel: string;
}) {
  const [broken, setBroken] = useState(false);
  const assetUrl = pickLeagueAssetUrl(match);
  const leagueAssetVariant = pickLeagueAssetVariant(match);
  const tagShellClass =
    match.source === 'public'
      ? 'border-amber-400/30 bg-amber-500/14 text-amber-100'
      : 'border-cyan-400/30 bg-cyan-500/14 text-cyan-100';

  if (!assetUrl || broken) {
    return (
      <div className="relative isolate w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 shadow-inner">
        <div className="relative flex min-h-[84px] items-end p-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tagShellClass}`}>
                {archiveLabel}
              </span>
              {match.leagueid ? (
                <span className="inline-flex items-center border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  联赛 {match.leagueid}
                </span>
              ) : null}
            </div>
            <p className="max-w-[560px] truncate text-sm font-bold leading-tight text-white uppercase tracking-tight" title={leagueName}>
              {leagueName}
            </p>
            <p className="mt-1 text-[10px] leading-none text-zinc-500 uppercase tracking-[0.1em]">{subtitle}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <img
        src={assetUrl}
        alt={`${leagueName} 背景`}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/60 to-zinc-950/90" />
      <div className="relative flex h-[88px] items-stretch">
        <div
          className={`min-w-0 flex-1 ${
            leagueAssetVariant === 'banner' ? 'flex items-center justify-center px-3 py-2.5' : 'flex items-center justify-center px-5 py-3'
          }`}
        >
          <img
            src={assetUrl}
            alt={`${leagueName} 横幅`}
            className={`h-full w-full drop-shadow-[0_18px_32px_rgba(15,23,42,0.42)] ${
              leagueAssetVariant === 'banner' ? 'object-contain object-center' : 'object-contain object-center'
            }`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap justify-between gap-2 p-2">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold backdrop-blur ${tagShellClass}`}>
            {archiveLabel}
          </span>
          {match.leagueid ? (
            <span className="inline-flex items-center rounded-full border border-white/12 bg-slate-950/48 px-2.5 py-1 text-[10px] font-semibold text-white/85 backdrop-blur">
              联赛 {match.leagueid}
            </span>
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
          <div className="max-w-[min(78%,420px)] rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 backdrop-blur-md">
            <p className="truncate text-sm font-semibold leading-5 text-white" title={leagueName}>
              {leagueName}
            </p>
            <p className="text-[10px] leading-4 tracking-[0.05em] text-slate-300">{subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
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
  const fallbackText = label === 'Radiant' ? '天' : label === 'Dire' ? '夜' : '联';
  const defaultFallbackClassName =
    label === 'Radiant'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : label === 'Dire'
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
}: {
  match: RemoteMatchRecord;
  leagueName: string;
}) {
  if (!shouldRenderLeagueBadge(match)) {
    return null;
  }

  const isPublic = match.source === 'public';
  const shellClass = isPublic
    ? 'border-amber-500/40 bg-[linear-gradient(135deg,rgba(120,53,15,0.32),rgba(15,23,42,0.94))]'
    : 'border-amber-500/35 bg-[linear-gradient(135deg,rgba(146,64,14,0.18),rgba(15,23,42,0.94))]';
  const subtitle = isPublic ? '公开匹配 / 路人来源' : '联赛 / 训练赛镜像';
  const archiveLabel = isPublic ? '路人来源' : '联赛档案';
  const metaCards = [
    { label: '赛道', value: isPublic ? '公开匹配' : '职业镜像' },
    { label: '数据状态', value: hasLeagueMetadata(match) ? '联赛元数据已就绪' : '仅比赛摘要' },
    { label: '最近同步', value: match.last_synced_at ? formatUnixTimestampLocal(match.last_synced_at) : '等待刷新' },
    { label: '检索标签', value: leagueName },
  ];

  return (
    <div
      data-testid={`live-league-badge-${match.match_id}`}
      className={`w-full rounded-[20px] border px-3 py-3 shadow-[0_10px_26px_rgba(2,6,23,0.18)] ${shellClass}`}
    >
      <LeagueArtwork match={match} leagueName={leagueName} subtitle={subtitle} archiveLabel={archiveLabel} />
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
        {metaCards.map((item) => (
          <div
            key={`${match.match_id}-${item.label}`}
            className="rounded-xl border border-slate-700/60 bg-slate-950/55 px-2.5 py-2"
          >
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-100" title={item.value}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function describeUnifiedSearchQuery(rawQuery: string): UnifiedSearchSpec {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return { label: '职业镜像' };
  }

  const prefixed = trimmed.match(
    /^(match|match_id|player|player_id|player_name|league|league_id|league_name|比赛|玩家|联赛)\s*[:：=]?\s*(.+)$/i
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
      className="rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-100"
    >
      {children}
    </button>
  );
}

function TeamRosterCard({
  match,
  side,
  winnerSide,
}: {
  match: RemoteMatchRecord;
  side: MatchSide;
  winnerSide: MatchSide | null;
}) {
  const teamName = getRosterTeamName(match, side);
  const entries = getTeamRosterEntries(match, side);
  const isWinner = winnerSide === side;
  const accentClass =
    side === 'radiant'
      ? isWinner
        ? 'border-emerald-500/45 bg-emerald-950/45 shadow-[0_20px_60px_rgba(16,185,129,0.08)]'
        : 'border-slate-700/80 bg-slate-950/75'
      : isWinner
        ? 'border-rose-500/45 bg-rose-950/45 shadow-[0_20px_60px_rgba(244,63,94,0.08)]'
        : 'border-slate-700/80 bg-slate-950/75';
  const sideLabel = side === 'radiant' ? '天辉' : '夜魇';
  const teamScore = side === 'radiant' ? match.radiant_score : match.dire_score;

  return (
    <div
      data-testid={`live-team-${side}-${match.match_id}`}
      className={`rounded-[18px] border p-2.5 ${accentClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <MatchIcon
            label={side === 'radiant' ? 'Radiant' : 'Dire'}
            url={pickAssetUrl(
              side === 'radiant'
                ? match.radiant_icon_url ?? match.radiant_logo_url ?? match.radiant_logo_sponsor_url
                : match.dire_icon_url ?? match.dire_logo_url ?? match.dire_logo_sponsor_url
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{sideLabel}</p>
              {isWinner && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    side === 'radiant'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                      : 'border-rose-500/50 bg-rose-500/10 text-rose-200'
                  }`}
                >
                  获胜
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-white" title={teamName}>
              {teamName}
            </p>
          </div>
        </div>
        {typeof teamScore === 'number' && (
          <div className="shrink-0 rounded-xl border border-slate-700/80 bg-slate-950/70 px-2.5 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">击杀</p>
            <p className="text-base font-semibold text-white">{teamScore}</p>
          </div>
        )}
      </div>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {entries.length > 0 ? (
          entries.map((entry, index) => (
            <div
              key={`${match.match_id}-${side}-entry-${index}-${entry.heroName}-${entry.playerLabel ?? 'unknown'}`}
              className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/55 px-2 py-1.5"
            >
              {entry.heroIconUrl ? (
                <img
                  src={entry.heroIconUrl}
                  alt={entry.heroName}
                  className="h-8 w-8 shrink-0 rounded-lg border border-slate-700/70 bg-slate-950 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 bg-slate-950 text-[10px] text-slate-500">
                  {entry.heroName.slice(0, 2)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold leading-4 text-white">
                  {entry.playerLabel ?? '未知玩家'}
                </div>
                <div className="truncate text-[10px] leading-4 text-slate-400">
                  {entry.heroName}
                  {entry.playerMeta ? ` · ${entry.playerMeta}` : ''}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700/70 px-3 py-2 text-[11px] text-slate-500 sm:col-span-2">
            暂无阵容信息
          </div>
        )}
      </div>
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

  const searchSpec = useMemo(() => describeUnifiedSearchQuery(appliedSearchText), [appliedSearchText]);
  const hasSearchQuery = appliedSearchText.trim().length > 0;
  const searchModeLabel = hasSearchQuery ? searchSpec.label : '职业镜像';

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

      setMatches(result.matches ?? []);
      setTotal(result.total ?? 0);
      setSearchNotice(hasSearchQuery ? result.message ?? null : null);
      setLiveStatus((prev) => {
        const next = new Map(prev);
        for (const match of result.matches ?? []) {
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
      setMatches([]);
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

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = describeUnifiedSearchQuery(searchText);
    if (parsed.error) {
      setFeedback({ type: 'error', message: parsed.error });
      return;
    }

    setOffset(0);
    setAppliedSearchText(searchText.trim());
    setSelectedMatchIds([]);
    setFeedback(null);
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

  const currentPageMatchIds = matches.map((match) => match.match_id).filter((matchId) => Number.isFinite(matchId) && matchId > 0);
  const selectedCurrentPageCount = currentPageMatchIds.filter((matchId) => selectedMatchIds.includes(matchId)).length;
  const isAllCurrentPageSelected = currentPageMatchIds.length > 0 && selectedCurrentPageCount === currentPageMatchIds.length;
  const isSomeCurrentPageSelected = selectedCurrentPageCount > 0 && selectedCurrentPageCount < currentPageMatchIds.length;
  const activeFilterCount = hasSearchQuery ? 1 : 0;
  const activePipelineCount = matches.filter((match) => {
    const live = liveStatus.get(match.match_id);
    return !isTerminalPipelineStatus(live?.downloadStatus ?? match.download_status, live?.parseStatus ?? match.local_parse_status);
  }).length;
  const replayReadyCount = matches.filter((match) => {
    const live = liveStatus.get(match.match_id);
    return resolvePipelineParseStatus(live?.downloadStatus ?? match.download_status, live?.parseStatus ?? match.local_parse_status) === 'completed';
  }).length;

  return (
    <div className="workspace-page bg-dota-bg">
      <div className="workspace-stack">
        <div className="workspace-header workspace-header-compact">
          <div className="workspace-header-row">
            <div className="workspace-header-copy">
              <p className="workspace-eyebrow">OpenDota Live Intake</p>
              <h1 className="workspace-title text-dota-gold">OpenDota 职业比赛台</h1>
              <p className="workspace-description">
                职业比赛默认入列；搜索可按比赛、玩家或联赛定位。
              </p>
            </div>
            <div className="workspace-header-rail">
              <div className="workspace-kpi-grid workspace-kpi-grid-compact 2xl:min-w-[392px]">
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
          </div>

          <div className="workspace-pill-row workspace-pill-row-compact">
            <span className="workspace-pill">自动同步 每 1 分钟</span>
            <span className="workspace-pill workspace-pill-accent">模式 {searchModeLabel}</span>
            <span className="workspace-pill">激活筛选 {activeFilterCount}</span>
            <span className="workspace-pill">当前页 {matches.length} / 总数 {total}</span>
            <button
              onClick={() => {
                void handleManualSync();
              }}
              disabled={syncing}
              className="workspace-chip-button border border-dota-primary/50 bg-dota-primary/15 text-[#d8ecf0] transition hover:bg-dota-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? '同步中...' : '立即同步远端列表'}
            </button>
          </div>
        </div>

        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.18fr)_320px]">
          <div className="workspace-panel">
            <div className="workspace-panel-header-inline">
              <div className="workspace-panel-header !mb-0">
                <h2 className="workspace-panel-title">统一搜索</h2>
                <p className="workspace-panel-description">
                  一处输入，覆盖比赛、玩家和联赛检索。
                </p>
              </div>
              <span className="workspace-panel-badge">Single Query</span>
            </div>

            <form onSubmit={handleSearch} className="workspace-filter-shell">
              <div className="workspace-field-stack">
                <label className="workspace-field-label">搜索词</label>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <input
                    aria-label="统一搜索"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="8735428765 / Ame / DreamLeague / 玩家 86745912"
                    className="workspace-input flex-1"
                  />
                  <div className="workspace-action-row lg:flex-nowrap">
                    <button
                      type="submit"
                      className="workspace-action-button min-w-[112px] flex-1 border border-dota-primary/60 bg-dota-primary text-white transition hover:bg-[#557a92] sm:flex-none"
                    >
                      查询
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="workspace-action-button min-w-[112px] flex-1 border border-slate-500/60 bg-slate-700 text-white transition hover:bg-slate-600 sm:flex-none"
                    >
                      清空
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
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

              <div className="workspace-filter-footer">
                <p className="workspace-field-hint max-w-3xl">
                  纯数字会自动判别；需要指定类型时加 `比赛/玩家/联赛` 前缀。
                </p>
                <div className="workspace-filter-meta">
                  <span className="workspace-pill">模式 {searchModeLabel}</span>
                  <span className="workspace-pill">激活筛选 {activeFilterCount}</span>
                </div>
              </div>
            </form>
          </div>

          <div className="workspace-panel">
            <div className="workspace-panel-header-inline">
              <div className="workspace-panel-header !mb-0">
                <h2 className="workspace-panel-title">批量入库</h2>
                <p className="workspace-panel-description">对勾选项顺序下载并解析。</p>
              </div>
              <span className="workspace-panel-badge">Batch Intake</span>
            </div>
            <div className="workspace-filter-shell">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between 2xl:flex-col 2xl:items-start">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">当前选择</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{selectedMatchIds.length}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {selectedMatchIds.length === 0 ? '请先勾选要下载的比赛。' : '准备下载并入库选中比赛。'}
                  </p>
                </div>
                <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300">
                  下载后会自动进入解析阶段
                </span>
              </div>
              <div data-testid="live-batch-button-row" className="mt-4 workspace-action-row workspace-action-row-soft">
                <button
                  onClick={() => {
                    void handleIngest(selectedMatchIds);
                  }}
                  disabled={selectedMatchIds.length === 0 || batchLoading || actionMatchId !== null}
                  className="workspace-action-button min-w-[148px] flex-1 border border-emerald-500/60 bg-emerald-700 text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                >
                  {batchLoading ? '批量入库中...' : '批量下载并入库'}
                </button>
                <button
                  onClick={() => setSelectedMatchIds([])}
                  disabled={selectedMatchIds.length === 0}
                  className="workspace-action-button min-w-[120px] flex-1 border border-slate-600 text-white transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                >
                  清空勾选
                </button>
              </div>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-500/60 bg-emerald-900/20 text-emerald-200'
                : 'border-red-500/60 bg-red-900/20 text-red-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        {error && <div className="rounded border border-red-600 bg-red-900/20 px-4 py-3 text-red-200">{error}</div>}

        {searchNotice && (
          <div className="rounded border border-amber-500/60 bg-amber-900/20 px-4 py-3 text-sm text-amber-100">
            {searchNotice}
          </div>
        )}

        <div className="workspace-table-shell overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {hasSearchQuery ? '远端搜索结果' : '实时比赛列表'}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {hasSearchQuery ? (
                  <>
                    当前查询 <span className="font-semibold text-white">{searchModeLabel}</span>，
                    页面会同时保留英雄和玩家信息，方便直接挑选入库。
                  </>
                ) : (
                  <>
                    默认展示职业比赛，当前页可选 <span className="font-semibold text-white">{currentPageMatchIds.length}</span> 场，
                    已勾选 <span className="font-semibold text-white">{selectedMatchIds.length}</span> 场，
                    当前页命中 <span className="font-semibold text-white">{selectedCurrentPageCount}</span> 场。
                  </>
                )}
              </p>
            </div>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
              查看“状态详情”可追踪单场下载与解析链路
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/50 px-5 py-3">
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-200">
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
              全选当前页
            </label>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
                当前页 {currentPageMatchIds.length} 场
              </span>
              <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
                已勾选 {selectedCurrentPageCount} 场
              </span>
            </div>
          </div>

          <div className="space-y-4 px-5 py-5">
            {loading ? (
              <div className="rounded-[24px] border border-dashed border-slate-700/70 bg-slate-950/55 px-4 py-10 text-center text-slate-400">
                {searchModeLabel}加载中...
              </div>
            ) : matches.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-700/70 bg-slate-950/55 px-4 py-10 text-center text-slate-400">
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
                const downloadBadge = getDownloadStatusBadge(effectiveDownloadStatus);
                const parseBadge = getParseStatusBadge(effectiveParseStatus);
                const sourceLabel = match.source === 'public' ? '路人局' : '职业赛事';
                const sourceClass =
                  match.source === 'public'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                    : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';

                return (
                  <div
                    key={match.match_id}
                    data-testid={`live-match-card-${match.match_id}`}
                    className="rounded-[22px] border border-slate-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.9))] p-3 shadow-[0_20px_54px_rgba(2,6,23,0.26)]"
                  >
                    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-3 2xl:grid-cols-[18px_minmax(0,1fr)_220px]">
                      <div className="pt-1">
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
                          className="h-4 w-4 shrink-0 accent-cyan-500"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-dota-gold/40 bg-dota-gold/10 px-2.5 py-1 text-xs font-semibold text-dota-gold">
                            比赛 {match.match_id}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${sourceClass}`}>
                            {sourceLabel}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-700/80 bg-slate-950/80 px-2.5 py-1 text-xs text-slate-300">
                            开赛 {formatUnixTimestampLocal(match.start_time)}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-slate-700/80 bg-slate-950/80 px-2.5 py-1 text-xs text-slate-300">
                            时长 {formatDurationClock(match.duration)}
                          </span>
                        </div>
                        {shouldRenderLeagueBadge(match) ? (
                          <div className="mt-2">
                            <LeagueBadge match={match} leagueName={leagueName} />
                          </div>
                        ) : null}

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <TeamRosterCard match={match} side="radiant" winnerSide={winnerSide} />
                          <TeamRosterCard match={match} side="dire" winnerSide={winnerSide} />
                        </div>
                      </div>

                      <div className="col-span-2 2xl:col-span-1">
                        <div className="rounded-[18px] border border-slate-700/80 bg-slate-950/78 p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${pipelineBadge.className}`}>
                              {pipelineBadge.label}
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${downloadBadge.className}`}>
                              {downloadBadge.label}
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${parseBadge.className}`}>
                              {parseBadge.label}
                            </span>
                          </div>

                          {live?.downloadStatus === 'downloading' ? (
                            <div className="mt-2 space-y-2">
                              <div className="relative h-5 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full bg-cyan-500 transition-all duration-500"
                                  style={{ width: `${live.downloadProgress}%` }}
                                />
                                <span className="relative z-10 flex h-full items-center justify-center text-[10px] font-semibold text-white select-none">
                                  下载 {live.downloadProgress}%
                                </span>
                              </div>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCancel(match.match_id);
                                }}
                                title="取消下载"
                                className="w-full rounded-xl border border-red-500/60 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-400 hover:text-red-100"
                              >
                                取消下载
                              </button>
                            </div>
                          ) : null}

                          {liveParseStatus === 'parsing' && (
                            <div className="mt-2 relative h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-amber-500 transition-all duration-500" />
                            </div>
                          )}

                          <div className="mt-3 grid gap-2">
                            <button
                              onClick={() => {
                                void handleIngest([match.match_id]);
                              }}
                              disabled={ingesting || batchLoading}
                              className="rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
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
                              className="rounded-xl border border-cyan-500/60 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 transition hover:border-cyan-400 hover:text-cyan-100"
                            >
                              状态详情
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
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
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getPipelineStatusBadge(
                            statusPanel.detail.download_task?.status,
                            statusPanel.detail.local_parse_status
                          ).className}`}
                        >
                          {getPipelineStatusBadge(statusPanel.detail.download_task?.status, statusPanel.detail.local_parse_status).label}
                        </span>
                        {typeof statusPanel.detail.download_task?.progress === 'number' && (
                          <span className="text-xs text-slate-400">下载进度 {statusPanel.detail.download_task.progress}%</span>
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
                      <div className="text-white">{getDownloadStatusBadge(statusPanel.detail.download_task?.status).label}</div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">下载错误</div>
                      <div className="text-white break-words">
                        {statusPanel.detail.download_task?.error_code ?? '--'}
                        {statusPanel.detail.download_task?.error_message ? `: ${statusPanel.detail.download_task.error_message}` : ''}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">解析阶段</div>
                      <div className="text-white">{getParseStatusBadge(statusPanel.detail.local_parse_status).label}</div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">文件状态</div>
                      <div className="text-white">
                        DEM {statusPanel.detail.replay_dem_exists ? '已生成' : '缺失'} | 压缩包 {statusPanel.detail.replay_bz2_exists ? '已保留' : '缺失'}
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
                      <div className="text-slate-400">本地录像路径</div>
                      <div className="font-mono text-white break-all">{statusPanel.detail.local_replay_path ?? '--'}</div>
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
