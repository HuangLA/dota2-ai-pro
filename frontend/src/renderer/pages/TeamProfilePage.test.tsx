// @vitest-environment jsdom


import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TeamProfilePage from './TeamProfilePage';
import { matchDatabaseService } from '../api/matchDatabaseService';
import { teamProfileService } from '../api/teamProfileService';
import { formatUnixTimestampLocal } from './matchDatabaseFormatting';

describe('TeamProfilePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('fetches and renders team matches after team_id input', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8123456789,
          start_time: 1700054321,
          duration: 2450,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenCalledWith({ team_id: 15, limit: 20, offset: 0 });
    });

    expect(await screen.findByText('8123456789')).toBeTruthy();
    expect(await screen.findByText('天辉')).toBeTruthy();
    expect(await screen.findByText('15475')).toBeTruthy();
  });

  it('triggers replay navigation callback when Open Replay is clicked', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8674716612,
          start_time: 1700054321,
          duration: 2450,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
        },
      ],
    });

    const onOpenReplay = vi.fn();
    render(<TeamProfilePage onOpenReplay={onOpenReplay} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    fireEvent.click(await screen.findByRole('button', { name: '打开回放' }));

    expect(onOpenReplay).toHaveBeenCalledWith({
      source: 'team_profile',
      matchId: 8674716612,
    });
  });

  it('renders league groups with readable group headers', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9001,
          start_time: 1700050000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 15475,
          league_name: 'DreamLeague Season 26',
        },
        {
          match_id: 9002,
          start_time: 1700051000,
          duration: 2300,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: null,
        },
        {
          match_id: 9003,
          start_time: 1700052000,
          duration: 2400,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
          league_name: 'DreamLeague Season 26',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByTestId('league-group-league-15475')).toBeTruthy();
    expect(await screen.findByTestId('league-group-unknown')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '切换分组 DreamLeague Season 26' }).textContent
    ).toContain('2 场');
    expect(screen.getByRole('button', { name: '切换分组 未知联赛' }).textContent).toContain(
      '1 场'
    );
  });

  it('applies sort toggle between desc and asc by start_time', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 7001,
          start_time: 1700050000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 111,
        },
        {
          match_id: 7002,
          start_time: 1700060000,
          duration: 2200,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 111,
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-group-league-111');

    const initialOrder = screen
      .getAllByTestId('team-profile-match-id')
      .map((element) => Number(element.textContent));
    expect(initialOrder).toEqual([7002, 7001]);

    fireEvent.click(screen.getByRole('button', { name: '切换开始时间排序' }));

    const ascendingOrder = screen
      .getAllByTestId('team-profile-match-id')
      .map((element) => Number(element.textContent));
    expect(ascendingOrder).toEqual([7001, 7002]);
  });

  it('filters list when only show with download status is enabled', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8101,
          start_time: 1700050000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 555,
          download_status: 'prepared',
        },
        {
          match_id: 8102,
          start_time: 1700055000,
          duration: 2200,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 555,
        },
        {
          match_id: 8103,
          start_time: 1700059000,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 777,
          download_task_id: 'task-123',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('8101')).toBeTruthy();
    expect(await screen.findByText('8102')).toBeTruthy();
    expect(await screen.findByText('8103')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('仅显示有下载状态'));

    await waitFor(() => {
      expect(screen.queryByText('8102')).toBeNull();
    });
    expect(screen.getByText('8101')).toBeTruthy();
    expect(screen.getByText('8103')).toBeTruthy();
  });

  it('applies With Download Status preset and filters rows', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8201,
          start_time: 1700060000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 555,
          download_status: 'prepared',
        },
        {
          match_id: 8202,
          start_time: 1700065000,
          duration: 2200,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 555,
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('8201')).toBeTruthy();
    expect(await screen.findByText('8202')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '预设 仅有下载状态' }));

    await waitFor(() => {
      expect(screen.queryByText('8202')).toBeNull();
    });
    expect((screen.getByLabelText('仅显示有下载状态') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('8201')).toBeTruthy();
  });

  it('applies Latest 20 preset with newest-first and refetches limit=20', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8301,
          start_time: 1700069000,
          duration: 1900,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 999,
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('数量上限'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenCalledWith({ team_id: 15, limit: 50, offset: 0 });
    });

    fireEvent.click(screen.getByRole('button', { name: '切换开始时间排序' }));
    expect(screen.getByRole('button', { name: '切换开始时间排序' }).textContent).toContain(
      '最旧优先'
    );

    fireEvent.click(screen.getByRole('button', { name: '预设 最近 20 场' }));

    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenLastCalledWith({ team_id: 15, limit: 20, offset: 0 });
    });
    expect((screen.getByLabelText('数量上限') as HTMLInputElement).value).toBe('20');
    expect(screen.getByRole('button', { name: '切换开始时间排序' }).textContent).toContain(
      '最新优先'
    );
  });

  it('filters league groups via League Quick Filter and supports All reset', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8801,
          start_time: 1700080000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 101,
          league_name: 'League Alpha',
        },
        {
          match_id: 8802,
          start_time: 1700085000,
          duration: 2200,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 202,
          league_name: 'League Beta',
        },
        {
          match_id: 8803,
          start_time: 1700087000,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 101,
          league_name: 'League Alpha',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-group-league-101');
    expect(screen.getByTestId('league-group-league-101')).toBeTruthy();
    expect(screen.getByTestId('league-group-league-202')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-101' },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('league-group-league-202')).toBeNull();
    });
    expect(screen.getByTestId('league-group-league-101')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'all' },
    });

    expect(await screen.findByTestId('league-group-league-202')).toBeTruthy();
  });

  it('toggles Focus: Latest League to lock latest league and restores quick filter on disable', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8851,
          start_time: 1700080000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 101,
          league_name: 'League Alpha',
        },
        {
          match_id: 8852,
          start_time: 1700085000,
          duration: 2200,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 202,
          league_name: 'League Beta',
        },
        {
          match_id: 8853,
          start_time: 1700087000,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 101,
          league_name: 'League Alpha',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-group-league-101');
    expect(screen.getByTestId('league-group-league-101')).toBeTruthy();
    expect(screen.getByTestId('league-group-league-202')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-202' },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('league-group-league-101')).toBeNull();
    });
    expect(screen.getByTestId('league-group-league-202')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('聚焦：最近联赛'));

    await waitFor(() => {
      expect(screen.queryByTestId('league-group-league-202')).toBeNull();
    });
    expect(screen.getByTestId('league-group-league-101')).toBeTruthy();
    expect(screen.getByText('聚焦已开启：锁定到当前筛选结果中的最近联赛。')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('聚焦：最近联赛'));

    await waitFor(() => {
      expect(screen.queryByTestId('league-group-league-101')).toBeNull();
    });
    expect(screen.getByTestId('league-group-league-202')).toBeTruthy();
  });

  it('supports collapsing and expanding league groups', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9201,
          start_time: 1700100000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 222,
          league_name: 'PGL Wallachia',
        },
        {
          match_id: 9202,
          start_time: 1700090000,
          duration: 2200,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 222,
          league_name: 'PGL Wallachia',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByText('9201');

    expect(screen.getByRole('button', { name: '切换分组 PGL Wallachia' }).textContent).toContain(
      '已展开'
    );
    expect(screen.getByRole('button', { name: '切换分组 PGL Wallachia' }).textContent).toContain(
      '2 场'
    );

    fireEvent.click(screen.getByRole('button', { name: '切换分组 PGL Wallachia' }));

    await waitFor(() => {
      expect(screen.queryByText('9201')).toBeNull();
    });
    expect(screen.getByRole('button', { name: '切换分组 PGL Wallachia' }).textContent).toContain(
      '已折叠'
    );

    fireEvent.click(screen.getByRole('button', { name: '切换分组 PGL Wallachia' }));
    expect(await screen.findByText('9201')).toBeTruthy();
  });

  it('renders tournament summary metrics and group average duration', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9501,
          start_time: 1700200000,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 500,
          league_name: 'Elite League',
        },
        {
          match_id: 9502,
          start_time: 1700203600,
          duration: 2400,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 500,
          league_name: 'Elite League',
        },
        {
          match_id: 9503,
          start_time: 1700190000,
          duration: 3000,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 777,
          league_name: 'DreamLeague',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('赛事摘要')).toBeTruthy();
    expect(screen.getByText('总比赛数')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('赛事数')).toBeTruthy();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatUnixTimestampLocal(1700203600)).length).toBeGreaterThan(0);
    expect(screen.getByText('2 场 | 平均时长：35:00')).toBeTruthy();
  });

  it('opens match database with team_id and leagueid context from group action', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9601,
          start_time: 1700300000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 888,
          league_name: 'PGL Wallachia',
        },
        {
          match_id: 9602,
          start_time: 1700301000,
          duration: 2200,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: null,
        },
      ],
    });

    const onOpenMatchDatabase = vi.fn();
    render(<TeamProfilePage onOpenMatchDatabase={onOpenMatchDatabase} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    const openKnownLeagueButton = await screen.findByRole('button', {
      name: '在比赛数据库打开联赛 PGL Wallachia',
    });
    fireEvent.click(openKnownLeagueButton);

    expect(onOpenMatchDatabase).toHaveBeenCalledWith({ teamId: 15, leagueId: 888 });

    const openUnknownLeagueButton = screen.getByRole('button', {
      name: '在比赛数据库打开联赛 未知联赛',
    });
    expect(openUnknownLeagueButton.getAttribute('disabled')).not.toBeNull();
  });

  it('calls prepare API then opens replay for Prepare + Open Replay action', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9301,
          start_time: 1700105000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 333,
        },
      ],
    });
    const triggerSpy = vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });

    const onOpenReplay = vi.fn();
    render(<TeamProfilePage onOpenReplay={onOpenReplay} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    fireEvent.click(await screen.findByRole('button', { name: '准备并打开回放' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledWith(9301, 'prepare');
    });
    await waitFor(() => {
      expect(onOpenReplay).toHaveBeenCalledWith({
        source: 'team_profile',
        matchId: 9301,
      });
    });
  });

  it('still opens replay when prepare fails in Prepare + Open Replay action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => { });
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9401,
          start_time: 1700110000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 444,
        },
      ],
    });
    vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockRejectedValue(new Error('HTTP 500'));

    const onOpenReplay = vi.fn();
    render(<TeamProfilePage onOpenReplay={onOpenReplay} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    fireEvent.click(await screen.findByRole('button', { name: '准备并打开回放' }));

    await waitFor(() => {
      expect(onOpenReplay).toHaveBeenCalledWith({
        source: 'team_profile',
        matchId: 9401,
      });
    });
    await screen.findByText('比赛 9401：准备失败，仍将打开回放...');
  });

  it('prepares only currently visible matches and renders batch summary', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9901,
          start_time: 1700400000,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 300,
          league_name: 'Visible League',
        },
        {
          match_id: 9902,
          start_time: 1700401000,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 400,
          league_name: 'Collapsed League',
        },
      ],
    });

    const triggerSpy = vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    const collapseButton = await screen.findByRole('button', {
      name: '切换分组 Collapsed League',
    });
    fireEvent.click(collapseButton);

    await screen.findByText('分组已折叠。');

    fireEvent.click(screen.getByRole('button', { name: '准备当前可见比赛' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(1);
    });
    expect(triggerSpy).toHaveBeenCalledWith(9901, 'prepare');

    await waitFor(() => {
      expect(screen.getByTestId('prepare-visible-summary').textContent).toContain(
        '总计 1 / 成功 1 / 失败 0'
      );
    });

    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('prepares visible matches then opens first visible replay once', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9911,
          start_time: 1700500000,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 610,
          league_name: 'Focus League',
        },
        {
          match_id: 9912,
          start_time: 1700490000,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 610,
          league_name: 'Focus League',
        },
        {
          match_id: 9913,
          start_time: 1700480000,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 620,
          league_name: 'Hidden League',
        },
      ],
    });

    const triggerSpy = vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });

    const onOpenReplay = vi.fn();
    render(<TeamProfilePage onOpenReplay={onOpenReplay} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    const collapseHiddenLeague = await screen.findByRole('button', {
      name: '切换分组 Hidden League',
    });
    fireEvent.click(collapseHiddenLeague);

    fireEvent.click(screen.getByRole('button', { name: '准备并打开首场回放（可见）' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(2);
    });
    expect(triggerSpy).toHaveBeenNthCalledWith(1, 9911, 'prepare');
    expect(triggerSpy).toHaveBeenNthCalledWith(2, 9912, 'prepare');

    await waitFor(() => {
      expect(onOpenReplay).toHaveBeenCalledTimes(1);
    });
    expect(onOpenReplay).toHaveBeenCalledWith({
      source: 'team_profile',
      matchId: 9911,
    });

    await waitFor(() => {
      expect(screen.getByTestId('prepare-visible-summary').textContent).toContain(
        '总计 2 / 成功 2 / 失败 0 / 已打开回放 9911'
      );
    });
    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('opens visible matches in Match Database with mapped team/league/has_download context', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9701,
          start_time: 1700310000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 1234,
          league_name: 'League 1234',
          download_status: 'prepared',
        },
        {
          match_id: 9702,
          start_time: 1700310600,
          duration: 2200,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 5678,
          league_name: 'League 5678',
          download_status: 'prepared',
        },
      ],
    });

    const onOpenMatchDatabase = vi.fn();
    render(<TeamProfilePage onOpenMatchDatabase={onOpenMatchDatabase} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByText('9701');
    fireEvent.click(screen.getByLabelText('仅显示有下载状态'));
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-1234' },
    });

    fireEvent.click(screen.getByRole('button', { name: '在比赛数据库打开当前可见项' }));

    expect(onOpenMatchDatabase).toHaveBeenCalledWith({
      teamId: 15,
      leagueId: 1234,
      hasDownload: true,
    });
  });

  it('shows lightweight feedback and skips navigation when visible list is empty', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9711,
          start_time: 1700315000,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 4321,
          league_name: 'League 4321',
        },
      ],
    });

    const onOpenMatchDatabase = vi.fn();
    render(<TeamProfilePage onOpenMatchDatabase={onOpenMatchDatabase} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByText('9711');
    fireEvent.click(screen.getByRole('button', { name: '切换分组 League 4321' }));

    fireEvent.click(screen.getByRole('button', { name: '在比赛数据库打开当前可见项' }));

    expect(onOpenMatchDatabase).not.toHaveBeenCalled();
    expect(await screen.findByText('当前没有可见比赛可在比赛数据库中打开。')).toBeTruthy();
  });

  it('exports visible matches via Blob download and disables export when no visible items', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 9801,
          start_time: 1700320000,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 300,
          league_name: 'Visible League',
        },
        {
          match_id: 9802,
          start_time: 1700321000,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 400,
          league_name: 'Collapsed League',
        },
      ],
    });

    const createObjectURLMock = vi.fn(() => 'blob:visible-export');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      value: createObjectURLMock,
      writable: true,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      value: revokeObjectURLMock,
      writable: true,
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByText('9801');

    fireEvent.click(screen.getByRole('button', { name: '导出可见比赛（.txt）' }));

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    });
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:visible-export');
    expect(await screen.findByText('已导出 2 场可见比赛。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '切换分组 Visible League' }));
    fireEvent.click(screen.getByRole('button', { name: '切换分组 Collapsed League' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '导出可见比赛（.txt）' }).getAttribute('disabled')
      ).not.toBeNull();
    });
  });

  it('renders League Compare top leagues and applies quick filter when clicked', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 9,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 10001,
          start_time: 1700400010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 100,
          league_name: 'League A',
        },
        {
          match_id: 10002,
          start_time: 1700400020,
          duration: 1900,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 100,
          league_name: 'League A',
        },
        {
          match_id: 10003,
          start_time: 1700400030,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 100,
          league_name: 'League A',
        },
        {
          match_id: 10011,
          start_time: 1700401010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 200,
          league_name: 'League B',
        },
        {
          match_id: 10012,
          start_time: 1700401020,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 200,
          league_name: 'League B',
        },
        {
          match_id: 10021,
          start_time: 1700402010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 300,
          league_name: 'League C',
        },
        {
          match_id: 10031,
          start_time: 1700403010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 400,
          league_name: 'League D',
        },
        {
          match_id: 10041,
          start_time: 1700404010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 500,
          league_name: 'League E',
        },
        {
          match_id: 10051,
          start_time: 1700000000,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 600,
          league_name: 'League F',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-compare');

    expect(screen.getByTestId('league-compare-row-league-100')).toBeTruthy();
    expect(screen.getByTestId('league-compare-row-league-200')).toBeTruthy();
    expect(screen.getByTestId('league-compare-row-league-300')).toBeTruthy();
    expect(screen.getByTestId('league-compare-row-league-400')).toBeTruthy();
    expect(screen.getByTestId('league-compare-row-league-500')).toBeTruthy();
    expect(screen.queryByTestId('league-compare-row-league-600')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '应用联赛对比筛选 League B' }));

    await waitFor(() => {
      expect((screen.getByLabelText('联赛快捷筛选') as HTMLSelectElement).value).toBe('league-200');
    });
    expect(screen.getByTestId('league-group-league-200')).toBeTruthy();
    expect(screen.queryByTestId('league-group-league-100')).toBeNull();
  });

  it('pins top league from League Compare into League Quick Filter', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 4,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 12001,
          start_time: 1700600100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 901,
          league_name: 'Top League',
        },
        {
          match_id: 12002,
          start_time: 1700600200,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 901,
          league_name: 'Top League',
        },
        {
          match_id: 12003,
          start_time: 1700600300,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 902,
          league_name: 'Other League',
        },
        {
          match_id: 12004,
          start_time: 1700600400,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 903,
          league_name: 'Third League',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-compare');
    fireEvent.click(screen.getByRole('button', { name: '固定榜首联赛' }));

    await waitFor(() => {
      expect((screen.getByLabelText('联赛快捷筛选') as HTMLSelectElement).value).toBe('league-901');
    });
    expect(await screen.findByText('已固定榜首联赛：Top League。')).toBeTruthy();
    expect(screen.getByTestId('league-group-league-901')).toBeTruthy();
    expect(screen.queryByTestId('league-group-league-902')).toBeNull();
  });

  it('applies league compare multi-select filter and clears back to quick-filter view', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 4,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 10101,
          start_time: 1700900010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 101,
          league_name: 'League One',
        },
        {
          match_id: 10102,
          start_time: 1700900020,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 202,
          league_name: 'League Two',
        },
        {
          match_id: 10103,
          start_time: 1700900030,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 303,
          league_name: 'League Three',
        },
        {
          match_id: 10104,
          start_time: 1700900040,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 202,
          league_name: 'League Two',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-compare');
    fireEvent.click(screen.getByLabelText('聚焦：最近联赛'));

    fireEvent.click(screen.getByLabelText('选择联赛对比 League One'));
    fireEvent.click(screen.getByLabelText('选择联赛对比 League Three'));
    fireEvent.click(screen.getByRole('button', { name: '应用已选联赛' }));

    await waitFor(() => {
      expect((screen.getByLabelText('聚焦：最近联赛') as HTMLInputElement).checked).toBe(false);
    });
    expect(screen.getByTestId('league-group-league-101')).toBeTruthy();
    expect(screen.getByTestId('league-group-league-303')).toBeTruthy();
    expect(screen.queryByTestId('league-group-league-202')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '清除选择' }));

    await waitFor(() => {
      expect(screen.getByTestId('league-group-league-202')).toBeTruthy();
    });
  });

  it('prepares selected leagues from compare selection and shows summary counts', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 11101,
          start_time: 1701000010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 111,
          league_name: 'League One',
        },
        {
          match_id: 11102,
          start_time: 1701000020,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 222,
          league_name: 'League Two',
        },
        {
          match_id: 11103,
          start_time: 1701000030,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 333,
          league_name: 'League Three',
        },
      ],
    });

    const triggerSpy = vi
      .spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockResolvedValueOnce({ status: 'ok', message: 'prepared', task: null })
      .mockRejectedValueOnce(new Error('HTTP 500'));

    vi.spyOn(console, 'error').mockImplementation(() => { });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-compare');

    fireEvent.click(screen.getByLabelText('选择联赛对比 League One'));
    fireEvent.click(screen.getByLabelText('选择联赛对比 League Two'));
    fireEvent.click(screen.getByRole('button', { name: '准备已选联赛' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(2);
    });
    expect(triggerSpy).toHaveBeenCalledWith(11101, 'prepare');
    expect(triggerSpy).toHaveBeenCalledWith(11102, 'prepare');

    await waitFor(() => {
      expect(screen.getByTestId('prepare-visible-summary').textContent).toContain(
        '准备已选联赛完成： 总计 2 / 成功 1 / 失败 1'
      );
    });
  });

  it('exports compare-selected visible matches and keeps export disabled when no compare selection', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 11201,
          start_time: 1701200030,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 111,
          league_name: 'League One',
        },
        {
          match_id: 11202,
          start_time: 1701200020,
          duration: 1900,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 111,
          league_name: 'League One',
        },
        {
          match_id: 11203,
          start_time: 1701200010,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 222,
          league_name: 'League Two',
        },
      ],
    });

    const createObjectURLMock = vi.fn((_: Blob) => 'blob:compare-export');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      value: createObjectURLMock,
      writable: true,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      value: revokeObjectURLMock,
      writable: true,
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-compare');

    expect(
      screen.getByRole('button', { name: '导出对比选择（.txt）' }).getAttribute('disabled')
    ).not.toBeNull();

    fireEvent.click(screen.getByLabelText('选择联赛对比 League One'));
    fireEvent.click(screen.getByRole('button', { name: '导出对比选择（.txt）' }));

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    });
    const exportedBlob = createObjectURLMock.mock.calls[0][0] as Blob;
    await expect(exportedBlob.text()).resolves.toBe(
      '11201\t111\t1701200030\n11202\t111\t1701200020'
    );
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:compare-export');
  });

  it('opens compare first 3 replays with one navigation and prepare summary feedback', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 5,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 11301,
          start_time: 1701300050,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 333,
          league_name: 'League Three',
        },
        {
          match_id: 11302,
          start_time: 1701300040,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 333,
          league_name: 'League Three',
        },
        {
          match_id: 11303,
          start_time: 1701300030,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 333,
          league_name: 'League Three',
        },
        {
          match_id: 11304,
          start_time: 1701300020,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 333,
          league_name: 'League Three',
        },
        {
          match_id: 11305,
          start_time: 1701300010,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 444,
          league_name: 'League Four',
        },
      ],
    });

    vi.spyOn(console, 'error').mockImplementation(() => { });
    const triggerSpy = vi
      .spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockResolvedValueOnce({ status: 'ok', message: 'prepared', task: null })
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce({ status: 'ok', message: 'prepared', task: null });

    const onOpenReplay = vi.fn();
    render(<TeamProfilePage onOpenReplay={onOpenReplay} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByTestId('league-compare');

    expect(
      screen.getByRole('button', { name: '打开对比首 3 场回放' }).getAttribute('disabled')
    ).not.toBeNull();

    fireEvent.click(screen.getByLabelText('选择联赛对比 League Three'));
    fireEvent.click(screen.getByRole('button', { name: '打开对比首 3 场回放' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(3);
    });
    expect(triggerSpy).toHaveBeenNthCalledWith(1, 11301, 'prepare');
    expect(triggerSpy).toHaveBeenNthCalledWith(2, 11302, 'prepare');
    expect(triggerSpy).toHaveBeenNthCalledWith(3, 11303, 'prepare');

    expect(onOpenReplay).toHaveBeenCalledTimes(1);
    expect(onOpenReplay).toHaveBeenCalledWith({
      source: 'team_profile',
      matchId: 11301,
    });
    expect(
      await screen.findByText(
        '打开对比首 3 场回放完成：准备成功=2，准备失败=1，已打开比赛=11301。'
      )
    ).toBeTruthy();
  });

  it('saves multiple snapshots and loads selected snapshot by name', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 3,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 13001,
          start_time: 1700700100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 1001,
          league_name: 'Snapshot A',
          download_status: 'prepared',
        },
        {
          match_id: 13002,
          start_time: 1700700200,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 1002,
          league_name: 'Snapshot B',
        },
        {
          match_id: 13003,
          start_time: 1700700300,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 1002,
          league_name: 'Snapshot B',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByText('13001');

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'Preset A' },
    });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-1002' },
    });
    fireEvent.click(screen.getByLabelText('仅显示有下载状态'));
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));

    expect(await screen.findByText('快照“Preset A”已保存。')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'Preset B' },
    });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByLabelText('仅显示有下载状态'));
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));

    expect(await screen.findByText('快照“Preset B”已保存。')).toBeTruthy();
    expect((screen.getByLabelText('快照列表') as HTMLSelectElement).value).toBe('Preset B');

    fireEvent.change(screen.getByLabelText('快照列表'), {
      target: { value: 'Preset A' },
    });

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'all' },
    });

    fireEvent.click(screen.getByRole('button', { name: '加载快照' }));

    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenLastCalledWith({ team_id: 15, limit: 20, offset: 0 });
    });
    await waitFor(() => {
      expect((screen.getByLabelText('战队 ID') as HTMLInputElement).value).toBe('15');
    });
    expect((screen.getByLabelText('联赛快捷筛选') as HTMLSelectElement).value).toBe('league-1002');
    expect((screen.getByLabelText('仅显示有下载状态') as HTMLInputElement).checked).toBe(true);
    expect(await screen.findByText('快照“Preset A”已加载并刷新数据。')).toBeTruthy();
  });

  it('applies snapshot from Apply Snapshot button and restores key filters', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 14001,
          start_time: 1701100100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 501,
          league_name: 'Apply League',
          download_status: 'prepared',
        },
        {
          match_id: 14002,
          start_time: 1701100200,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 601,
          league_name: 'Other League',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('14001');

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'Apply Preset' },
    });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-501' },
    });
    fireEvent.click(screen.getByLabelText('仅显示有下载状态'));
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));
    await screen.findByText('快照“Apply Preset”已保存。');

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByLabelText('仅显示有下载状态'));

    fireEvent.click(screen.getByRole('button', { name: '应用快照' }));

    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenLastCalledWith({ team_id: 15, limit: 20, offset: 0 });
    });
    await waitFor(() => {
      expect((screen.getByLabelText('战队 ID') as HTMLInputElement).value).toBe('15');
    });
    expect((screen.getByLabelText('联赛快捷筛选') as HTMLSelectElement).value).toBe('league-501');
    expect((screen.getByLabelText('仅显示有下载状态') as HTMLInputElement).checked).toBe(true);
    expect(await screen.findByText('快照“Apply Preset”已应用并刷新数据。')).toBeTruthy();
  });

  it('overwrites snapshot when saving the same name', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 13101,
          start_time: 1700701100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 2001,
          league_name: 'Overwrite A',
        },
        {
          match_id: 13102,
          start_time: 1700701200,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 2002,
          league_name: 'Overwrite B',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('13101');

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'Reusable' },
    });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-2001' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));
    expect(await screen.findByText('快照“Reusable”已保存。')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-2002' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));
    expect(await screen.findByText('快照“Reusable”已更新。')).toBeTruthy();

    const snapshotOptions = Array.from(
      (screen.getByLabelText('快照列表') as HTMLSelectElement).options
    ).map((option) => option.value);
    expect(snapshotOptions).toEqual(['Reusable']);

    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByRole('button', { name: '加载快照' }));

    await waitFor(() => {
      expect((screen.getByLabelText('联赛快捷筛选') as HTMLSelectElement).value).toBe('league-2002');
    });
  });

  it('exports snapshots and imports snapshots with merge + overwrite', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 13301,
          start_time: 1700801100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 4001,
          league_name: 'Import League A',
        },
        {
          match_id: 13302,
          start_time: 1700801200,
          duration: 1900,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 4002,
          league_name: 'Import League B',
        },
      ],
    });

    const createObjectURLMock = vi.fn((_: Blob) => 'blob:snapshot-export');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      value: createObjectURLMock,
      writable: true,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      value: revokeObjectURLMock,
      writable: true,
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('13301');

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'Preset A' },
    });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-4001' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));
    await screen.findByText('快照“Preset A”已保存。');

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'Preset B' },
    });
    fireEvent.change(screen.getByLabelText('联赛快捷筛选'), {
      target: { value: 'league-4002' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));
    await screen.findByText('快照“Preset B”已保存。');

    fireEvent.click(screen.getByRole('button', { name: '导出快照（.json）' }));
    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    });
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:snapshot-export');

    const importPayload = {
      snapshots: [
        {
          name: 'Preset A',
          teamIdInput: '15',
          limitInput: '20',
          selectedLeagueFilterKey: 'league-4002',
          sortOrder: 'desc',
          onlyWithDownloadStatus: false,
          focusLatestLeague: false,
        },
        {
          name: 'Preset C',
          teamIdInput: '15',
          limitInput: '50',
          selectedLeagueFilterKey: 'all',
          sortOrder: 'asc',
          onlyWithDownloadStatus: true,
          focusLatestLeague: false,
        },
        {
          name: '',
          teamIdInput: 'x',
        },
      ],
    };
    const importFile = new File([JSON.stringify(importPayload)], 'snapshots.json', {
      type: 'application/json',
    });

    fireEvent.change(screen.getByLabelText('导入快照文件'), {
      target: { files: [importFile] },
    });

    expect(await screen.findByText('导入完成：有效 2, 无效 1, 覆盖 1.')).toBeTruthy();

    const snapshotOptions = Array.from(
      (screen.getByLabelText('快照列表') as HTMLSelectElement).options
    ).map((option) => option.value);
    expect(snapshotOptions).toEqual(['Preset A', 'Preset B', 'Preset C']);

    fireEvent.change(screen.getByLabelText('快照列表'), {
      target: { value: 'Preset A' },
    });
    fireEvent.click(screen.getByRole('button', { name: '加载快照' }));

    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenLastCalledWith({ team_id: 15, limit: 20, offset: 0 });
    });
    expect((screen.getByLabelText('联赛快捷筛选') as HTMLSelectElement).value).toBe('league-4002');
  });

  it('clears all snapshots and disables load/delete actions', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 13201,
          start_time: 1700702100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 3001,
          league_name: 'Clear League',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('13201');

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'One' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));
    expect(await screen.findByText('快照“One”已保存。')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('快照名称'), {
      target: { value: 'Two' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存快照' }));
    expect(await screen.findByText('快照“Two”已保存。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '清空全部快照' }));

    await screen.findByText('已清空 2 个快照。');
    expect((screen.getByLabelText('快照列表') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('button', { name: '加载快照' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: '删除快照' }).getAttribute('disabled')).not.toBeNull();
  });

  it('copies visible match ids in current order and disables copy when visible list is empty', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 11001,
          start_time: 1700500100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 700,
          league_name: 'League Copy 1',
        },
        {
          match_id: 11002,
          start_time: 1700500900,
          duration: 1800,
          radiant_team_id: 39,
          dire_team_id: 15,
          leagueid: 800,
          league_name: 'League Copy 2',
        },
      ],
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await screen.findByText('11001');

    fireEvent.click(screen.getByRole('button', { name: '复制可见比赛 ID' }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('11002,11001');
    });
    expect(await screen.findByText('已复制 2 个比赛 ID。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '切换分组 League Copy 1' }));
    fireEvent.click(screen.getByRole('button', { name: '切换分组 League Copy 2' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '复制可见比赛 ID' }).getAttribute('disabled')
      ).not.toBeNull();
    });
  });

  it('adds action history entry after Prepare Visible Matches action', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 15001,
          start_time: 1701500100,
          duration: 2000,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 9010,
          league_name: 'History League',
        },
      ],
    });

    const triggerSpy = vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('15001');

    fireEvent.click(screen.getByRole('button', { name: '准备当前可见比赛' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledWith(15001, 'prepare');
    });

    const historyList = await screen.findByTestId('action-history-list');
    expect(historyList.textContent).toContain('准备当前可见比赛');
    expect(historyList.textContent).toContain('总计 1 / 成功 1 / 失败 0');
  });

  it('replays recorded Prepare Visible Matches action and triggers API again', async () => {
    const getMatchesSpy = vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 15011,
          start_time: 1701501100,
          duration: 2100,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 9011,
          league_name: 'Replay League',
        },
      ],
    });

    const triggerSpy = vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('15011');

    fireEvent.click(screen.getByRole('button', { name: '准备当前可见比赛' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '重放操作 准备当前可见比赛' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(getMatchesSpy).toHaveBeenCalledTimes(3);
    });
  });

  it('replays recorded Open Visible In Match Database action and triggers navigation again', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 15021,
          start_time: 1701502100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 7777,
          league_name: 'Replay Nav League',
        },
      ],
    });

    const onOpenMatchDatabase = vi.fn();
    render(<TeamProfilePage onOpenMatchDatabase={onOpenMatchDatabase} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('15021');

    fireEvent.click(screen.getByRole('button', { name: '在比赛数据库打开当前可见项' }));

    expect(onOpenMatchDatabase).toHaveBeenCalledTimes(1);
    expect(onOpenMatchDatabase).toHaveBeenLastCalledWith({ teamId: 15 });

    fireEvent.click(screen.getByRole('button', { name: '重放操作 在比赛数据库打开当前可见项' }));

    await waitFor(() => {
      expect(onOpenMatchDatabase).toHaveBeenCalledTimes(2);
    });
    expect(onOpenMatchDatabase).toHaveBeenLastCalledWith({ teamId: 15 });
  });

  it('filters action history by selected history type', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 16001,
          start_time: 1701600100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 8101,
          league_name: 'History Filter League',
        },
      ],
    });

    vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });

    const onOpenMatchDatabase = vi.fn();
    render(<TeamProfilePage onOpenMatchDatabase={onOpenMatchDatabase} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('16001');

    fireEvent.click(screen.getByRole('button', { name: '准备当前可见比赛' }));
    await waitFor(() => {
      expect(screen.getByTestId('action-history-list').textContent).toContain('准备当前可见比赛');
    });

    fireEvent.click(screen.getByRole('button', { name: '在比赛数据库打开当前可见项' }));
    expect(onOpenMatchDatabase).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByTestId('action-history-list').textContent).toContain(
        '在比赛数据库打开当前可见项'
      );
    });

    fireEvent.change(screen.getByLabelText('历史筛选'), {
      target: { value: 'prepare_visible_matches' },
    });

    await waitFor(() => {
      const historyListText = screen.getByTestId('action-history-list').textContent ?? '';
      expect(historyListText).toContain('准备当前可见比赛');
      expect(historyListText).not.toContain('在比赛数据库打开当前可见项');
    });
  });

  it('clears visible history by filter and clears all history with count feedback', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 16011,
          start_time: 1701601100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 8102,
          league_name: 'History Clear League',
        },
      ],
    });

    vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });

    const onOpenMatchDatabase = vi.fn();
    render(<TeamProfilePage onOpenMatchDatabase={onOpenMatchDatabase} />);

    expect(screen.getByRole('button', { name: '清除可见历史' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: '清除全部历史' }).getAttribute('disabled')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('16011');

    fireEvent.click(screen.getByRole('button', { name: '准备当前可见比赛' }));
    await waitFor(() => {
      expect(screen.getByTestId('action-history-list').textContent).toContain('准备当前可见比赛');
    });

    fireEvent.click(screen.getByRole('button', { name: '在比赛数据库打开当前可见项' }));
    await waitFor(() => {
      expect(screen.getByTestId('action-history-list').textContent).toContain(
        '在比赛数据库打开当前可见项'
      );
    });

    fireEvent.change(screen.getByLabelText('历史筛选'), {
      target: { value: 'prepare_visible_matches' },
    });
    fireEvent.click(screen.getByRole('button', { name: '清除可见历史' }));

    expect(await screen.findByText('已清除 1 条可见历史记录。')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('历史筛选'), {
      target: { value: 'all' },
    });

    await waitFor(() => {
      const historyListText = screen.getByTestId('action-history-list').textContent ?? '';
      expect(historyListText).toContain('在比赛数据库打开当前可见项');
      expect(historyListText).not.toContain('准备当前可见比赛');
    });

    fireEvent.change(screen.getByLabelText('历史筛选'), {
      target: { value: 'open_compare_first_3_replays' },
    });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '清除可见历史' }).getAttribute('disabled')
      ).not.toBeNull();
    });

    fireEvent.change(screen.getByLabelText('历史筛选'), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByRole('button', { name: '清除全部历史' }));

    expect(await screen.findByText('已清除 1 条历史记录。')).toBeTruthy();
    expect(await screen.findByText('暂无操作记录。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '清除全部历史' }).getAttribute('disabled')).not.toBeNull();
  });

  it('replays visible action history sequentially and shows replay summary', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 17001,
          start_time: 1701700100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 9101,
          league_name: 'Replay Visible League',
        },
      ],
    });

    const triggerSpy = vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'prepared',
      task: null,
    });
    const onOpenMatchDatabase = vi.fn();

    render(<TeamProfilePage onOpenMatchDatabase={onOpenMatchDatabase} />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('17001');

    fireEvent.click(screen.getByRole('button', { name: '准备当前可见比赛' }));
    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '在比赛数据库打开当前可见项' }));
    expect(onOpenMatchDatabase).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '重放可见历史' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(onOpenMatchDatabase).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText('重放可见历史完成：重放 2 / 成功 2 / 失败 0。')
    ).toBeTruthy();
  });

  it('shows Retry for failed history entries and retries the recorded action', async () => {
    vi.spyOn(teamProfileService, 'getTeamMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 17011,
          start_time: 1701701100,
          duration: 1800,
          radiant_team_id: 15,
          dire_team_id: 39,
          leagueid: 9102,
          league_name: 'Retry League',
        },
      ],
    });

    const triggerSpy = vi
      .spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockResolvedValueOnce({ status: 'error', message: 'failed', task: null })
      .mockResolvedValueOnce({ status: 'ok', message: 'prepared', task: null });

    render(<TeamProfilePage />);

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByText('17011');

    fireEvent.click(screen.getByRole('button', { name: '准备当前可见比赛' }));

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(1);
    });
    const retryButton = await screen.findByRole('button', {
      name: '重试操作 准备当前可见比赛',
    });
    expect(retryButton).toBeTruthy();

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '重试操作 准备当前可见比赛' })).toBeNull();
    });
  });
});
