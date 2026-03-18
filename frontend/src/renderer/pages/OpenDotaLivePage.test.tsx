// @vitest-environment jsdom


import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OpenDotaLivePage from './OpenDotaLivePage';
import { remoteService } from '../api/remoteService';

describe('OpenDotaLivePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('uses filter params when querying remote matches', async () => {
    const listSpy = vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<OpenDotaLivePage />);
    await screen.findByText('未找到实时比赛。');

    listSpy.mockClear();
    fireEvent.click(screen.getByLabelText('路人'));
    fireEvent.change(screen.getByLabelText('match_id'), { target: { value: '8674716612' } });
    fireEvent.change(screen.getByLabelText('leagueid'), { target: { value: '15475' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(listSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          match_id: 8674716612,
          leagueid: 15475,
          sources: ['pro', 'public'],
        })
      );
    });
  });

  it('renders grouped responsive filter cards for live match search', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<OpenDotaLivePage />);
    await screen.findByText('未找到实时比赛。');

    expect(screen.getByTestId('live-filter-form').className).toContain('xl:grid-cols-2');
    expect(screen.getByTestId('live-source-filter-group').className).toContain('xl:col-span-2');
    expect(screen.getByTestId('live-source-filter-group').className).toContain('2xl:col-span-1');
    expect(screen.getByTestId('live-filter-actions').className).toContain('xl:col-span-2');
    expect(screen.getByTestId('live-filter-actions').className).toContain('2xl:col-span-1');
    expect(screen.getByTestId('live-filter-button-row').className).toContain('workspace-action-row');
    expect(screen.getByTestId('live-batch-button-row').className).toContain('workspace-action-row');
    expect(screen.getByTestId('live-filter-button-row').className).not.toContain('2xl:grid-cols-1');
    expect(screen.getByTestId('live-batch-button-row').className).not.toContain('2xl:grid-cols-1');
    expect(within(screen.getByTestId('live-source-filter-group')).getByText('来源')).toBeTruthy();
    expect(screen.getByLabelText('match_id')).toBeTruthy();
    expect(screen.getByLabelText('leagueid')).toBeTruthy();
    expect(within(screen.getByTestId('live-filter-actions')).getByText('动作')).toBeTruthy();
  });

  it('calls ingest API for single row action', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 1,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8674716612,
          start_time: 1700054321,
          duration: 2450,
          source: 'pro',
        },
      ],
    });

    const ingestSpy = vi.spyOn(remoteService, 'ingestMatches').mockResolvedValue({
      status: 'ok',
      message: 'ingest queued',
    });

    render(<OpenDotaLivePage />);

    fireEvent.click(await screen.findByRole('button', { name: '下载并入库' }));

    await waitFor(() => {
      expect(ingestSpy).toHaveBeenCalledWith([8674716612]);
    });
  });

  it('calls ingest API for selected batch rows', async () => {
    vi.spyOn(remoteService, 'getRemoteMatches').mockResolvedValue({
      status: 'ok',
      total: 2,
      limit: 20,
      offset: 0,
      matches: [
        {
          match_id: 8674716612,
          start_time: 1700054321,
          duration: 2450,
          source: 'pro',
        },
        {
          match_id: 8676017978,
          start_time: 1700055333,
          duration: 2550,
          source: 'pro',
        },
      ],
    });

    const ingestSpy = vi.spyOn(remoteService, 'ingestMatches').mockResolvedValue({
      status: 'ok',
      message: 'batch ingest queued',
    });

    render(<OpenDotaLivePage />);

    fireEvent.click(await screen.findByLabelText('全选当前页'));
    fireEvent.click(screen.getByRole('button', { name: '批量下载并入库' }));

    await waitFor(() => {
      expect(ingestSpy).toHaveBeenCalledWith([8674716612, 8676017978]);
    });
  });
});
