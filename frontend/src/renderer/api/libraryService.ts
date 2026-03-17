import { buildApiUrl } from './apiBase';

export interface LibraryMatchRecord {
  match_id: number;
  start_time?: number | null;
  duration?: number | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  league_name?: string | null;
  leagueid?: number | null;
  replay_path?: string | null;
  parse_status?: string | null;
}

export interface LibraryMatchesResponse {
  status: string;
  total: number;
  limit: number;
  offset: number;
  matches: LibraryMatchRecord[];
}

export interface LibraryMatchesParams {
  team_id?: number;
  player_id?: number;
  leagueid?: number;
  limit?: number;
  offset?: number;
}

export interface LibraryMatchActionResponse {
  status: string;
  message: string;
}

class LibraryService {
  async getLibraryMatches(params: LibraryMatchesParams): Promise<LibraryMatchesResponse> {
    const queryParams = new URLSearchParams();

    if (params.team_id !== undefined) {
      queryParams.append('team_id', String(params.team_id));
    }
    if (params.player_id !== undefined) {
      queryParams.append('player_id', String(params.player_id));
    }
    if (params.leagueid !== undefined) {
      queryParams.append('leagueid', String(params.leagueid));
    }
    if (params.limit !== undefined) {
      queryParams.append('limit', String(params.limit));
    }
    if (params.offset !== undefined) {
      queryParams.append('offset', String(params.offset));
    }

    const response = await fetch(buildApiUrl(`/api/v1/library/matches?${queryParams.toString()}`), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async deleteLibraryMatch(matchId: number): Promise<LibraryMatchActionResponse> {
    const response = await fetch(buildApiUrl(`/api/v1/library/${matchId}/delete`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }
}

export const libraryService = new LibraryService();
