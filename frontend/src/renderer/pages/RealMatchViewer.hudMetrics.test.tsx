// @vitest-environment jsdom


import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RealMatchViewer from './RealMatchViewer';
import backendAPI from '../api/backend';
import { replayService } from '../api/replayService';

vi.mock('../components/map/MapViewer', () => ({
  __esModule: true,
  default: ({
    heroPositions = [],
    wards = [],
    killMarkers = [],
    selectedWardKeys = [],
    onWardSelectionChange,
    onWardHoverChange,
    onWardClick,
  }: {
    heroPositions?: Array<{ hero_name: string }>;
    wards?: Array<{ instanceKey?: string }>;
    killMarkers?: unknown[];
    selectedWardKeys?: string[];
    onWardSelectionChange?: (wards: Array<{ instanceKey?: string }>) => void;
    onWardHoverChange?: (payload: { wards: Array<{ instanceKey?: string }>; localX: number; localY: number } | null) => void;
    onWardClick?: (payload: { wards: Array<{ instanceKey?: string }>; localX: number; localY: number } | null) => void;
  }) => (
    <div
      data-testid="map-viewer"
      data-heroes={heroPositions.map((hero) => hero.hero_name).join(',')}
      data-hero-count={heroPositions.length}
      data-ward-count={wards.length}
      data-kill-count={killMarkers.length}
      data-selected-ward-count={selectedWardKeys.length}
    >
      Mock Map
      <button
        type="button"
        data-testid="map-viewer-select-first-two"
        onClick={() => onWardSelectionChange?.(wards.slice(0, 2))}
      >
        Select First Two
      </button>
      <button
        type="button"
        data-testid="map-viewer-clear-selection"
        onClick={() => onWardSelectionChange?.([])}
      >
        Clear Selection
      </button>
      <button
        type="button"
        data-testid="map-viewer-hover-first-two"
        onClick={() => onWardHoverChange?.({ wards: wards.slice(0, 2), localX: 220, localY: 180 })}
      >
        Hover First Two
      </button>
      <button
        type="button"
        data-testid="map-viewer-click-first-two"
        onClick={() => onWardClick?.({ wards: wards.slice(0, 2), localX: 220, localY: 180 })}
      >
        Click First Two
      </button>
      <button
        type="button"
        data-testid="map-viewer-clear-hover"
        onClick={() => onWardHoverChange?.(null)}
      >
        Clear Hover
      </button>
      <button
        type="button"
        data-testid="map-viewer-click-empty"
        onClick={() => onWardClick?.({ wards: [], localX: 40, localY: 40 })}
      >
        Click Empty
      </button>
    </div>
  ),
}));

