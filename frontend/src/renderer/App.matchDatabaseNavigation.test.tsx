// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./pages/MatchDatabasePage', () => ({
  __esModule: true,
  default: ({ onOpenReplay }: { onOpenReplay?: (context: unknown) => void }) => (
    <button
      onClick={() =>
        onOpenReplay?.({
          source: 'match_database',
          matchId: 8674716612,
          downloadStatus: 'prepared',
          downloadTaskId: 'task-8674716612-1',
        })
      }
    >
      Mock Open Replay
    </button>
  ),
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
  it('navigates to replay viewer with Match Database context', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '比赛数据库' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock Open Replay' }));

    expect(screen.getByTestId('viewer-match').textContent).toBe('8674716612');
    expect(screen.getByTestId('viewer-source').textContent).toBe('match_database');
    expect(screen.getByTestId('viewer-status').textContent).toBe('prepared');
    expect(screen.getByRole('button', { name: '返回比赛数据库' })).toBeTruthy();
  });
});
