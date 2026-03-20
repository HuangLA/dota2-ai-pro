// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OpenDotaLivePage from './OpenDotaLivePage';
import { remoteService } from '../api/remoteService';

describe('OpenDotaLivePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('keeps the default pro-only list on initial load', async () => {
    const listSpy = vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });
    const searchSpy = vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<OpenDotaLivePage />);
    await screen.findByText('未找到实时比赛。');

    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        sources: ['pro'],
      })
    );
    expect(searchSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('统一搜索')).toBeTruthy();
    expect(screen.queryByLabelText('职业')).toBeNull();
    expect(screen.queryByLabelText('路人')).toBeNull();
  });

  it('sends the raw unified query to the remote search endpoint', async () => {
    const searchSpy = vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<OpenDotaLivePage />);
    await screen.findByText('未找到实时比赛。');

    fireEvent.change(screen.getByLabelText('统一搜索'), { target: { value: '8735428765' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(searchSpy).toHaveBeenLastCalledWith({
        q: '8735428765',
        sources: ['pro', 'public'],
        limit: 20,
        offset: 0,
      });
    });

    fireEvent.change(screen.getByLabelText('统一搜索'), { target: { value: 'Ame' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(searchSpy).toHaveBeenLastCalledWith({
        q: 'Ame',
        sources: ['pro', 'public'],
        limit: 20,
        offset: 0,
      });
    });

    fireEvent.change(screen.getByLabelText('统一搜索'), { target: { value: 'DreamLeague' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(searchSpy).toHaveBeenLastCalledWith({
        q: 'DreamLeague',
        sources: ['pro', 'public'],
        limit: 20,
        offset: 0,
      });
    });

    fireEvent.change(screen.getByLabelText('统一搜索'), { target: { value: '联赛 15475' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(searchSpy).toHaveBeenLastCalledWith({
        q: '联赛 15475',
        sources: ['pro', 'public'],
        limit: 20,
        offset: 0,
      });
    });
  });

  it('renders the new search shell and batch actions', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<OpenDotaLivePage />);
    await screen.findByText('未找到实时比赛。');

    expect(screen.getByText('统一搜索')).toBeTruthy();
    expect(screen.getByText('批量入库')).toBeTruthy();
    expect(screen.getByRole('button', { name: '比赛 8735428765' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '玩家 Ame' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '联赛 DreamLeague' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '联赛 15475' })).toBeTruthy();
    expect(screen.getByTestId('live-batch-button-row').className).toContain('workspace-action-row');
  });

  it('blocks invalid explicit match queries before hitting remote search', async () => {
    const searchSpy = vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<OpenDotaLivePage />);
    await screen.findByText('未找到实时比赛。');

    fireEvent.change(screen.getByLabelText('统一搜索'), { target: { value: '比赛 abc' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('比赛关键词后请输入数字比赛 ID。')).toBeTruthy();
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('shows hero and player details in the default list view', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8123456789,
          start_time: 1700054321,
          duration: 2450,
          last_synced_at: 1700059999,
          source: 'pro',
          leagueid: 15475,
          league_name: 'DreamLeague Season 26',
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          radiant_win: true,
          winner_team: 'radiant',
          radiant_players: [
            { account_id: 1, display_name: 'miCKe', hero_id: 48, team: 'radiant' },
            { account_id: 2, display_name: 'Nisha', hero_id: 13, team: 'radiant' },
            { account_id: 3, display_name: '33', hero_id: 129, team: 'radiant' },
            { account_id: 4, display_name: 'Boxi', hero_id: 19, team: 'radiant' },
            { account_id: 5, display_name: 'Insania', hero_id: 79, team: 'radiant' },
          ],
          dire_players: [
            { account_id: 11, display_name: 'Skiter', hero_id: 72, team: 'dire' },
            { account_id: 12, display_name: 'ATF', hero_id: 99, team: 'dire' },
            { account_id: 13, display_name: 'Sneyking', hero_id: 87, team: 'dire' },
            { account_id: 14, display_name: 'Cr1t', hero_id: 107, team: 'dire' },
            { account_id: 15, display_name: 'SaberLight', hero_id: 23, team: 'dire' },
          ],
        },
      ],
    });

    render(<OpenDotaLivePage />);

    expect(await screen.findByText('Team Liquid')).toBeTruthy();
    expect(screen.getByTestId('live-league-badge-8123456789')).toBeTruthy();
    expect(screen.getByTestId('live-league-badge-8123456789').textContent).toContain('联赛 15475');
    expect(screen.getByTestId('live-league-badge-8123456789').textContent).toContain('职业镜像');
    expect(screen.getByTestId('live-league-badge-8123456789').textContent).toContain('检索标签');
    expect(screen.queryByText('胜者')).toBeNull();
    expect(screen.queryByTestId('live-winner-badge-8123456789')).toBeNull();
    expect(screen.getByTestId('live-team-radiant-8123456789').textContent).toContain('Luna');
    expect(screen.getByTestId('live-team-radiant-8123456789').textContent).toContain('miCKe');
    expect(screen.getByTestId('live-team-radiant-8123456789').textContent).toContain('ID 1');
    expect(screen.getByTestId('live-team-dire-8123456789').textContent).toContain('Gyrocopter');
    expect(screen.getByTestId('live-team-dire-8123456789').textContent).toContain('Skiter');
    expect(screen.getByTestId('live-team-dire-8123456789').textContent).toContain('ID 11');
  });

  it('hides the league badge for public matches without league metadata', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 7000000001,
          start_time: 1700054321,
          duration: 2450,
          source: 'public',
          radiant_win: false,
          radiant_players: [{ account_id: 1, display_name: 'Ame', hero_id: 48, team: 'radiant' }],
          dire_players: [{ account_id: 2, display_name: 'Maybe', hero_id: 13, team: 'dire' }],
        },
      ],
    });

    render(<OpenDotaLivePage />);

    expect(await screen.findByTestId('live-match-card-7000000001')).toBeTruthy();
    expect(screen.queryByTestId('live-league-badge-7000000001')).toBeNull();
    expect(screen.getByTestId('live-team-radiant-7000000001').textContent).not.toContain('未知战队');
    expect(screen.getByTestId('live-team-dire-7000000001').textContent).not.toContain('未知战队');
  });

  it('shows upstream rate-limit guidance when search falls back to cached results only', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });
    vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
      status: 'ok',
      message: 'OpenDota 当前对本机 IP 触发了 daily api limit exceeded；本次搜索只能返回本地已缓存的结果，未缓存的比赛或联赛暂时无法补抓。',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<OpenDotaLivePage />);
    await screen.findByText('未找到实时比赛。');

    fireEvent.change(screen.getByLabelText('统一搜索'), { target: { value: 'DreamLeague' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText(/daily api limit exceeded/)).toBeTruthy();
    expect(screen.getByText('未找到匹配的远端比赛。')).toBeTruthy();
  });
});
