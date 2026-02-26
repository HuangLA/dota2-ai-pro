// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  it('opens new pages from home entry buttons', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'OpenDota Live' }));
    expect(screen.getByText('Mock OpenDota Live Page')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));

    fireEvent.click(screen.getByRole('button', { name: 'Replay Library' }));
    expect(screen.getByText('Mock Replay Library Page')).toBeTruthy();
  });
});
