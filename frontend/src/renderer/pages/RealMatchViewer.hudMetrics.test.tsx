// @vitest-environment jsdom


import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RealMatchViewer from './RealMatchViewer';
import backendAPI from '../api/backend';
import { replayService } from '../api/replayService';

vi.mock('../components/map/MapViewer', () => ({
  __esModule: true,
  default: ({
    heroPositions = [],
    wards = [],
    killMarkers = [],
  }: {
    heroPositions?: Array<{ hero_name: string }>;
    wards?: unknown[];
    killMarkers?: unknown[];
  }) => (
    <div
      data-testid="map-viewer"
      data-heroes={heroPositions.map((hero) => hero.hero_name).join(',')}
      data-hero-count={heroPositions.length}
      data-ward-count={wards.length}
      data-kill-count={killMarkers.length}
    >
      Mock Map
    </div>
  ),
}));

vi.mock('../components/timeline', () => ({
  Timeline: () => <div data-testid="timeline">Mock Timeline</div>,
}));

vi.mock('../components/charts/AdvantageChart', () => ({
  __esModule: true,
  default: () => <div data-testid="advantage-chart">Mock Advantage</div>,
}));

vi.mock('../api/replayService', () => ({
  replayService: {
    createParseTask: vi.fn(),
    getParseTask: vi.fn(),
  },
}));

const BASE_TICKS_RESPONSE = {
  match_id: 8674716612,
  start_time: -90,
  end_time: 120,
  interval: 1,
  ticks: [
    {
      tick: 100,
      time: 3.33,
      game_time: -90,
      heroes: [
        {
          hero: 'npc_dota_hero_axe',
          handle: 1,
          team: 2,
          team_name: 'radiant',
          x: 10000,
          y: 12000,
          hp: 700,
          max_hp: 700,
          mana: 300,
          max_mana: 300,
          level: 1,
        },
        {
          hero: 'npc_dota_hero_lina',
          handle: 6,
          team: 3,
          team_name: 'dire',
          x: 21000,
          y: 20500,
          hp: 680,
          max_hp: 680,
          mana: 400,
          max_mana: 400,
          level: 1,
        },
      ],
    },
  ],
  total_samples: 1,
};

