// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { useMatchStore, useNavigationStore } from './store';

vi.mock('./pages/MatchDatabasePage', () => ({
  __esModule: true,
  default: () => <div>Mock Match Database</div>,
}));

vi.mock('./pages/TeamProfilePage', () => ({
  __esModule: true,
  default: () => {
    const { selectMatch } = useMatchStore();
    const { setTeamProfileViewState, teamProfileViewState } = useNavigationStore();
    
    return (
      <div>
        <span data-testid="team-profile-state-team-id">{teamProfileViewState?.teamId ?? 'none'}</span>
        <span data-testid="team-profile-state-league-filter">
          {teamProfileViewState?.leagueQuickFilter ?? 'none'}
        </span>
        <button
          onClick={() => {
            setTeamProfileViewState({
              teamId: 15,
              limit: 50,
              leagueQuickFilter: 15475,
              sort: 'newest',
              onlyWithDownload: true,
              focusLatestLeague: false,
              presetView: 'all',
              compareSelection: [],
              expandedLeagues: new Set(),
              snapshots: [],
            });
            selectMatch(8674716612, {
              source: 'team_profile',
              matchId: 8674716612,
            });
          }}
        >
          Mock Open Replay From Team Profile
        </button>
      </div>
    );
  },
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
  it('returns to Team Profile and restores in-session view state', async () => {
    render(
      <MemoryRouter initialEntries={['/teamProfile']}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: '战队档案' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock Open Replay From Team Profile' }));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-match').textContent).toBe('8674716612');
    });
    expect(screen.getByTestId('viewer-source').textContent).toBe('team_profile');
    expect(screen.getByRole('button', { name: '← 返回' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '← 返回' }));

    await waitFor(() => {
      expect(screen.getByTestId('team-profile-state-team-id').textContent).toBe('15');
    });
    expect(screen.getByTestId('team-profile-state-league-filter').textContent).toBe('15475');
  });
});
