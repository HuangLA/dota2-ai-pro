// @vitest-environment jsdom


import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReplayLibraryPage from './ReplayLibraryPage';
import { libraryService } from '../api/libraryService';
import { remoteService } from '../api/remoteService';

describe('ReplayLibraryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
    vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });
  });

  it('loads and renders replay library list', async () => {
    const listSpy = vi.spyOn(libraryService, 'getLibraryMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8674716612,
          start_time: 1700054321,
          duration: 2450,
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          replay_path: 'backend/data/replays/8674716612.dem.bz2',
          parse_status: 'completed',
        },
      ],
    });

    render(<ReplayLibraryPage />);

    expect(await screen.findByText('8674716612')).toBeTruthy();
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
    });
  });

  it('calls delete API when deleting local replay', async () => {
    const listSpy = vi.spyOn(libraryService, 'getLibraryMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8674716612,
          start_time: 1700054321,
          duration: 2450,
          replay_path: 'backend/data/replays/8674716612.dem.bz2',
          parse_status: 'completed',
        },
      ],
    });

    const deleteSpy = vi.spyOn(libraryService, 'deleteLibraryMatch').mockResolvedValue({
      status: 'ok',
      message: 'deleted',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ReplayLibraryPage />);

    fireEvent.click(await screen.findByRole('button', { name: '删除本地录像' }));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(8674716612);
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('calls open replay callback when action clicked', async () => {
    vi.spyOn(libraryService, 'getLibraryMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8674716612,
          start_time: 1700054321,
          duration: 2450,
          replay_path: 'backend/data/replays/8674716612.dem.bz2',
          parse_status: 'completed',
        },
      ],
    });

    const onOpenReplay = vi.fn();
    render(<ReplayLibraryPage onOpenReplay={onOpenReplay} />);

    fireEvent.click(await screen.findByRole('button', { name: '打开回放' }));

    expect(onOpenReplay).toHaveBeenCalledWith(8674716612);
  });

  it('searches OpenDota candidates when player or league filters are applied', async () => {
    vi.spyOn(libraryService, 'getLibraryMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });
    const remoteSearchSpy = vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8123456789,
          start_time: 1700054321,
          duration: 2450,
          radiant_team_name: 'Team Spirit',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          leagueid: 15475,
          source: 'pro',
          last_synced_at: 1700054500,
          download_status: null,
          local_parse_status: null,
        },
      ],
    });

    render(<ReplayLibraryPage />);

    fireEvent.change(screen.getByLabelText('player_id'), { target: { value: '90001' } });
    fireEvent.change(screen.getByLabelText('leagueid'), { target: { value: '15475' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    expect(await screen.findByText('8123456789')).toBeTruthy();
    await waitFor(() => {
      expect(remoteSearchSpy).toHaveBeenLastCalledWith({
        player_id: 90001,
        leagueid: 15475,
        limit: 20,
      });
    });
  });

  it('ingests remote candidate matches from search results', async () => {
    vi.spyOn(libraryService, 'getLibraryMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });
    vi.spyOn(remoteService, 'searchRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8123456789,
          start_time: 1700054321,
          duration: 2450,
          radiant_team_name: 'Team Spirit',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          leagueid: 15475,
          source: 'pro',
          last_synced_at: 1700054500,
          download_status: null,
          local_parse_status: null,
        },
      ],
    });
    const ingestSpy = vi.spyOn(remoteService, 'ingestMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [
        {
          match_id: 8123456789,
          status: 'completed',
          task_id: 'task-1',
        },
      ],
    });

    render(<ReplayLibraryPage />);

    fireEvent.change(screen.getByLabelText('leagueid'), { target: { value: '15475' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    fireEvent.click(await screen.findByRole('button', { name: '下载并入库' }));

    await waitFor(() => {
      expect(ingestSpy).toHaveBeenCalledWith([8123456789]);
    });
    expect(await screen.findByText('比赛 8123456789 已加入下载与解析流水线。')).toBeTruthy();
  });
});
