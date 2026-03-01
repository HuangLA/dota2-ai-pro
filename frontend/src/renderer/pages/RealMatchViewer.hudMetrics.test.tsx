// @vitest-environment jsdom


import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import RealMatchViewer from './RealMatchViewer';
import backendAPI from '../api/backend';

vi.mock('../components/map/MapViewer', () => ({
  __esModule: true,
  default: () => <div data-testid="map-viewer">Mock Map</div>,
}));

vi.mock('../components/timeline', () => ({
  Timeline: () => <div data-testid="timeline">Mock Timeline</div>,
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
    });
    vi.spyOn(backendAPI, 'getHeroPositions').mockResolvedValue(BASE_TICKS_RESPONSE);
    vi.spyOn(backendAPI, 'getWards').mockResolvedValue({
      match_id: 8674716612,
      wards: [],
      summary: {
        total: 0,
        placed: 0,
        destroyed: 0,
        observers_placed: 0,
        sentries_placed: 0,
      },
    });
  });

  it('renders HUD columns and one hero row when API succeeds', async () => {
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
          items: ['blink', 'phase_boots'],
        },
      ],
    });

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect(await screen.findByText('HUD 指标')).toBeTruthy();
    expect((await screen.findAllByText('英雄')).length).toBeGreaterThan(0);
    expect(await screen.findByText('阵营')).toBeTruthy();
    expect(await screen.findByText('等级')).toBeTruthy();
    expect(await screen.findByText('K/D/A')).toBeTruthy();
    expect(await screen.findByText('NW')).toBeTruthy();
    expect(await screen.findByText('GPM')).toBeTruthy();
    expect(await screen.findByText('XPM')).toBeTruthy();
    expect(await screen.findByText('2/1/3')).toBeTruthy();
    expect(await screen.findByText('5,420')).toBeTruthy();

    await waitFor(() => {
      expect(backendAPI.getHudMetrics).toHaveBeenCalledTimes(1);
    });
  });

  it('shows HUD error state while keeping main viewer content rendered', async () => {
    vi.spyOn(backendAPI, 'getHudMetrics').mockResolvedValue(null);

    render(<RealMatchViewer initialMatchId={8674716612} />);

    expect(await screen.findByText('地图视图')).toBeTruthy();
    expect(await screen.findByTestId('map-viewer')).toBeTruthy();
    expect(await screen.findByTestId('timeline')).toBeTruthy();
    expect(await screen.findByText('HUD 指标请求失败，不影响主回放。')).toBeTruthy();
  });
});
