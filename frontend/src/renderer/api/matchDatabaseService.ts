const API_BASE_URL = 'http://localhost:8000';

export interface MatchDatabaseRecord {
  match_id: number;
  start_time: number;
  duration: number;
  radiant_team_id?: number | null;
  dire_team_id?: number | null;
  leagueid?: number | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  league_name?: string | null;
  download_status?: string | null;
  download_task_id?: string | null;
  download_attempt_count?: number | null;
}

export interface MatchDatabaseListResponse {
  status: string;
  total: number;
  limit: number;
  offset: number;
  matches: MatchDatabaseRecord[];
}

export interface MatchDatabaseListParams {
  limit?: number;
  offset?: number;
  team_id?: number;
  leagueid?: number;
  start_time_from?: number;
  start_time_to?: number;
  has_download?: boolean;
  professional_only?: boolean;
}

export type MatchDatabaseActionMode = 'prepare' | 'prepare_and_execute';

export interface MatchDatabaseActionTask {
  task_id: string;
  match_id: number;
  status: string;
  attempt_count?: number;
  replay_url?: string | null;
  download_path?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: number;
  updated_at?: number;
}

export interface MatchDatabaseActionResponse {
  status: string;
  message: string;
  task: MatchDatabaseActionTask | null;
}

export interface ReplayDownloadTaskDetailsResponse {
  status: string;
  message: string;
  task: MatchDatabaseActionTask | null;
}

class MatchDatabaseService {
  async getMatchDatabase(params: MatchDatabaseListParams): Promise<MatchDatabaseListResponse> {
    const queryParams = new URLSearchParams();

    if (params.limit !== undefined) {
      queryParams.append('limit', String(params.limit));
    }
    if (params.offset !== undefined) {
      queryParams.append('offset', String(params.offset));
    }
    if (params.team_id !== undefined) {
      queryParams.append('team_id', String(params.team_id));
    }
    if (params.leagueid !== undefined) {
      queryParams.append('leagueid', String(params.leagueid));
    }
    if (params.start_time_from !== undefined) {
      queryParams.append('start_time_from', String(params.start_time_from));
    }
    if (params.start_time_to !== undefined) {
      queryParams.append('start_time_to', String(params.start_time_to));
    }
    if (params.has_download !== undefined) {
      queryParams.append('has_download', String(params.has_download));
    }
    if (params.professional_only !== undefined) {
      queryParams.append('professional_only', String(params.professional_only));
    }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/admin/match-database?${queryParams.toString()}`,
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

  async triggerDownloadAction(
    matchId: number,
    mode: MatchDatabaseActionMode
  ): Promise<MatchDatabaseActionResponse> {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/admin/match-database/${matchId}/download`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async getDownloadTaskDetails(taskId: string): Promise<ReplayDownloadTaskDetailsResponse> {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/admin/replays/download/tasks/${encodeURIComponent(taskId)}`,
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

export const matchDatabaseService = new MatchDatabaseService();
