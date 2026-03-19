// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { useMatchStore } from './store';

vi.mock('./pages/MatchDatabasePage', () => ({
  __esModule: true,
  default: () => {
    const { selectMatch } = useMatchStore();
    return (
      <button
        onClick={() =>
          selectMatch(8674716612, {
            source: 'match_database',
            matchId: 8674716612,
            downloadStatus: 'prepared',
            downloadTaskId: 'task-8674716612-1',
          })
        }
      >
        Mock Open Replay
      </button>
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
    replayEntryContext?: { source?: string; downloadStatus?: string } | null;
  }) => (
    <div>
      <span data-testid="viewer-match">{String(initialMatchId)}</span>
      <span data-testid="viewer-source">{replayEntryContext?.source ?? 'none'}</span>
      <span data-testid="viewer-status">{replayEntryContext?.downloadStatus ?? 'none'}</span>
    </div>
  ),
}));

describe('App Match Database replay navigation', () => {
  it('navigates to replay viewer with Match Database context', async () => {
    render(
      <MemoryRouter initialEntries={['/matchDatabase']}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: '比赛数据库' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock Open Replay' }));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-match').textContent).toBe('8674716612');
    });
    expect(screen.getByTestId('viewer-source').textContent).toBe('match_database');
    expect(screen.getByTestId('viewer-status').textContent).toBe('prepared');
    expect(screen.getByRole('button', { name: '← 返回' })).toBeTruthy();
    expect(screen.getByTestId('replay-viewer-shell').className).toContain('flex-col');
    expect(screen.getByTestId('replay-viewer-topbar').className).toContain('flex-none');
    expect(screen.getByTestId('return-to-workspace-button').className).toContain('max-w-[15rem]');
    expect(screen.getByTestId('return-to-workspace-button').className).toContain('2xl:max-w-none');
    expect(screen.getByTestId('return-to-workspace-button').className).not.toContain('absolute');
    expect(screen.getByTestId('replay-back-button-label').className).toContain('hidden');
    expect(screen.getByTestId('replay-back-button-label').className).toContain('2xl:block');
  });
});
