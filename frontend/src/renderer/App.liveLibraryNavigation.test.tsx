// @vitest-environment jsdom


import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

vi.mock('./pages/OpenDotaLivePage', () => ({
  __esModule: true,
  default: () => <div>Mock OpenDota Live Page</div>,
}));

vi.mock('./pages/ReplayLibraryPage', () => ({
  __esModule: true,
  default: () => <div>Mock Replay Library Page</div>,
}));

describe('App Live and Library navigation', () => {
  it('opens new pages from sidebar navigation', () => {
    render(
      <MemoryRouter initialEntries={['/openDotaLive']}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: '比赛数据库' }));

    // We mock OpenDotaPage and ReplayLibraryPage, but test checks Live and Library navigation
    fireEvent.click(screen.getByRole('link', { name: '本地录像库' }));
    expect(screen.getByText('Mock Replay Library Page')).toBeTruthy();
  });
});
