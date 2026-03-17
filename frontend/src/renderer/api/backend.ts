/**
 * Backend API Service
 * Handles communication with Python FastAPI backend
 */

import { buildApiUrl } from './apiBase';

export interface HealthResponse {
  status: string;
  service: string;
}

export interface Match {
  match_id: number;
  radiant_team?: string;
  dire_team?: string;
  duration?: number;
  radiant_win?: boolean;
  parsed_at?: string;
  replay_path?: string | null;
  parse_status?: string;
  updated_at?: number;
}

export interface MatchesResponse {
  matches: Match[];
  total: number;
  limit: number;
  offset: number;
}

export interface HeroData {
  hero: string;
  handle: number;
  team: number;
  team_name: string;
  x: number;
  y: number;
  hp?: number;
  max_hp?: number;
  mana?: number;
  max_mana?: number;
  level?: number;
}

export interface TickData {
  tick: number;
  time: number;
  game_time?: number;
  heroes: HeroData[];
}

export interface PlaybackTimeBasis {
  basis?: string;
  source?: string;
  strategy?: string;
  offset_seconds?: number;
  game_start_time?: number;
  pause_intervals?: PauseInterval[];
}

export interface PauseInterval {
  start_time?: number;
  end_time?: number;
  start_source_time?: number;
  end_source_time?: number;
  start_replay_time?: number;
  end_replay_time?: number;
  start_game_time?: number;
  end_game_time?: number;
}

export interface TicksResponse {
  match_id: number;
  start_time: number;
  end_time: number;
  interval: number;
  time_basis?: PlaybackTimeBasis;
  ticks: TickData[];
  total_samples: number;
}

export interface WardData {
  type: 'placed' | 'destroyed';
  ward_type: 'observer' | 'sentry';
  tick: number;
  time: number;
  game_time?: number;
  handle: number;
  x?: number;
  y?: number;
  team?: number;
  team_name?: string;
}

export interface WardsResponse {
  match_id: number;
  time_basis?: PlaybackTimeBasis;
  wards: WardData[];
  summary: {
    total: number;
    placed: number;
    destroyed: number;
    observers_placed: number;
    sentries_placed: number;
  };
}

export interface HudHeroMetric {
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
}

export interface PlaybackHudResponse {
  status: string;
  match_id: number;
  game_time: number;
  tick: number;
  heroes: HudHeroMetric[];
  message?: string;
  warnings?: string[];
}

export interface MatchDetail {
  match_id: number;
  radiant_team: string;
  dire_team: string;
  radiant_win: boolean;
  duration: number;
  game_mode: string | number | null;
  parsed_at: string;
  replay_path?: string | null;
  parse_status?: string;
  updated_at?: number;
}

export interface AdvantageData {
  tick: number;
  game_time: number;
  radiant_gold: number;
  dire_gold: number;
  radiant_xp: number;
  dire_xp: number;
  gold_advantage: number;
  xp_advantage: number;
}

export interface AdvantageResponse {
  match_id: number;
  data: AdvantageData[];
  time_basis: PlaybackTimeBasis;
  summary?: {
    total_samples: number;
    max_gold_advantage: number;
    min_gold_advantage: number;
    max_xp_advantage: number;
    min_xp_advantage: number;
  };
  message?: string;
}

export interface HeatmapBounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

export interface HeatmapCell {
  grid_x: number;
  grid_y: number;
  x: number;
  y: number;
  density: number;
}

export interface MatchHeatmapResponse {
  data: {
    match_id: number;
    heatmap_type: string;
    hero?: string | null;
    team?: number | null;
    time_range: {
      start: number;
      end: number;
    };
    grid_size: number;
    map_bounds: HeatmapBounds;
    grid_data: HeatmapCell[];
    max_density: number;
    total_samples: number;
  };
  meta: {
    generation_time_ms: number;
  };
}

export interface MovementPathPoint {
  time: number;
  x: number;
  y: number;
  hp: number;
  level: number;
}

export interface MovementPathSeries {
  hero: string;
  team: number;
  team_name: string;
  points: MovementPathPoint[];
  point_count: number;
  stats: {
    total_distance: number;
    avg_speed: number;
    time_alive: number;
    time_dead: number;
    death_count: number;
  };
}

export interface MovementPathsResponse {
  data: {
    match_id: number;
    time_range: {
      start: number;
      end: number;
    };
    paths: MovementPathSeries[];
    hero_count: number;
    simplification: {
      enabled: boolean;
      epsilon: number;
      original_points: number;
      simplified_points: number;
      reduction_ratio: number;
    };
  };
  meta: {
    generation_time_ms: number;
  };
}

export interface ApiTestResult {
  success: boolean;
  status?: number;
  data?: any;
  error?: string;
  responseTime?: number;
}