vi.mock('../components/timeline', () => ({
  Timeline: ({
    onTimeChange,
  }: {
    onTimeChange: (time: number) => void;
  }) => (
    <div data-testid="timeline">
      Mock Timeline
      <button type="button" data-testid="timeline-scrub" onClick={() => onTimeChange(60)}>
        Scrub
      </button>
    </div>
  ),
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('RealMatchViewer HUD metrics panel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();

    vi.spyOn(backendAPI, 'getMatchList').mockResolvedValue([
      {
        match_id: 8674716612,
        radiant_team: 'Radiant',
        dire_team: 'Dire',
        radiant_team_name: 'Team Liquid',
        dire_team_name: 'Team Spirit',
        duration: 2400,
        winner_team: 'radiant',
        radiant_win: true,
        source: 'pro',
        is_professional: true,
      },
    ]);
    vi.spyOn(backendAPI, 'getMatchDetail').mockResolvedValue({
      match_id: 8674716612,
      radiant_team: 'Radiant',
      dire_team: 'Dire',
      radiant_team_name: 'Team Liquid',
      dire_team_name: 'Team Spirit',
      radiant_win: true,
      winner_team: 'radiant',
      duration: 2400,
      game_mode: 'captains_mode',
      source: 'pro',
      is_professional: true,
      parsed_at: '2026-02-18T00:00:00Z',
      replay_path: 'backend/data/replays/8674716612.dem',
      parse_status: 'completed',
    });
    vi.spyOn(backendAPI, 'getMatchPlayers').mockResolvedValue([
      {
        hero_id: 2,
        hero_name: 'npc_dota_hero_axe',
        team: 'radiant',
        display_name: 'Ame',
        display_type: 'pro_name',
        pro_name: 'Ame',
        account_id: 111,
        player_name: 'Ame',
      },
      {
        hero_id: 25,
        hero_name: 'npc_dota_hero_lina',
        team: 'dire',
        display_name: 'Somnus',
        display_type: 'pro_name',
        pro_name: 'Somnus',
        account_id: 222,
        player_name: 'Somnus',
      },
    ]);
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
    vi.spyOn(backendAPI, 'getObjectives').mockResolvedValue({
      match_id: 8674716612,
      objectives: [],
      summary: {
        total: 0,
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
    expect(await screen.findByText('地图主工作台')).toBeTruthy();
    expect(screen.queryByText('地图与 HUD 一体化分析')).toBeNull();
    expect(screen.queryByText('现在看到什么')).toBeNull();
    expect(screen.queryByText('热力 关闭')).toBeNull();
    expect(screen.queryByText('蓝色稀疏')).toBeNull();
    expect(screen.queryByText('热力图层')).toBeNull();
    expect(await screen.findByTestId('toggle-map-overlay-insight')).toBeTruthy();
    expect(await screen.findByTestId('toggle-map-overlay-legend')).toBeTruthy();
    expect(await screen.findByTestId('hud-metrics-panel')).toBeTruthy();
    expect(await screen.findByTestId('hud-radiant')).toBeTruthy();
    expect(await screen.findByTestId('hud-dire')).toBeTruthy();
    expect(await screen.findByText('天辉')).toBeTruthy();
    expect(await screen.findByText('夜魇')).toBeTruthy();
    expect((await screen.findByTestId('match-radiant-name')).textContent).toBe('Team Liquid');
    expect((await screen.findByTestId('match-dire-name')).textContent).toBe('Team Spirit');
    expect((await screen.findByTestId('match-winner-badge')).textContent).toContain('胜者 Team Liquid');
    expect(await screen.findByTestId('map-status-strip')).toBeTruthy();
    expect(await screen.findByTestId('map-view-strip')).toBeTruthy();
    expect(await screen.findByTestId('map-analysis-strip')).toBeTruthy();
    const timeline = await screen.findByTestId('timeline');
    expect(timeline.closest('.replay-timeline-shell-dock')).toBeTruthy();
    expect(timeline.closest('[data-testid="map-overlay-container"]')).toBeNull();
    expect(await screen.findByText('斧王')).toBeTruthy();
    expect((await screen.findByTestId('hud-player-display-radiant-1')).textContent).toContain('Ame');
    expect((await screen.findByTestId('hud-player-display-radiant-1')).className).toContain('font-semibold');
    expect((await screen.findByTestId('hud-player-display-radiant-1')).className).toContain('text-amber-200');
    expect((await screen.findByTestId('hud-player-display-dire-6')).textContent).toContain('Somnus');
    expect(await screen.findByText('2/1/3')).toBeTruthy();
    fireEvent.click(await screen.findByTestId('toggle-map-workbench'));
    expect(await screen.findByText('热力图层')).toBeTruthy();
    const workbench = await screen.findByRole('dialog', { name: '地图图层工作台' });
    expect(workbench).toBeTruthy();
    expect(workbench.className).toContain('replay-workbench-float-open');
    expect(screen.queryByText(/路径对象/)).toBeNull();
    expect(screen.queryByText(/压缩率/)).toBeNull();
    expect(screen.queryByText('调试校准')).toBeNull();
  });

  it('keeps the replay viewer header stacked until 2xl so 14-inch widths do not squeeze the selection panel', async () => {
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
          items: [],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect(await screen.findByTestId('replay-viewer-header')).toBeTruthy();
    expect(screen.getByTestId('replay-viewer-header').className).toContain('replay-command-compact');
    expect(screen.getByTestId('replay-viewer-header-selection').className).toContain('replay-command-select');
    const matchPickerTrigger = await screen.findByTestId('match-picker-trigger');
    expect(matchPickerTrigger.className).toContain('replay-match-picker-trigger');
    fireEvent.click(matchPickerTrigger);
    expect(await screen.findByRole('dialog', { name: '选择比赛录像' })).toBeTruthy();
    expect(screen.getByLabelText('搜索比赛录像')).toBeTruthy();
  });

  it('splits realtime ward status from the detailed vision workbench and no longer requires scrubbing to the end', async () => {
    vi.spyOn(backendAPI, 'getHeroPositions').mockResolvedValue({
      ...BASE_TICKS_RESPONSE,
      ticks: BASE_TICKS_RESPONSE.ticks.map((tick) => ({
        ...tick,
        time: tick.game_time,
      })),
    });
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
          items: [],
        },
      ],
    });
    vi.spyOn(backendAPI, 'getWards').mockResolvedValue({
      match_id: 8674716612,
      wards: [
        {
          type: 'placed',
          ward_type: 'observer',
          tick: 100,
          time: -80,
          game_time: -80,
          handle: 91,
          x: 12000,
          y: 13500,
          team: 2,
        },
        {
          type: 'placed',
          ward_type: 'sentry',
          tick: 200,
          time: -20,
          game_time: -20,
          handle: 92,
          x: 18000,
          y: 17500,
          team: 3,
        },
        {
          type: 'placed',
          ward_type: 'observer',
          tick: 150,
          time: -40,
          game_time: -40,
          handle: 93,
          x: 14000,
          y: 15000,
          team: 2,
        },
        {
          type: 'destroyed',
          ward_type: 'observer',
          tick: 300,
          time: 30,
          game_time: 30,
          handle: 93,
          team: 3,
          destroyer_name: 'npc_dota_hero_beastmaster',
          destroyer_kind: 'hero_summon',
          destroyer_is_hero: true,
        },
      ],
      summary: {
        total: 4,
        placed: 3,
        destroyed: 1,
        observers_placed: 2,
        sentries_placed: 1,
      },
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    fireEvent.click(await screen.findByTestId('timeline-scrub'));

    await waitFor(() => {
      expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('2');
    });

    fireEvent.click(screen.getByTestId('toggle-map-workbench'));

    expect(await screen.findByTestId('ward-analysis-panel')).toBeTruthy();
    expect(screen.getByTestId('ward-analysis-total').textContent).toBe('3');
    expect(screen.getByTestId('ward-analysis-active').textContent).toBe('0');
    expect(screen.getByTestId('ward-realtime-active').textContent).toBe('2');
    expect(screen.getByTestId('ward-analysis-dewarded').textContent).toBe('1');
    expect(screen.getByTestId('ward-analysis-expired').textContent).toBe('2');
    expect(screen.getByTestId('ward-analysis-average-lifetime').textContent).toBe('4:43');
    expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('2');
    expect(screen.getByTestId('map-viewer').getAttribute('data-hero-count')).toBe('2');
    expect(screen.getByText('整场全部眼位')).toBeTruthy();
    expect(screen.getByText('整场排眼记录')).toBeTruthy();
    expect(screen.getByText('召唤物 1')).toBeTruthy();
    expect(screen.getByText((content) => (
      content.includes('插于 -0:40') && content.includes('被 兽王 的召唤物排掉')
    ))).toBeTruthy();
    expect(screen.getAllByText(/疑似插眼英雄：Ame/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/疑似插眼英雄：Somnus/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByTestId('vision-range-select'), {
      target: { value: 'custom' },
    });
    fireEvent.change(screen.getByTestId('vision-range-start'), {
      target: { value: '-0:50' },
    });
    fireEvent.change(screen.getByTestId('vision-range-end'), {
      target: { value: '-0:10' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('ward-analysis-total').textContent).toBe('2');
    });
    expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('2');
    expect(screen.getByTestId('ward-analysis-active').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('vision-map-mode-full'));

    await waitFor(() => {
      expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('3');
      expect(screen.getByTestId('map-viewer').getAttribute('data-hero-count')).toBe('0');
    });

    fireEvent.click(screen.getByTestId('vision-map-mode-current'));

    await waitFor(() => {
      expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('2');
      expect(screen.getByTestId('map-viewer').getAttribute('data-hero-count')).toBe('2');
    });

    fireEvent.change(screen.getByTestId('vision-team-select'), {
      target: { value: 'dire' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('ward-analysis-total').textContent).toBe('1');
    });
    expect(screen.getByTestId('ward-analysis-active').textContent).toBe('1');
    expect(screen.getByTestId('ward-analysis-dewarded').textContent).toBe('0');
    expect(screen.getByTestId('ward-analysis-expired').textContent).toBe('0');
    expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('1');

    fireEvent.change(screen.getByTestId('vision-type-select'), {
      target: { value: 'observer' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('ward-analysis-total').textContent).toBe('0');
    });
    expect(screen.getByTestId('ward-analysis-active').textContent).toBe('0');
    expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('0');
  });

  it('lets users inspect multiple hovered wards from the map when vision focus is active', async () => {
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
          items: [],
        },
      ],
    });
    vi.spyOn(backendAPI, 'getWards').mockResolvedValue({
      match_id: 8674716612,
      wards: [
        {
          type: 'placed',
          ward_type: 'observer',
          tick: 100,
          time: -80,
          game_time: -80,
          handle: 91,
          x: 12000,
          y: 13500,
          team: 2,
        },
        {
          type: 'placed',
          ward_type: 'sentry',
          tick: 200,
          time: -20,
          game_time: -20,
          handle: 92,
          x: 18000,
          y: 17500,
          team: 3,
        },
        {
          type: 'placed',
          ward_type: 'observer',
          tick: 150,
          time: -40,
          game_time: -40,
          handle: 93,
          x: 14000,
          y: 15000,
          team: 2,
        },
        {
          type: 'destroyed',
          ward_type: 'observer',
          tick: 300,
          time: 30,
          game_time: 30,
          handle: 93,
          team: 3,
          destroyer_name: 'npc_dota_hero_beastmaster',
          destroyer_kind: 'hero_summon',
          destroyer_is_hero: true,
        },
      ],
      summary: {
        total: 4,
        placed: 3,
        destroyed: 1,
        observers_placed: 2,
        sentries_placed: 1,
      },
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    fireEvent.click(await screen.findByTestId('timeline-scrub'));
    fireEvent.click(screen.getByTestId('toggle-map-workbench'));

    expect(await screen.findByTestId('ward-analysis-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('vision-map-mode-full'));

    await waitFor(() => {
      expect(screen.getByTestId('map-viewer').getAttribute('data-ward-count')).toBe('3');
    });

    fireEvent.click(screen.getByTestId('map-viewer-hover-first-two'));

    await waitFor(() => {
      expect(screen.getByTestId('map-viewer').getAttribute('data-selected-ward-count')).toBe('2');
    });
    expect(document.querySelectorAll('[data-testid^="selected-ward-card-"]')).toHaveLength(2);
    expect(screen.getByTestId('ward-detail-popover').querySelector('.ward-popover-list')).toBeTruthy();
    const wardDetailCards = Array.from(document.querySelectorAll('[data-testid^="selected-ward-card-"]'));
    expect(wardDetailCards.some((card) => card.textContent?.includes('0:30'))).toBe(true);
    expect(wardDetailCards.some((card) => card.textContent?.includes('被 兽王 的召唤物排掉'))).toBe(true);
    expect(wardDetailCards.some((card) => card.textContent?.includes('疑似插眼英雄'))).toBe(true);
    expect(wardDetailCards.some((card) => card.textContent?.includes('Ame'))).toBe(true);

    fireEvent.click(screen.getByTestId('map-viewer-click-first-two'));

    await waitFor(() => {
      expect(screen.getByText('已固定眼位详情')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('map-viewer-click-empty'));

    await waitFor(() => {
      expect(screen.getByTestId('map-viewer').getAttribute('data-selected-ward-count')).toBe('0');
    });
  });

  it('renders HUD heroes expanded by default with horizontal details', async () => {
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
          items: [],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    const heroCard = await screen.findByTestId('hud-hero-card-radiant-1');
    const healthBar = await screen.findByTestId('hud-hero-health-radiant-1');
    expect(heroCard.className).toContain('replay-hud-hero-row');
    expect(heroCard.className).toContain('border-cyan-500/45');
    expect(heroCard.className).toContain('bg-slate-950/96');
    expect(heroCard.getAttribute('aria-expanded')).toBe('true');
    expect(heroCard.contains(healthBar)).toBe(true);
    expect(heroCard.textContent).toContain('NW');
    expect(heroCard.querySelector('.replay-hud-row-details')).toBeTruthy();
    expect(heroCard.querySelector('.replay-hud-row-items')).toBeTruthy();
  });

  it('keeps the HUD lane header compact and keeps player meta readable', async () => {
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
          items: [],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect(screen.queryByText('先看英雄名、玩家和 KDA，悬停看提示，点击卡片展开细节。')).toBeNull();
    expect(screen.queryByText('天辉 HUD')).toBeNull();
    expect(screen.queryByText('夜魇 HUD')).toBeNull();
    expect(screen.queryByTestId('toggle-hud-lane-radiant')).toBeNull();
    expect(screen.queryByTestId('toggle-hud-lane-dire')).toBeNull();
    expect((await screen.findByTestId('hud-player-meta-radiant-1')).textContent).toBe('职业名 · 玩家 ID 111');
    expect(screen.getByTestId('hud-hero-card-radiant-1').getAttribute('aria-expanded')).toBe('true');

    const playerDisplay = await screen.findByTestId('hud-player-display-radiant-1');
    expect(playerDisplay.className).toContain('text-[11px]');
    expect(playerDisplay.className).toContain('font-semibold');
    expect(playerDisplay.className).toContain('text-amber-200');
  });

  it('uses account ID wording when persona or pro display names are numeric IDs', async () => {
    vi.spyOn(backendAPI, 'getMatchPlayers').mockResolvedValue([
      {
        hero_id: 2,
        hero_name: 'npc_dota_hero_axe',
        team: 'radiant',
        display_name: '123456',
        display_type: 'pro_name',
        pro_name: null,
        persona_name: null,
        account_id: 123456,
        player_name: null,
      },
      {
        hero_id: 25,
        hero_name: 'npc_dota_hero_lina',
        team: 'dire',
        display_name: '654321',
        display_type: 'persona_name',
        pro_name: null,
        persona_name: null,
        account_id: 654321,
        player_name: null,
      },
    ]);

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
          items: [],
        },
        {
          hero: 'npc_dota_hero_lina',
          team: 'dire',
          level: 8,
          kills: 1,
          deaths: 2,
          assists: 4,
          net_worth: 5300,
          gpm: 410,
          xpm: 500,
          items: [],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect((await screen.findByTestId('hud-player-meta-radiant-1')).textContent).toBe('玩家 ID 123456');
    expect((await screen.findByTestId('hud-player-meta-dire-6')).textContent).toBe('玩家 ID 654321');
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
    fireEvent.click(await screen.findByTestId('toggle-map-overlay-insight'));
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

    fireEvent.click(await screen.findByTestId('hud-hero-card-radiant-1'));
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

    fireEvent.click(await screen.findByTestId('hud-hero-card-radiant-1'));
    expect(screen.queryByAltText('Town Portal Scroll 图标')).toBeNull();
    expect(screen.queryByText('隐藏物品 ID')).toBeNull();
  });

  it('shows HUD error state while keeping main viewer content rendered', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue(null);

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect(await screen.findByText('地图主工作台')).toBeTruthy();
    expect(await screen.findByTestId('map-viewer')).toBeTruthy();
    expect(await screen.findByTestId('timeline')).toBeTruthy();
    expect(await screen.findByText('HUD 指标请求失败，不影响主回放。')).toBeTruthy();
  });

  it('keeps HUD refreshes quiet after the first load so the workbench does not keep jumping', async () => {
    try {
      let now = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      const firstHudRequest = createDeferred<{
        status: string;
        match_id: number;
        game_time: number;
        tick: number;
        heroes: Array<{
          hero: string;
          team: string;
          level: number;
          kills: number;
          deaths: number;
          assists: number;
          net_worth: number;
          gpm: number;
          xpm: number;
          items: Array<string | null>;
        }>;
      }>();
      const secondHudRequest = createDeferred<{
        status: string;
        match_id: number;
        game_time: number;
        tick: number;
        heroes: Array<{
          hero: string;
          team: string;
          level: number;
          kills: number;
          deaths: number;
          assists: number;
          net_worth: number;
          gpm: number;
          xpm: number;
          items: Array<string | null>;
        }>;
      }>();

      const hudMetricsMock = vi.spyOn(backendAPI, 'getHudMetrics');
      hudMetricsMock
        .mockImplementationOnce(() => firstHudRequest.promise)
        .mockImplementationOnce(() => secondHudRequest.promise);

      render(<RealMatchViewer initialMatchId={8674716612} />);

      expect(await screen.findByText('HUD 同步中...')).toBeTruthy();

      await act(async () => {
        firstHudRequest.resolve({
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
              items: [],
            },
          ],
        });
      });

      await waitFor(() => {
        expect(screen.queryByText('HUD 同步中...')).toBeNull();
      });

      await act(async () => {
        now = 1000;
        fireEvent.click(screen.getByTestId('timeline-scrub'));
      });

      expect(hudMetricsMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('HUD 同步中...')).toBeNull();

      await act(async () => {
        secondHudRequest.resolve({
          status: 'ok',
          match_id: 8674716612,
          game_time: -30,
          tick: 200,
          heroes: [
            {
              hero: 'npc_dota_hero_axe',
              team: 'radiant',
              level: 9,
              kills: 3,
              deaths: 1,
              assists: 4,
              net_worth: 6000,
              gpm: 430,
              xpm: 520,
              items: [],
            },
          ],
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('hud-hero-card-radiant-1').textContent).toContain('Lv.9');
      });
    } finally {
      vi.restoreAllMocks();
    }
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
        heroes: ['npc_dota_hero_axe'],
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
    fireEvent.click(await screen.findByTestId('heatmap-hero-axe'));

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

  it('highlights HUD heroes when heatmap hero selection is active', async () => {
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
          items: [],
        },
        {
          hero: 'npc_dota_hero_lina',
          team: 'dire',
          level: 8,
          kills: 1,
          deaths: 2,
          assists: 4,
          net_worth: 5300,
          gpm: 410,
          xpm: 500,
          items: [],
        },
      ],
    });
    const getMatchHeatmapSpy = vi.spyOn(backendAPI, 'getMatchHeatmap').mockResolvedValue({
      data: {
        match_id: 8674716612,
        heatmap_type: 'movement',
        hero: 'npc_dota_hero_axe',
        heroes: ['npc_dota_hero_axe'],
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
        grid_data: [],
        max_density: 0,
        total_samples: 0,
      },
      meta: {
        generation_time_ms: 12,
      },
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect((await screen.findByTestId('hud-player-display-radiant-1')).className).toContain('text-amber-200');
    expect(screen.getByTestId('hud-player-display-radiant-1').className).toContain('drop-shadow-[0_0_7px_rgba(251,191,36,0.3)]');
    expect((await screen.findByTestId('hud-player-meta-radiant-1')).className).toContain('border-amber-200/65');
    expect(screen.getByTestId('hud-player-meta-radiant-1').className).toContain('bg-amber-300/18');
    expect(screen.getByTestId('hud-player-meta-radiant-1').className).toContain('ring-amber-200/20');
    expect(screen.getByTestId('hud-player-meta-radiant-1').className).toContain('shadow-[0_0_14px_rgba(251,191,36,0.16)]');

    fireEvent.click(await screen.findByTestId('toggle-map-workbench'));
    fireEvent.click(await screen.findByRole('button', { name: '移动' }));
    fireEvent.click(await screen.findByTestId('heatmap-hero-axe'));

    await waitFor(() => {
      expect(getMatchHeatmapSpy).toHaveBeenLastCalledWith(
        8674716612,
        expect.objectContaining({
          heroes: ['npc_dota_hero_axe'],
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('hud-hero-card-radiant-1').getAttribute('data-highlighted')).toBe('true');
      expect(screen.getByTestId('hud-hero-card-dire-6').getAttribute('data-highlighted')).toBe('false');
    });
    expect(screen.getByTestId('hud-player-display-radiant-1').className).toContain('text-cyan-100');
    expect(screen.getByTestId('hud-player-display-radiant-1').className).toContain('drop-shadow-[0_0_10px_rgba(34,211,238,0.55)]');
    expect(screen.getByTestId('hud-player-meta-radiant-1').className).toContain('border-cyan-100/80');
    expect(screen.getByTestId('hud-player-meta-radiant-1').className).toContain('bg-cyan-400/30');
    expect(screen.getByTestId('hud-player-meta-radiant-1').className).toContain('ring-cyan-300/35');
    expect(screen.getByTestId('hud-player-meta-radiant-1').className).toContain('shadow-[0_0_20px_rgba(34,211,238,0.28)]');
  });

  it('supports multi-hero path selection and highlights all selected HUD heroes', async () => {
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
          items: [],
        },
        {
          hero: 'npc_dota_hero_lina',
          team: 'dire',
          level: 8,
          kills: 1,
          deaths: 2,
          assists: 4,
          net_worth: 5300,
          gpm: 410,
          xpm: 500,
          items: [],
        },
      ],
    });
    const getMovementPathsSpy = vi.spyOn(backendAPI, 'getMovementPaths').mockResolvedValue({
      data: {
        match_id: 8674716612,
        time_range: {
          start: -90,
          end: 120,
        },
        hero_count: 2,
        simplification: {
          enabled: true,
          epsilon: 100,
          original_points: 12,
          simplified_points: 8,
          reduction_ratio: 0.33,
        },
        paths: [
          {
            hero: 'npc_dota_hero_axe',
            team: 2,
            team_name: 'radiant',
            point_count: 2,
            stats: {
              total_distance: 100,
              avg_speed: 300,
              time_alive: 120,
              time_dead: 0,
              death_count: 0,
            },
            points: [
              { time: -90, x: 10000, y: 12000, hp: 700, level: 1 },
              { time: -80, x: 10100, y: 12100, hp: 700, level: 1 },
            ],
          },
          {
            hero: 'npc_dota_hero_lina',
            team: 3,
            team_name: 'dire',
            point_count: 2,
            stats: {
              total_distance: 120,
              avg_speed: 320,
              time_alive: 120,
              time_dead: 0,
              death_count: 0,
            },
            points: [
              { time: -90, x: 21000, y: 20500, hp: 680, level: 1 },
              { time: -80, x: 21100, y: 20600, hp: 680, level: 1 },
            ],
          },
        ],
      },
      meta: {
        generation_time_ms: 10,
      },
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    fireEvent.click(await screen.findByTestId('toggle-map-workbench'));
    fireEvent.click(await screen.findByRole('button', { name: '开启路径分析' }));
    fireEvent.click(await screen.findByTestId('path-hero-axe'));
    fireEvent.click(await screen.findByTestId('path-hero-lina'));

    await waitFor(() => {
      expect(getMovementPathsSpy).toHaveBeenLastCalledWith(
        8674716612,
        expect.objectContaining({
          heroes: ['npc_dota_hero_axe', 'npc_dota_hero_lina'],
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('hud-hero-card-radiant-1').getAttribute('data-highlighted')).toBe('true');
      expect(screen.getByTestId('hud-hero-card-dire-6').getAttribute('data-highlighted')).toBe('true');
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