describe('RealMatchViewer HUD metrics panel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();

    vi.spyOn(backendAPI, 'getMatchList').mockResolvedValue([
      {
        match_id: 8674716612,
        duration: 2400,
      },
    ]);
    vi.spyOn(backendAPI, 'getMatchDetail').mockResolvedValue({
      match_id: 8674716612,
      radiant_team: 'Radiant',
      dire_team: 'Dire',
      radiant_win: true,
      duration: 2400,
      game_mode: 'captains_mode',
      parsed_at: '2026-02-18T00:00:00Z',
      replay_path: 'backend/data/replays/8674716612.dem',
      parse_status: 'completed',
    });
    vi.spyOn(backendAPI, 'getHeroPositions').mockResolvedValue(BASE_TICKS_RESPONSE);
    vi.spyOn(backendAPI, 'getWards').mockResolvedValue({
      match_id: 8674716612,
      wards: [
        {
          type: 'placed',
          ward_type: 'observer',
          tick: 100,
          time: -80,
          game_time: -80,
          handle: 99,
          x: 12000,
          y: 13500,
          team: 2,
        },
      ],
      summary: {
        total: 1,
        placed: 1,
        destroyed: 0,
        observers_placed: 1,
        sentries_placed: 0,
      },
    });
    vi.spyOn(backendAPI, 'getAdvantage').mockResolvedValue({
      match_id: 8674716612,
      data: [
        {
          tick: 100,
          game_time: -90,
          radiant_gold: 0,
          dire_gold: 0,
          radiant_xp: 0,
          dire_xp: 0,
          gold_advantage: 0,
          xp_advantage: 0,
        },
      ],
      time_basis: {
        source: 'game_time',
      },
      summary: {
        total_samples: 1,
        max_gold_advantage: 0,
        min_gold_advantage: 0,
        max_xp_advantage: 0,
        min_xp_advantage: 0,
      },
    });
  });

  it('renders integrated HUD lanes around the main map when API succeeds', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue({
      status: 'ok',
      match_id: 8674716612,
      game_time: -90,
      tick: 100,
      heroes: [
        {
          hero: 'npc_dota_hero_axe',
          team: 'radiant',
          level: 8,
          kills: 2,
          deaths: 1,
          assists: 3,
          net_worth: 5420,
          gpm: 420,
          xpm: 510,
          items: [
            'blink',
            'phase_boots',
            'magic_wand',
            null,
            null,
            'black_king_bar',
            'dust',
            'smoke_of_deceit',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            'titan_sliver',
          ],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect(await screen.findByText('录像主工作区')).toBeTruthy();
    expect(await screen.findByText('地图与 HUD 一体化分析')).toBeTruthy();
    expect(await screen.findByText('现在看到什么')).toBeTruthy();
    expect(await screen.findByText('蓝色稀疏')).toBeTruthy();
    expect(screen.queryByText('热力图层')).toBeNull();
    expect(await screen.findByTestId('toggle-map-overlay-insight')).toBeTruthy();
    expect(await screen.findByTestId('toggle-map-overlay-legend')).toBeTruthy();
    expect(await screen.findByTestId('hud-metrics-panel')).toBeTruthy();
    expect(await screen.findByTestId('hud-radiant')).toBeTruthy();
    expect(await screen.findByTestId('hud-dire')).toBeTruthy();
    expect(await screen.findByText('天辉 HUD')).toBeTruthy();
    expect(await screen.findByText('夜魇 HUD')).toBeTruthy();
    expect(await screen.findByText('斧王')).toBeTruthy();
    expect(await screen.findByText('2/1/3')).toBeTruthy();
    fireEvent.click(await screen.findByTestId('toggle-map-workbench'));
    expect(await screen.findByText('热力图层')).toBeTruthy();
    const axeToggle = await screen.findByTestId('toggle-hud-hero-radiant-1');
    expect(axeToggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByAltText('Blink 图标')).toBeNull();

    fireEvent.click(axeToggle);

    expect(axeToggle.getAttribute('aria-expanded')).toBe('true');
    expect((await screen.findAllByText('NW')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('GPM')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('XPM')).length).toBeGreaterThan(0);
    expect(await screen.findByText('5,420')).toBeTruthy();
    expect(await screen.findByAltText('Blink Dagger 图标')).toBeTruthy();
    expect(await screen.findByAltText('Phase Boots 图标')).toBeTruthy();
    const neutralItem = await screen.findByAltText('Titan Sliver 图标');
    expect(neutralItem).toBeTruthy();
    const neutralSlot = neutralItem.closest('[title="Titan Sliver"]') as HTMLElement | null;
    expect(neutralSlot).toBeTruthy();

    fireEvent.mouseOver(neutralSlot!);

    await waitFor(() => {
      expect(document.querySelector('[data-testid^="item-tooltip-"]')).toBeTruthy();
    });
    expect(await screen.findByText('泰坦碎片')).toBeTruthy();
    expect(await screen.findByText('第 3 级中立物品')).toBeTruthy();
    expect(document.querySelector('[data-testid^="item-tooltip-"]')?.parentElement).toBe(document.body);

    fireEvent.mouseOut(neutralSlot!);
    await waitFor(() => {
      expect(document.querySelector('[data-testid^="item-tooltip-"]')).toBeNull();
    });

    await waitFor(() => {
      expect(backendAPI.getHudMetrics).toHaveBeenCalledTimes(1);
    });
  });

  it('lets users close, reopen, and drag map overlay panels', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue({
      status: 'ok',
      match_id: 8674716612,
      game_time: -90,
      tick: 100,
      heroes: [
        {
          hero: 'npc_dota_hero_axe',
          team: 'radiant',
          level: 8,
          kills: 2,
          deaths: 1,
          assists: 3,
          net_worth: 5420,
          gpm: 420,
          xpm: 510,
          items: ['blink'],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    const container = await screen.findByTestId('map-overlay-container');
    const insightPanel = await screen.findByTestId('map-overlay-panel-insight');
    const insightDragHandle = await screen.findByTestId('map-overlay-drag-handle-insight');
    const toggleLegend = await screen.findByTestId('toggle-map-overlay-legend');

    Object.defineProperty(container, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 620,
        bottom: 620,
        width: 620,
        height: 620,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    Object.defineProperty(insightPanel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 12,
        top: 12,
        right: 292,
        bottom: 252,
        width: 280,
        height: 240,
        x: 12,
        y: 12,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(insightDragHandle, {
      button: 0,
      clientX: 40,
      clientY: 40,
    });
    fireEvent.pointerMove(window, {
      clientX: 210,
      clientY: 200,
    });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(insightPanel.style.left).toBe('182px');
      expect(insightPanel.style.top).toBe('172px');
    });

    fireEvent.click(screen.getByRole('button', { name: '隐藏现在看到什么' }));
    await waitFor(() => {
      expect(screen.queryByTestId('map-overlay-panel-insight')).toBeNull();
    });
    expect(screen.getByTestId('toggle-map-overlay-insight').textContent).toContain('显示说明');

    expect(screen.queryByTestId('map-overlay-panel-legend')).toBeNull();
    fireEvent.click(toggleLegend);
    expect(await screen.findByTestId('map-overlay-panel-legend')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '隐藏地图图例' }));
    await waitFor(() => {
      expect(screen.queryByTestId('map-overlay-panel-legend')).toBeNull();
    });

    fireEvent.click(toggleLegend);
    expect(await screen.findByTestId('map-overlay-panel-legend')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('map-overlay-panel-insight')).toBeNull();
      expect(screen.queryByTestId('map-overlay-panel-legend')).toBeNull();
    });
    expect(screen.getByTestId('focus-map-overlays').textContent).toContain('恢复默认浮窗');

    fireEvent.click(screen.getByTestId('focus-map-overlays'));
    expect(await screen.findByTestId('map-overlay-panel-insight')).toBeTruthy();
    expect(screen.queryByTestId('map-overlay-panel-legend')).toBeNull();
  });

  it('maps guardian_shell to the released neutral item presentation', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue({
      status: 'ok',
      match_id: 8674716612,
      game_time: 1440,
      tick: 62790,
      heroes: [
        {
          hero: 'npc_dota_hero_axe',
          team: 'radiant',
          level: 14,
          kills: 6,
          deaths: 7,
          assists: 11,
          net_worth: 9578,
          gpm: 421,
          xpm: 486,
          items: [
            'phase_boots',
            'armlet',
            'blink_dagger',
            'point_booster',
            'bracer',
            'bracer',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            'teleport_scroll',
            'guardian_shell',
            'enhancement_quickened',
          ],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    fireEvent.click(await screen.findByTestId('toggle-hud-hero-radiant-1'));
    expect(await screen.findByAltText('Defiant Shell 图标')).toBeTruthy();
    expect(screen.queryByText('隐藏物品 ID')).toBeNull();
  });

  it('does not infer town portal scroll as a neutral item when no neutral slot exists', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue({
      status: 'ok',
      match_id: 8674716612,
      game_time: 1440,
      tick: 62790,
      heroes: [
        {
          hero: 'npc_dota_hero_axe',
          team: 'radiant',
          level: 14,
          kills: 6,
          deaths: 7,
          assists: 11,
          net_worth: 9578,
          gpm: 421,
          xpm: 486,
          items: [
            'phase_boots',
            'armlet',
            'blink_dagger',
            'point_booster',
            'bracer',
            'bracer',
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            'teleport_scroll',
          ],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    fireEvent.click(await screen.findByTestId('toggle-hud-hero-radiant-1'));
    expect(screen.queryByAltText('Town Portal Scroll 图标')).toBeNull();
    expect(screen.queryByText('隐藏物品 ID')).toBeNull();
  });

  it('shows HUD error state while keeping main viewer content rendered', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue(null);

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect(await screen.findByText('地图视图')).toBeTruthy();
    expect(await screen.findByTestId('map-viewer')).toBeTruthy();
    expect(await screen.findByTestId('timeline')).toBeTruthy();
    expect(await screen.findByText('HUD 指标请求失败，不影响主回放。')).toBeTruthy();
  });

  it('declutters the map when a single-hero heatmap is selected', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue({
      status: 'ok',
      match_id: 8674716612,
      game_time: -90,
      tick: 100,
      heroes: [],
    });
    vi.spyOn(backendAPI, 'getMatchHeatmap').mockResolvedValue({
      data: {
        match_id: 8674716612,
        heatmap_type: 'movement',
        hero: 'npc_dota_hero_axe',
        team: 2,
        time_range: {
          start: -90,
          end: 120,
        },
        grid_size: 64,
        map_bounds: {
          min_x: 7500,
          max_x: 25500,
          min_y: 7500,
          max_y: 25500,
        },
        grid_data: [
          { grid_x: 12, grid_y: 18, x: 11000, y: 13000, density: 10 },
        ],
        max_density: 10,
        total_samples: 18,
      },
      meta: {
        generation_time_ms: 12,
      },
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    const mapViewer = await screen.findByTestId('map-viewer');
    expect(mapViewer.getAttribute('data-hero-count')).toBe('2');
    expect(mapViewer.getAttribute('data-ward-count')).toBe('1');

    fireEvent.click(await screen.findByTestId('toggle-map-workbench'));
    fireEvent.change(await screen.findByTestId('heatmap-range-select'), {
      target: { value: 'custom' },
    });
    expect(await screen.findByTestId('heatmap-range-start')).toBeTruthy();
    expect(await screen.findByTestId('heatmap-range-end')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '移动' }));
    fireEvent.change(await screen.findByTestId('heatmap-hero-select'), {
      target: { value: 'npc_dota_hero_axe' },
    });

    expect(await screen.findByText('分析视图净化')).toBeTruthy();
    await waitFor(() => {
      expect(mapViewer.getAttribute('data-hero-count')).toBe('0');
      expect(mapViewer.getAttribute('data-ward-count')).toBe('0');
      expect(mapViewer.getAttribute('data-kill-count')).toBe('0');
    });

    fireEvent.click(screen.getByRole('button', { name: '恢复全部图层' }));
    await waitFor(() => {
      expect(mapViewer.getAttribute('data-hero-count')).toBe('2');
      expect(mapViewer.getAttribute('data-ward-count')).toBe('1');
    });
  });

  it('surfaces legacy item-slot warning and auto-refreshes after reparse completes', async () => {
    try {
      vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue({
        status: 'ok',
        match_id: 8674716612,
        game_time: -90,
        tick: 100,
        heroes: [
          {
            hero: 'npc_dota_hero_axe',
            team: 'radiant',
            level: 8,
            kills: 2,
            deaths: 1,
            assists: 3,
            net_worth: 5420,
            gpm: 420,
            xpm: 510,
            items: ['blink'],
          },
        ],
        warnings: [
          '当前录像仍在使用旧版物品槽契约，背包和中立物品槽位可能不准确，请重新解析该 replay。',
        ],
      });
      vi.mocked(replayService.createParseTask).mockResolvedValue({
        task_id: 'task-legacy-1',
        status: 'pending',
        replay_path: 'backend/data/replays/8674716612.dem',
        progress: 0,
        created_at: 1,
      });
      vi.mocked(replayService.getParseTask).mockResolvedValue({
        task_id: 'task-legacy-1',
        status: 'completed',
        replay_path: 'backend/data/replays/8674716612.dem',
        progress: 100,
        created_at: 1,
        completed_at: 2,
      });

      render(<RealMatchViewer initialMatchId={8674716612} />);

      expect(await screen.findByText('旧版物品槽解析')).toBeTruthy();
      vi.useFakeTimers();
      fireEvent.click(screen.getAllByRole('button', { name: '重新解析当前录像' })[0]);

      await Promise.resolve();
      await Promise.resolve();
      expect(replayService.createParseTask).toHaveBeenCalledWith('backend/data/replays/8674716612.dem');

      await vi.advanceTimersByTimeAsync(2100);
      await Promise.resolve();
      await Promise.resolve();

      expect(replayService.getParseTask).toHaveBeenCalledWith('task-legacy-1');
      expect(backendAPI.getMatchDetail).toHaveBeenCalledTimes(2);
      expect(screen.getByText('重新解析已完成，当前比赛数据已自动刷新。')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
