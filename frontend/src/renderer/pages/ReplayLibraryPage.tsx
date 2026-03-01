import { useCallback, useEffect, useMemo, useState } from 'react';
import { libraryService, LibraryMatchRecord } from '../api/libraryService';
import { formatDurationClock, formatUnixTimestampLocal } from './matchDatabaseFormatting';

const PAGE_LIMIT = 20;

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

export function ReplayLibraryPage({ onOpenReplay }: ReplayLibraryPageProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState<LibraryMatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<number | null>(null);

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
      setError('Replay Library 加载失败，请重试。');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches]);

  const handleDelete = async (matchId: number) => {
    setDeletingMatchId(matchId);
    setFeedback(null);

    try {
      const result = await libraryService.deleteLibraryMatch(matchId);
      setFeedback({
        type: result.status === 'ok' ? 'success' : 'error',
        message: result.message || `比赛 ${matchId} 删除请求已完成。`,
      });
      await fetchMatches();
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

  return (
    <div className="p-6 text-white min-h-full bg-dota-bg">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950/40 p-5 shadow-xl">
          <h1 className="text-3xl font-bold text-dota-gold">Replay Library</h1>
          <p className="mt-1 text-sm text-emerald-100/80">仅展示已解析完成（completed）的本地录像。</p>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">筛选条件</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setOffset(0);
              setAppliedFilters(filters);
              setFeedback(null);
            }}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5"
          >
            <input
              aria-label="team_id"
              value={filters.teamId}
              onChange={(event) => setFilters((current) => ({ ...current, teamId: event.target.value }))}
              placeholder="team_id"
              className="w-full rounded border border-slate-600 bg-dota-bg px-3 py-2 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <input
              aria-label="player_id"
              value={filters.playerId}
              onChange={(event) => setFilters((current) => ({ ...current, playerId: event.target.value }))}
              placeholder="player_id"
              className="w-full rounded border border-slate-600 bg-dota-bg px-3 py-2 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <input
              aria-label="leagueid"
              value={filters.leagueId}
              onChange={(event) => setFilters((current) => ({ ...current, leagueId: event.target.value }))}
              placeholder="leagueid"
              className="w-full rounded border border-slate-600 bg-dota-bg px-3 py-2 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded border border-emerald-500/60 bg-emerald-700 px-4 py-2 font-medium text-white transition hover:bg-emerald-600"
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

        <div className="card p-0 overflow-hidden mt-6">
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
