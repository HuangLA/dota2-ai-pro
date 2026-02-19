const API_BASE_URL = 'http://localhost:8000';

export interface TeamProfileMatchRecord {
  match_id: number;
  start_time: number;
  duration: number;
  radiant_team_id?: number | null;
  dire_team_id?: number | null;
  leagueid?: number | null;
  league_name?: string | null;
  download_status?: string | null;
  download_task_id?: string | null;
  replay_url?: string | null;
}

export interface TeamProfileMatchesResponse {
  status: string;
  total: number;
  limit: number;
  offset: number;
  matches: TeamProfileMatchRecord[];
}

export interface TeamProfileMatchesParams {
  team_id: number;
  limit?: number;
  offset?: number;
}

class TeamProfileService {
  async getTeamMatches(params: TeamProfileMatchesParams): Promise<TeamProfileMatchesResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append('team_id', String(params.team_id));
    queryParams.append('limit', String(params.limit ?? 20));
    queryParams.append('offset', String(params.offset ?? 0));

    const response = await fetch(
      `${API_BASE_URL}/api/v1/admin/opendota/matches?${queryParams.toString()}`,
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

    return response.json();
  }
}

export const teamProfileService = new TeamProfileService();
