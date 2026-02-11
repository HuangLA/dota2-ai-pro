import { MatchesResponse } from './backend';

// Define the API base URL (mirroring backend.ts)
const API_BASE_URL = 'http://localhost:8000';

export interface MatchSearchParams {
  limit?: number;
  offset?: number;
  // Note: match_id is NOT a query parameter - use getMatchDetail(id) for specific match
  account_id?: number;  // Filter by player account ID
  hero_id?: number;     // Filter by hero ID
  team_id?: number;     // Filter by team ID
  status?: string;      // Filter by parse status (pending/parsing/completed/failed)
  league_id?: number;   // Filter by league ID
}

export class MatchService {
  /**
   * Get matches with search parameters
   */
  async getMatches(params: MatchSearchParams): Promise<MatchesResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    if (params.account_id) queryParams.append('account_id', params.account_id.toString());
    if (params.hero_id) queryParams.append('hero_id', params.hero_id.toString());
    if (params.team_id) queryParams.append('team_id', params.team_id.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.league_id) queryParams.append('league_id', params.league_id.toString());

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/matches?${queryParams.toString()}`,
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
      console.error('Failed to fetch matches:', error);
      throw error;
    }
  }

  /**
   * Get a specific match by ID
   */
  async getMatchDetail(matchId: number): Promise<any> {
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
      console.error(`Failed to fetch match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a match by ID
   */
  async deleteMatch(matchId: number): Promise<boolean> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/matches/${matchId}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Failed to delete match ${matchId}:`, error);
      return false;
    }
  }
}

export const matchService = new MatchService();
export default matchService;
