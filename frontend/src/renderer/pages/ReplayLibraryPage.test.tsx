// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReplayLibraryPage from './ReplayLibraryPage';
import { libraryService } from '../api/libraryService';

describe('ReplayLibraryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
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
});