class BackendAPI {
  /**
   * Test if backend is healthy
   */
  async healthCheck(): Promise<ApiTestResult> {
    const startTime = performance.now();
    
    try {
      const response = await fetch(buildApiUrl('/health'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseTime = performance.now() - startTime;
      const data: HealthResponse = await response.json();

      return {
        success: response.ok,
        status: response.status,
        data,
        responseTime: Math.round(responseTime),
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Math.round(responseTime),
      };
    }
  }

  /**
   * Get list of matches
   */
  async getMatches(limit = 20, offset = 0): Promise<ApiTestResult> {
    const startTime = performance.now();
    
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/matches?limit=${limit}&offset=${offset}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const responseTime = performance.now() - startTime;
      const data: MatchesResponse = await response.json();

      return {
        success: response.ok,
        status: response.status,
        data,
        responseTime: Math.round(responseTime),
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Math.round(responseTime),
      };
    }
  }

  /**
   * Test all backend endpoints
   */
  async testAll(): Promise<{
    health: ApiTestResult;
    matches: ApiTestResult;
  }> {
    const [health, matches] = await Promise.all([
      this.healthCheck(),
      this.getMatches(),
    ]);

    return { health, matches };
  }

  /**
   * Get match detail by ID
   */
  async getMatchDetail(matchId: number): Promise<MatchDetail | null> {
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/matches/${matchId}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch match detail:', error);
      return null;
    }
  }

  /**
   * Get hero positions for a specific time range
   */
  async getHeroPositions(
    matchId: number,
    startTime: number = 0,
    endTime: number = 60
  ): Promise<TicksResponse | null> {
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/playback/${matchId}/ticks?start_time=${startTime}&end_time=${endTime}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: TicksResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch hero positions:', error);
      return null;
    }
  }

  /**
   * Get ward placements for a match
   */
  async getWards(matchId: number): Promise<WardsResponse | null> {
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/playback/${matchId}/wards`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: WardsResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch wards:', error);
      return null;
    }
  }

  /**
   * Get playback HUD metrics for one timepoint
   */
  async getHudMetrics(
    matchId: number,
    params?: { gameTime?: number; tick?: number; signal?: AbortSignal }
  ): Promise<PlaybackHudResponse | null> {
    try {
      const query = new URLSearchParams();

      if (typeof params?.gameTime === 'number' && Number.isFinite(params.gameTime)) {
        query.set('game_time', String(params.gameTime));
      }
      if (typeof params?.tick === 'number' && Number.isFinite(params.tick)) {
        query.set('tick', String(Math.floor(params.tick)));
      }

      const queryString = query.toString();
      const response = await fetch(
        buildApiUrl(`/api/v1/playback/${matchId}/hud${queryString ? `?${queryString}` : ''}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: params?.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: PlaybackHudResponse = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      console.error('Failed to fetch HUD metrics:', error);
      return null;
    }
  }

  /**
   * Get gold/XP advantage data for a match
   */
  async getAdvantage(
    matchId: number,
    signal?: AbortSignal
  ): Promise<AdvantageResponse | null> {
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/playback/${matchId}/advantage`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: AdvantageResponse = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      console.error('Failed to fetch advantage data:', error);
      return null;
    }
  }

  async getMatchHeatmap(
    matchId: number,
    params: {
      heatmapType: 'movement' | 'kill' | 'death';
      gridSize?: number;
      hero?: string;
      team?: number;
      startTime?: number;
      endTime?: number;
      signal?: AbortSignal;
    }
  ): Promise<MatchHeatmapResponse | null> {
    try {
      const query = new URLSearchParams();
      query.set('heatmap_type', params.heatmapType);
      query.set('grid_size', String(params.gridSize ?? 64));

      if (params.hero) {
        query.set('hero', params.hero);
      }
      if (typeof params.team === 'number' && Number.isFinite(params.team)) {
        query.set('team', String(params.team));
      }
      if (typeof params.startTime === 'number' && Number.isFinite(params.startTime)) {
        query.set('start_time', String(Math.floor(params.startTime)));
      }
      if (typeof params.endTime === 'number' && Number.isFinite(params.endTime)) {
        query.set('end_time', String(Math.floor(params.endTime)));
      }

      const response = await fetch(
        buildApiUrl(`/api/v1/visualization/${matchId}/heatmap?${query.toString()}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: params.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: MatchHeatmapResponse = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      console.error('Failed to fetch heatmap data:', error);
      return null;
    }
  }

  async getMovementPaths(
    matchId: number,
    params: {
      hero?: string;
      team?: number;
      startTime?: number;
      endTime?: number;
      simplify?: boolean;
      epsilon?: number;
      signal?: AbortSignal;
    }
  ): Promise<MovementPathsResponse | null> {
    try {
      const query = new URLSearchParams();

      if (params.hero) {
        query.set('hero', params.hero);
      }
      if (typeof params.team === 'number' && Number.isFinite(params.team)) {
        query.set('team', String(params.team));
      }
      if (typeof params.startTime === 'number' && Number.isFinite(params.startTime)) {
        query.set('start_time', String(params.startTime));
      }
      if (typeof params.endTime === 'number' && Number.isFinite(params.endTime)) {
        query.set('end_time', String(params.endTime));
      }
      query.set('simplify', String(params.simplify ?? true));
      query.set('epsilon', String(params.epsilon ?? 100));

      const response = await fetch(
        buildApiUrl(`/api/v1/visualization/${matchId}/paths?${query.toString()}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: params.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: MovementPathsResponse = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      console.error('Failed to fetch movement paths:', error);
      return null;
    }
  }

  /**
   * Get list of available matches (typed version)
   */
  async getMatchList(limit = 20, offset = 0): Promise<Match[]> {
    try {
      const response = await fetch(
        buildApiUrl(`/api/v1/matches?limit=${limit}&offset=${offset}`),
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: MatchesResponse = await response.json();
      return data.matches || [];
    } catch (error) {
      console.error('Failed to fetch match list:', error);
      return [];
    }
  }
}

export const backendAPI = new BackendAPI();
export default backendAPI;
