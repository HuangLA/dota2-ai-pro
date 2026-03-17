// @vitest-environment jsdom


import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MatchDatabasePage, { MatchDatabaseViewState } from './MatchDatabasePage';
import { matchDatabaseService } from '../api/matchDatabaseService';
import { formatDurationClock, formatUnixTimestampLocal } from './matchDatabaseFormatting';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createTaskDetails(status: string) {
  return {
    status: 'ok',
    message: 'Replay download task loaded.',
    task: {
      task_id: 'task-8674716612-1',
      match_id: 8674716612,
      status,
      attempt_count: 1,
      error_code: null,
      error_message: null,
      download_path: 'backend/data/replays/8674716612.dem.bz2',
      updated_at: 1700100010,
    },
  };
}

describe('MatchDatabasePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders key columns and match row after successful response', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: null,
          dire_team_name: 'Team Falcons',
          league_name: null,
          download_status: 'prepared',
          download_attempt_count: 1,
        },
      ],
    });

    render(<MatchDatabasePage />);

    expect(await screen.findByText('比赛 ID')).toBeTruthy();
    expect(await screen.findByText('下载状态')).toBeTruthy();
    expect(await screen.findByText('8123456789')).toBeTruthy();
    expect(await screen.findByText('未知战队（ID: 15）')).toBeTruthy();
    expect(await screen.findByText('未知联赛（ID: 15475）')).toBeTruthy();
    expect(await screen.findByText('已准备')).toBeTruthy();
  });

  it('sends professional_only=true by default', async () => {
    const listSpy = vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<MatchDatabasePage />);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          professional_only: true,
        })
      );
    });
  });

  it('sends professional_only=false after turning off professional-only switch', async () => {
    const listSpy = vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<MatchDatabasePage />);
    await screen.findByText('未找到记录。');

    listSpy.mockClear();
    fireEvent.click(screen.getByLabelText('仅职业联赛'));
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => {
      expect(listSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          professional_only: false,
        })
      );
    });
  });

  it('resets professional-only switch to true on clear', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<MatchDatabasePage />);
    await screen.findByText('未找到记录。');

    const professionalOnlyCheckbox = screen.getByLabelText('仅职业联赛') as HTMLInputElement;
    fireEvent.click(professionalOnlyCheckbox);
    expect(professionalOnlyCheckbox.checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '清空' }));
    expect(professionalOnlyCheckbox.checked).toBe(true);
  });

  it('renders status badge variants for prepared and failed rows', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 2,
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'prepared',
          download_attempt_count: 1,
        },
        {
          match_id: 8123456790,
          start_time: 1700055333,
          duration: 2550,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'failed',
          download_attempt_count: 2,
        },
      ],
    });

    render(<MatchDatabasePage />);

    expect(await screen.findByText('已准备')).toBeTruthy();
    expect(await screen.findByText('失败')).toBeTruthy();
  });

  it('formats duration and unix timestamp to readable values', () => {
    expect(formatDurationClock(65)).toBe('01:05');
    expect(formatDurationClock(3661)).toBe('01:01:01');

    const timestamp = 1700100010;
    const date = new Date(timestamp * 1000);
    const expected = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
      2,
      '0'
    )}`;

    expect(formatUnixTimestampLocal(timestamp)).toBe(expected);
  });

  it('calls action API with prepare_and_execute mode when download button clicked', async () => {
    const listSpy = vi
      .spyOn(matchDatabaseService, 'getMatchDatabase')
      .mockResolvedValue({
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
            radiant_team_name: 'Team Liquid',
            dire_team_name: 'Team Falcons',
            league_name: 'DreamLeague',
            download_status: 'none',
            download_attempt_count: 0,
          },
        ],
      });

    const actionSpy = vi
      .spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockResolvedValue({
        status: 'ok',
        message: 'Replay download prepare action finished.',
        task: {
          task_id: 'task-1',
          match_id: 8123456789,
          status: 'prepared',
        },
      });

    render(<MatchDatabasePage />);

    const actionButton = await screen.findByRole('button', { name: '下载录像' });
    fireEvent.click(actionButton);

    await waitFor(() => {
      expect(actionSpy).toHaveBeenCalledWith(8123456789, 'prepare_and_execute');
    });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('calls replay navigation callback with match download context', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'completed',
          download_task_id: 'task-8674716612-1',
          download_attempt_count: 1,
        },
      ],
    });

    const onOpenReplay = vi.fn();
    render(<MatchDatabasePage onOpenReplay={onOpenReplay} />);

    const openReplayButton = await screen.findByRole('button', { name: '打开回放' });
    fireEvent.click(openReplayButton);

    expect(onOpenReplay).toHaveBeenCalledWith({
      source: 'match_database',
      matchId: 8674716612,
      downloadStatus: 'completed',
      downloadTaskId: 'task-8674716612-1',
    });
  });

  it('disables replay entry when match is not ready yet', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'prepared',
          download_task_id: 'task-8674716612-1',
          download_attempt_count: 1,
        },
      ],
    });

    render(<MatchDatabasePage onOpenReplay={vi.fn()} />);

    const openReplayButton = await screen.findByRole('button', { name: '打开回放' });
    expect((openReplayButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('runs batch action on checked matches and shows summary with failed examples', async () => {
    const listSpy = vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 2,
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
        {
          match_id: 8676017978,
          start_time: 1700055333,
          duration: 2550,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
      ],
    });

    const actionSpy = vi
      .spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockImplementation(async (matchId) => {
        if (matchId === 8674716612) {
          return {
            status: 'ok',
            message: 'Replay download prepare action finished.',
            task: {
              task_id: 'task-1',
              match_id: 8674716612,
              status: 'prepared',
            },
          };
        }

        return {
          status: 'error',
          message: 'Controlled test failure.',
          task: null,
        };
      });

    render(<MatchDatabasePage />);

    fireEvent.click(await screen.findByLabelText('全选当前页'));
    fireEvent.click(await screen.findByRole('button', { name: '批量下载（勾选项）' }));

    await waitFor(() => {
      expect(actionSpy).toHaveBeenCalledTimes(2);
    });

    expect(actionSpy).toHaveBeenNthCalledWith(1, 8674716612, 'prepare_and_execute');
    expect(actionSpy).toHaveBeenNthCalledWith(2, 8676017978, 'prepare_and_execute');

    await waitFor(() => {
      expect(
        screen.getByText(
          '勾选批量下载完成。 总数：2，成功：1，失败：1，含任务ID：1。失败示例：8676017978: Controlled test failure.'
        )
      ).toBeTruthy();
    });

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('disables batch button when no rows are selected', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<MatchDatabasePage />);

    const batchDownloadButton = await screen.findByRole('button', {
      name: '批量下载（勾选项）',
    });

    expect((batchDownloadButton as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText('请先勾选要批量下载的比赛。')).toBeTruthy();
  });

  it('deletes replay for completed row when delete button clicked', async () => {
    const listSpy = vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'completed',
          download_path: 'backend/data/replays/8123456789.dem.bz2',
          download_attempt_count: 1,
        },
      ],
    });

    const deleteSpy = vi.spyOn(matchDatabaseService, 'deleteReplay').mockResolvedValue({
      status: 'ok',
      message: 'Replay files deleted for match_id=8123456789.',
      task: {
        task_id: 'task-delete-1',
        match_id: 8123456789,
        status: 'completed',
      },
    });

    render(<MatchDatabasePage />);

    const deleteButton = await screen.findByRole('button', { name: '删除录像' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(8123456789);
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('batch download only triggers checked rows', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 2,
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
        {
          match_id: 8676017978,
          start_time: 1700055333,
          duration: 2550,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
      ],
    });

    const actionSpy = vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'ok',
      message: 'Replay download execute action finished.',
      task: {
        task_id: 'task-checked-only',
        match_id: 8674716612,
        status: 'downloading',
      },
    });

    render(<MatchDatabasePage />);

    fireEvent.click(await screen.findByLabelText('选择比赛 8674716612'));
    fireEvent.click(await screen.findByRole('button', { name: '批量下载（勾选项）' }));

    await waitFor(() => {
      expect(actionSpy).toHaveBeenCalledTimes(1);
      expect(actionSpy).toHaveBeenCalledWith(8674716612, 'prepare_and_execute');
    });
  });

  it('auto opens task details from batch result and shows batch-opened hint', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 2,
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
        {
          match_id: 8676017978,
          start_time: 1700055333,
          duration: 2550,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
      ],
    });

    vi.spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockResolvedValueOnce({
        status: 'ok',
        message: 'Replay download prepare action finished.',
        task: {
          task_id: 'task-first',
          match_id: 8674716612,
          status: 'prepared',
        },
      })
      .mockResolvedValueOnce({
        status: 'ok',
        message: 'Replay download prepare action finished.',
        task: {
          task_id: 'task-last',
          match_id: 8676017978,
          status: 'prepared',
        },
      });

    const taskDetailsSpy = vi
      .spyOn(matchDatabaseService, 'getDownloadTaskDetails')
      .mockResolvedValue(createTaskDetails('prepared'));

    render(<MatchDatabasePage />);

    fireEvent.click(await screen.findByLabelText('全选当前页'));
    fireEvent.click(await screen.findByRole('button', { name: '批量下载（勾选项）' }));

    await waitFor(() => {
      expect(taskDetailsSpy).toHaveBeenCalledWith('task-last');
    });

    expect(await screen.findByText('已从批量结果自动打开。')).toBeTruthy();
  });

  it('guards duplicate batch clicks while first batch is still running', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
      ],
    });

    const deferred = createDeferred<{
      status: string;
      message: string;
      task: { task_id: string; match_id: number; status: string };
    }>();

    const actionSpy = vi
      .spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockReturnValue(deferred.promise);

    vi.spyOn(matchDatabaseService, 'getDownloadTaskDetails').mockResolvedValue(createTaskDetails('prepared'));

    render(<MatchDatabasePage />);

    fireEvent.click(await screen.findByLabelText('全选当前页'));
    const batchButton = await screen.findByRole('button', { name: '批量下载（勾选项）' });
    fireEvent.click(batchButton);
    fireEvent.click(batchButton);

    await waitFor(() => {
      expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    deferred.resolve({
      status: 'ok',
      message: 'Replay download prepare action finished.',
      task: {
        task_id: 'task-guarded',
        match_id: 8674716612,
        status: 'prepared',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('勾选批量下载完成。 总数：1，成功：1，失败：0，含任务ID：1。')).toBeTruthy();
    });
  });

  it('copies failed items text to clipboard after batch failures', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 2,
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
        {
          match_id: 8676017978,
          start_time: 1700055333,
          duration: 2550,
          radiant_team_id: 15,
          dire_team_id: 2163,
          leagueid: 15475,
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
      ],
    });

    vi.spyOn(matchDatabaseService, 'triggerDownloadAction')
      .mockResolvedValueOnce({
        status: 'error',
        message: 'Network timeout.',
        task: null,
      })
      .mockResolvedValueOnce({
        status: 'error',
        message: 'URL missing.',
        task: null,
      });

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextSpy },
      configurable: true,
    });

    render(<MatchDatabasePage />);

    fireEvent.click(await screen.findByLabelText('全选当前页'));
    fireEvent.click(await screen.findByRole('button', { name: '批量下载（勾选项）' }));

    await waitFor(() => {
      expect(screen.getByText(/勾选批量下载完成。/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '复制失败项' }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(
        '8674716612\tNetwork timeout.\n8676017978\tURL missing.'
      );
    });
  });

  it('exports failed items as txt download after batch failures', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'none',
          download_attempt_count: 0,
        },
      ],
    });

    vi.spyOn(matchDatabaseService, 'triggerDownloadAction').mockResolvedValue({
      status: 'error',
      message: 'Controlled test failure.',
      task: null,
    });

    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });

    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:match-database-failed-items');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => { });

    render(<MatchDatabasePage />);

    fireEvent.click(await screen.findByLabelText('全选当前页'));
    fireEvent.click(await screen.findByRole('button', { name: '批量下载（勾选项）' }));

    await waitFor(() => {
      expect(screen.getByText(/勾选批量下载完成。/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '导出失败项（.txt）' }));

    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:match-database-failed-items');
    });
  });

  it('saves and applies filter preset, restoring filters and refetching list', async () => {
    const listSpy = vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 0,
      limit: 20,
      offset: 0,
      matches: [],
    });

    render(<MatchDatabasePage />);

    await screen.findByText('未找到记录。');

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('联赛 ID'), { target: { value: '15475' } });
    fireEvent.change(screen.getByLabelText('是否已有下载任务'), { target: { value: 'true' } });
    fireEvent.change(screen.getByLabelText('预设名称'), {
      target: { value: 'core-filters' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存预设' }));

    fireEvent.change(screen.getByLabelText('战队 ID'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('联赛 ID'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('是否已有下载任务'), { target: { value: 'false' } });

    fireEvent.change(screen.getByLabelText('预设'), {
      target: { value: 'core-filters' },
    });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));

    await waitFor(() => {
      expect(listSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          team_id: 15,
          leagueid: 15475,
          has_download: true,
        })
      );
    });
  });

  it('restores persisted filter and offset from view state', async () => {
    const listSpy = vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
      status: 'ok',
      total: 25,
      limit: 20,
      offset: 20,
      matches: [],
    });

    const persistedViewState: MatchDatabaseViewState = {
      filters: {
        teamId: '15',
        leagueId: '',
        startTimeFrom: '',
        startTimeTo: '',
        hasDownload: 'all',
        professionalOnly: true,
      },
      appliedFilters: {
        teamId: '15',
        leagueId: '',
        startTimeFrom: '',
        startTimeTo: '',
        hasDownload: 'all',
        professionalOnly: true,
      },
      offset: 20,
    };

    render(<MatchDatabasePage initialViewState={persistedViewState} />);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 20,
          team_id: 15,
        })
      );
    });

    expect(await screen.findByDisplayValue('15')).toBeTruthy();
    const offsetNode = await screen.findByTestId('pagination-offset');
    expect(offsetNode.textContent).toBe('20');
  });

  it('loads and renders task details fields after opening task panel', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'downloading',
          download_task_id: 'task-8674716612-1',
          download_attempt_count: 1,
        },
      ],
    });

    const detailsSpy = vi
      .spyOn(matchDatabaseService, 'getDownloadTaskDetails')
      .mockResolvedValue(createTaskDetails('downloading'));

    render(<MatchDatabasePage />);

    const taskDetailsButton = await screen.findByRole('button', { name: '任务详情' });
    fireEvent.click(taskDetailsButton);

    await waitFor(() => {
      expect(detailsSpy).toHaveBeenCalledWith('task-8674716612-1');
    });

    expect(await screen.findByText('任务 ID')).toBeTruthy();
    expect(await screen.findByText('任务状态')).toBeTruthy();
    expect((await screen.findAllByText('尝试次数')).length).toBeGreaterThan(0);
    expect(await screen.findByText('错误代码')).toBeTruthy();
    expect(await screen.findByText('错误信息')).toBeTruthy();
    expect(await screen.findByText('下载文件路径')).toBeTruthy();
    expect(await screen.findByText('最近更新时间')).toBeTruthy();
    expect((await screen.findAllByText('task-8674716612-1')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('下载中')).length).toBeGreaterThan(0);
  });

  it.each(['completed', 'failed'])(
    'polls while downloading then stops at %s',
    async (terminalStatus) => {
      vi.useFakeTimers();

      vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
            radiant_team_name: 'Team Liquid',
            dire_team_name: 'Team Falcons',
            league_name: 'DreamLeague',
            download_status: 'downloading',
            download_task_id: 'task-8674716612-1',
            download_attempt_count: 1,
          },
        ],
      });

      const detailsSpy = vi
        .spyOn(matchDatabaseService, 'getDownloadTaskDetails')
        .mockResolvedValueOnce(createTaskDetails('downloading'))
        .mockResolvedValueOnce(createTaskDetails('downloading'))
        .mockResolvedValueOnce(createTaskDetails(terminalStatus));

      render(<MatchDatabasePage />);
      await vi.advanceTimersByTimeAsync(0);

      const taskDetailsButton = screen.getByRole('button', { name: '任务详情' });
      fireEvent.click(taskDetailsButton);

      await vi.advanceTimersByTimeAsync(0);
      expect(detailsSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(4000);
      expect(detailsSpy).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(4000);
      expect(detailsSpy).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(12000);
      expect(detailsSpy).toHaveBeenCalledTimes(3);
    }
  );

  it('shows final-state hint when task details are terminal', async () => {
    vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'completed',
          download_task_id: 'task-8674716612-1',
          download_attempt_count: 1,
        },
      ],
    });

    vi.spyOn(matchDatabaseService, 'getDownloadTaskDetails').mockResolvedValue(createTaskDetails('completed'));

    render(<MatchDatabasePage />);

    fireEvent.click(await screen.findByRole('button', { name: '任务详情' }));

    expect(await screen.findByText('终态：自动刷新已停止。')).toBeTruthy();
  });

  it('refreshes current page on button click', async () => {
    const listSpy = vi.spyOn(matchDatabaseService, 'getMatchDatabase').mockResolvedValue({
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
          radiant_team_name: 'Team Liquid',
          dire_team_name: 'Team Falcons',
          league_name: 'DreamLeague',
          download_status: 'prepared',
          download_attempt_count: 1,
        },
      ],
    });

    render(<MatchDatabasePage />);
    await screen.findByText('8123456789');

    const refreshButton = screen.getByRole('button', { name: '刷新当前页' });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });
});
