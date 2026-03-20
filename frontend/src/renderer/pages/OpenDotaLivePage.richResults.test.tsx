// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OpenDotaLivePage from './OpenDotaLivePage';
import { remoteService } from '../api/remoteService';

describe('OpenDotaLivePage rich search results', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('shows lineups, public/pro labels, and player identities for direct search results', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    const searchSpy = vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
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
          leagueid: 15475,
          league_name: 'DreamLeague Season 26',
          source: 'pro',
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          radiant_win: true,
          winner_team: 'radiant',
          radiant_score: 38,
          dire_score: 24,
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
    await screen.findByText('未找到实时比赛。');

    fireEvent.change(screen.getByLabelText('统一搜索'), { target: { value: 'DreamLeague' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(searchSpy).toHaveBeenLastCalledWith({
        q: 'DreamLeague',
        limit: 20,
        offset: 0,
        sources: ['pro', 'public'],
      });
    });

    expect(await screen.findByText('远端搜索结果')).toBeTruthy();
    expect(screen.getByTestId('live-league-badge-8123456789')).toBeTruthy();
    expect(screen.getByTestId('live-league-badge-8123456789').textContent).toContain('联赛档案');
    expect(screen.getByTestId('live-league-badge-8123456789').textContent).toContain('15475');
    expect(screen.queryByText('胜者')).toBeNull();
    expect(screen.queryByTestId('live-winner-badge-8123456789')).toBeNull();
    expect(screen.getByTestId('live-league-badge-8123456789').textContent).toContain('DreamLeague Season 26');
    expect(screen.getByTestId('live-team-radiant-8123456789').textContent).toContain('获胜');
    expect(screen.getByTestId('live-team-radiant-8123456789').textContent).toContain('Luna');
    expect(screen.getByTestId('live-team-radiant-8123456789').textContent).toContain('miCKe');
    expect(screen.getByTestId('live-team-radiant-8123456789').textContent).toContain('ID 1');
    expect(screen.getByTestId('live-team-dire-8123456789').textContent).toContain('Gyrocopter');
    expect(screen.getByTestId('live-team-dire-8123456789').textContent).toContain('Skiter');
    expect(screen.getByTestId('live-team-dire-8123456789').textContent).toContain('ID 11');
    expect(screen.getByRole('button', { name: '下载并入库' })).toBeTruthy();
  });
});
