// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./pages/MatchDatabasePage', () => ({
  __esModule: true,
  default: () => <div>Mock Match Database</div>,
}));

vi.mock('./pages/TeamProfilePage', () => ({
  __esModule: true,
  default: ({
    onViewStateChange,
    onOpenReplay,
    initialViewState,
  }: {
    onViewStateChange?: (viewState: unknown) => void;
    onOpenReplay?: (context: unknown) => void;
    initialViewState?: { teamIdInput?: string; selectedLeagueFilterKey?: string };
  }) => (
    <div>
      <span data-testid="team-profile-state-team-id">{initialViewState?.teamIdInput ?? 'none'}</span>
      <span data-testid="team-profile-state-league-filter">
        {initialViewState?.selectedLeagueFilterKey ?? 'none'}
      </span>
      <button
        onClick={() => {
          onViewStateChange?.({
            teamIdInput: '15',
            limitInput: '50',
            currentTeamId: 15,
            matches: [],
            onlyWithDownloadStatus: true,
            sortOrder: 'asc',
            selectedLeagueFilterKey: 'league-15475',
          });
          onOpenReplay?.({
            source: 'team_profile',
            matchId: 8674716612,
          });
        }}
      >
        Mock Open Replay From Team Profile
      </button>
    </div>
  ),
}));

vi.mock('./pages/RealMatchViewer', () => ({
  __esModule: true,
  default: ({
    initialMatchId,
    replayEntryContext,
  }: {
    initialMatchId?: number | null;
    replayEntryContext?: { source?: string } | null;
  }) => (
    <div>
      <span data-testid="viewer-match">{String(initialMatchId)}</span>
      <span data-testid="viewer-source">{replayEntryContext?.source ?? 'none'}</span>
    </div>
  ),
}));

describe('App Team Profile replay navigation', () => {
  it('returns to Team Profile and restores in-session view state', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '战队档案' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock Open Replay From Team Profile' }));

    expect(screen.getByTestId('viewer-match').textContent).toBe('8674716612');
    expect(screen.getByTestId('viewer-source').textContent).toBe('team_profile');
    expect(screen.getByRole('button', { name: '返回战队档案' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回战队档案' }));

    expect(screen.getByTestId('team-profile-state-team-id').textContent).toBe('15');
    expect(screen.getByTestId('team-profile-state-league-filter').textContent).toBe('league-15475');
  });
});
