/**
 * Backend API Service
 * Handles communication with Python FastAPI backend
 */

const API_BASE_URL = 'http://localhost:8000';

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
  heroes: HeroData[];
}

export interface TicksResponse {
  match_id: number;
  start_time: number;
  end_time: number;
  interval: number;
  ticks: TickData[];
  total_samples: number;
}

export interface WardData {
  type: 'placed' | 'destroyed';
  ward_type: 'observer' | 'sentry';
  tick: number;
  time: number;
  handle: number;
  x?: number;
  y?: number;
  team?: number;
  team_name?: string;
}

export interface WardsResponse {
  match_id: number;
  wards: WardData[];
  summary: {
    total: number;
    placed: number;
    destroyed: number;
    observers_placed: number;
    sentries_placed: number;
  };
}

export interface MatchDetail {
  match_id: number;
  radiant_team: string;
  dire_team: string;
  radiant_win: boolean;
  duration: number;
  game_mode: string;
  parsed_at: string;
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
      const response = await fetch(`${API_BASE_URL}/health`, {
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
        `${API_BASE_URL}/api/v1/matches?limit=${limit}&offset=${offset}`,
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
        `${API_BASE_URL}/api/v1/matches/${matchId}`,
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
        `${API_BASE_URL}/api/v1/playback/${matchId}/ticks?start_time=${startTime}&end_time=${endTime}`,
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
        `${API_BASE_URL}/api/v1/playback/${matchId}/wards`,
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
   * Get list of available matches (typed version)
   */
  async getMatchList(limit = 20, offset = 0): Promise<Match[]> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/matches?limit=${limit}&offset=${offset}`,
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
