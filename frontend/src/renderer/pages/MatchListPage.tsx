import React, { useState, useEffect } from 'react';
import { matchService, MatchSearchParams } from '../api/matchService';
import { getAllHeroes } from '../data/heroes';
import { ReplayUploader } from '../components/ReplayUploader';

// Match type that aligns with backend API response
interface MatchData {
  match_id: number;
  start_time?: number;
  duration?: number;
  winner_team?: number;
  winner_name?: string;
  radiant_score?: number;
  dire_score?: number;
  game_mode?: number;
  patch_version?: string;
  league_id?: number;
  replay_path?: string | null;
  parse_status?: string;
  created_at?: number;
  updated_at?: number;
  parsed_at?: string;
}

interface MatchListPageProps {
  onWatch: (matchId: number) => void;
}

export function MatchListPage({ onWatch }: MatchListPageProps) {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search parameters
  const [matchIdInput, setMatchIdInput] = useState('');
  const [accountIdInput, setAccountIdInput] = useState('');
  const [selectedHeroId, setSelectedHeroId] = useState<number | undefined>(undefined);

  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  // 用于触发 useEffect 重新搜索的计数器
  const [searchTrigger, setSearchTrigger] = useState(0);

  const heroes = getAllHeroes();

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      // If user is searching by specific match ID, call getMatchDetail instead
      if (matchIdInput && matchIdInput.trim() !== '') {
        const id = parseInt(matchIdInput.trim());
        if (!isNaN(id)) {
          // Fetch specific match by ID
          const match = await matchService.getMatchDetail(id);
          setMatches([match]);
          setTotal(1);
          setLoading(false);
          return;
        }
      }

      // Otherwise, use the list API with filters
      const params: MatchSearchParams = {
        limit,
        offset,
      };

      if (accountIdInput) {
        const id = parseInt(accountIdInput);
        if (!isNaN(id)) {
          params.account_id = id;
        }
      }

      if (selectedHeroId) {
        params.hero_id = selectedHeroId;
      }

      const response = await matchService.getMatches(params);

      // Handle response structure. Check if it's { matches: [], total: ... }
      if (response && Array.isArray(response.matches)) {
        setMatches(response.matches);
        setTotal(response.total || 0);
      } else {
        // Fallback if response structure is different (e.g. just array)
        if (Array.isArray(response)) {
          setMatches(response);
          setTotal(response.length);
        } else {
          setMatches([]);
          setTotal(0);
        }
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
      setError('加载比赛列表失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  // 当 offset 或 searchTrigger 变化时重新获取数据
  // 所有搜索操作都通过更新 state 来驱动，确保 fetchMatches 读取到最新的值
  useEffect(() => {
    fetchMatches();
  }, [offset, searchTrigger]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0); // Reset to first page
    setSearchTrigger(prev => prev + 1); // 触发 useEffect 重新搜索
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`确定要删除比赛 ${id} 吗？`)) {
      return;
    }

    try {
      const success = await matchService.deleteMatch(id);
      if (success) {
        fetchMatches(); // Refresh list
      } else {
        alert('删除比赛失败。');
      }
    } catch (err) {
      console.error('Error deleting match:', err);
      alert('删除比赛时出错。');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeAgo = (timestampOrString: string | number | undefined) => {
    if (!timestampOrString) return '未知';

    let timestamp: number;
    if (typeof timestampOrString === 'string') {
      timestamp = new Date(timestampOrString).getTime();
    } else if (typeof timestampOrString === 'number') {
      // If it's a Unix timestamp in seconds, convert to milliseconds
      timestamp = timestampOrString > 1e10 ? timestampOrString : timestampOrString * 1000;
    } else {
      return '未知';
    }

    const now = Date.now();
    const diffSeconds = Math.floor((now - timestamp) / 1000);

    if (diffSeconds < 60) return `${diffSeconds} 秒前`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} 天前`;
  };

  return (
    <div className="workspace-page bg-dota-bg">
      <div className="workspace-stack">
        <div className="workspace-header">
          <div className="workspace-header-row">
            <div>
              <p className="workspace-eyebrow text-cyan-300/80">Legacy Match List</p>
              <h1 className="workspace-title text-dota-gold">比赛管理</h1>
              <p className="workspace-description">上传录像、搜索比赛、管理你的游戏数据。这是保留的旧版入口，但现在也使用同一套桌面工作区视觉。</p>
            </div>
            <div className="workspace-kpi-grid xl:min-w-[420px]">
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">当前结果</p>
                <p className="workspace-kpi-value">{matches.length}</p>
                <p className="workspace-kpi-hint">当前页比赛数</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">偏移</p>
                <p className="workspace-kpi-value">{offset}</p>
                <p className="workspace-kpi-hint">分页位置</p>
              </div>
              <div className="workspace-kpi">
                <p className="workspace-kpi-label">总数</p>
                <p className="workspace-kpi-value">{total}</p>
                <p className="workspace-kpi-hint">命中总比赛</p>
              </div>
            </div>
          </div>
        </div>

        {/* Replay Uploader */}
        <ReplayUploader onTaskCompleted={fetchMatches} />

        {/* Search Bar */}
        <div className="workspace-panel">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">搜索筛选</h2>
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm text-gray-400 mb-1.5">比赛 ID</label>
              <input
                type="text"
                value={matchIdInput}
                onChange={(e) => setMatchIdInput(e.target.value)}
                placeholder="e.g., 8478202"
                className="workspace-input focus:border-dota-primary"
              />
            </div>

            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm text-gray-400 mb-1.5">玩家账号 ID</label>
              <input
                type="text"
                value={accountIdInput}
                onChange={(e) => setAccountIdInput(e.target.value)}
                placeholder="e.g., 87278757"
                className="workspace-input focus:border-dota-primary"
              />
            </div>

            <div className="flex-1 min-w-[180px]">
              <label className="block text-sm text-gray-400 mb-1.5">英雄筛选</label>
              <select
                value={selectedHeroId || ''}
                onChange={(e) => setSelectedHeroId(e.target.value ? parseInt(e.target.value) : undefined)}
                className="workspace-select focus:border-dota-primary"
              >
                <option value="">全部英雄</option>
                {heroes.map(hero => (
                  <option key={hero.id} value={hero.id}>
                    {hero.chineseName}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="bg-dota-primary hover:bg-blue-600 text-white px-6 py-2 rounded transition-colors font-medium shadow-md hover:shadow-lg"
            >
              搜索
            </button>

            <button
              type="button"
              onClick={() => {
                setMatchIdInput('');
                setAccountIdInput('');
                setSelectedHeroId(undefined);
                setOffset(0);
                setSearchTrigger(prev => prev + 1); // React 18 批处理确保所有 state 更新后再触发 useEffect
              }}
              className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded transition-colors text-sm"
            >
              清除筛选
            </button>
          </form>

          {/* Search tips */}
          <div className="mt-4 text-xs text-gray-500 bg-gray-800/50 p-3 rounded">
            <span className="font-semibold text-gray-400">提示:</span>
            {' '}比赛 ID 为精确搜索。玩家/英雄筛选为全局搜索。
            {' '}筛选条件可组合使用（例如指定英雄 + 玩家）。
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-2xl border border-red-500 bg-red-900/50 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        {/* Data Table */}
        <div className="workspace-table-shell">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gradient-to-r from-gray-900 to-gray-800 text-gray-300 text-sm uppercase">
                <tr>
                  <th className="px-6 py-4 font-semibold">比赛 ID</th>
                  <th className="px-6 py-4 font-semibold">获胜方</th>
                  <th className="px-6 py-4 font-semibold">时长</th>
                  <th className="px-6 py-4 font-semibold">解析时间</th>
                  <th className="px-6 py-4 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                      加载中...
                    </td>
                  </tr>
                ) : matches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                      暂无比赛数据。
                    </td>
                  </tr>
                ) : (
                  matches.map((match) => (
                    <tr key={match.match_id} className="hover:bg-white/5 transition-colors border-b border-gray-800 last:border-0">
                      <td className="px-6 py-4 font-mono text-dota-gold font-semibold">
                        {match.match_id}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold uppercase ${match.winner_team === 2
                            ? 'bg-green-900/40 text-green-400 border border-green-800'
                            : match.winner_team === 3
                              ? 'bg-red-900/40 text-red-400 border border-red-800'
                              : 'bg-gray-700 text-gray-400'
                            }`}
                        >
                          {match.winner_name || (match.winner_team === 2 ? '天辉' : match.winner_team === 3 ? '夜魇' : '未知')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        {formatDuration(match.duration || 0)}
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm">
                        {formatTimeAgo(match.parsed_at || match.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onWatch(match.match_id)}
                            className="text-blue-400 hover:text-blue-300 font-medium transition-colors text-sm px-4 py-1.5 rounded hover:bg-blue-900/30 border border-blue-700/50 hover:border-blue-500/50"
                          >
                            观看
                          </button>
                          <button
                            onClick={() => handleDelete(match.match_id)}
                            className="text-red-400 hover:text-red-300 font-medium transition-colors text-sm px-4 py-1.5 rounded hover:bg-red-900/30 border border-red-700/50 hover:border-red-500/50"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex items-center justify-between border-t border-gray-700">
            <div className="text-sm text-gray-400">
              {matches.length > 0 ? (
                <>
                  显示第 <span className="text-white font-medium">{offset + 1}</span> 到{' '}
                  <span className="text-white font-medium">{Math.min(offset + matches.length, total)}</span> 条，共{' '}
                  <span className="text-white font-medium">{total}</span> 场比赛
                </>
              ) : (
                '暂无比赛数据'
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-4 py-2 rounded bg-gray-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm font-medium border border-gray-600 hover:border-gray-500"
              >
                上一页
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + matches.length >= total}
                className="px-4 py-2 rounded bg-gray-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm font-medium border border-gray-600 hover:border-gray-500"
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
