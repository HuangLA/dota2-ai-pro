import { buildApiUrl } from './apiBase';

export type RemoteMatchSource = 'pro' | 'public';

export interface RemoteMatchRecord {
  match_id: number;
  start_time?: number | null;
  duration?: number | null;
  radiant_team_id?: number | null;
  dire_team_id?: number | null;
  radiant_name?: string | null;
  dire_name?: string | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  leagueid?: number | null;
  league_name?: string | null;
  source?: RemoteMatchSource | null;
  last_synced_at?: number | null;
  radiant_icon_url?: string | null;
  dire_icon_url?: string | null;
  league_icon_url?: string | null;
  radiant_logo_url?: string | null;
  dire_logo_url?: string | null;
  league_logo_url?: string | null;
  radiant_logo_sponsor_url?: string | null;
  dire_logo_sponsor_url?: string | null;
  league_image_url?: string | null;
  league_banner_url?: string | null;
  download_task_id?: string | null;
  download_status?: string | null;
  download_attempt_count?: number | null;
  download_error_code?: string | null;
  download_error_message?: string | null;
  download_updated_at?: number | null;
  local_parse_status?: string | null;
  local_replay_path?: string | null;
  radiant_win?: boolean | null;
  winner_team?: 'radiant' | 'dire' | number | string | null;
  winner_name?: string | null;
  winner_display_name?: string | null;
  radiant_score?: number | null;
  dire_score?: number | null;
  player_id?: number | null;
  player_name?: string | null;
  players?: RemoteMatchPlayer[] | null;
  radiant_players?: RemoteMatchPlayer[] | null;
  dire_players?: RemoteMatchPlayer[] | null;
  radiant_lineup?: Array<string | RemoteMatchPlayer> | null;
  dire_lineup?: Array<string | RemoteMatchPlayer> | null;
  lineup?: {
    radiant?: Array<string | RemoteMatchPlayer> | null;
    dire?: Array<string | RemoteMatchPlayer> | null;
  } | null;
}

export interface RemoteMatchPlayer {
  account_id?: number | null;
  player_name?: string | null;
  display_name?: string | null;
  display_type?: string | null;
  pro_name?: string | null;
  persona_name?: string | null;
  hero_id?: number | null;
  hero_name?: string | null;
  team?: 'radiant' | 'dire' | string | number | null;
  team_id?: number | null;
  player_slot?: number | null;
}

export interface RemoteMatchesResponse {
  status: string;
  message?: string | null;
  total: number;
  limit: number;
  offset: number;
  matches: RemoteMatchRecord[];
}

export interface RemoteMatchesParams {
  limit?: number;
  offset?: number;
  match_id?: number;
  leagueid?: number;
  team_id?: number;
  player_id?: number;
  sources?: RemoteMatchSource[];
}

export interface RemoteSearchParams {
  q?: string;
  limit?: number;
  offset?: number;
  match_id?: number;
  leagueid?: number;
  team_id?: number;
  player_id?: number;
  player_name?: string;
  league_name?: string;
  team_name?: string;
  sources?: RemoteMatchSource[];
}

export interface RemoteSyncResponse {
  status: string;
  message?: string;
}

export interface RemoteIngestResponse {
  status: string;
  message?: string;
  total?: number;
  succeeded?: number;
  failed?: number;
  results?: Array<{
    match_id: number;
    status: string;
    task_id?: string | null;
    message?: string | null;
  }>;
}

export interface RemoteMatchStatusResponse {
  status: string;
  match_id: number;
  download_task?: {
    task_id?: string;
    status?: string;
    attempt_count?: number;
    progress?: number | null;
    error_code?: string | null;
    error_message?: string | null;
    updated_at?: number;
    download_path?: string | null;
  } | null;
  local_parse_status?: string | null;
  local_replay_path?: string | null;
  replay_dem_exists: boolean;
  replay_bz2_exists: boolean;
}

class RemoteService {
  async getRemoteMatches(params: RemoteMatchesParams): Promise<RemoteMatchesResponse> {
    const queryParams = new URLSearchParams();

    if (params.limit !== undefined) {
      queryParams.append('limit', String(params.limit));
    }
    if (params.offset !== undefined) {
      queryParams.append('offset', String(params.offset));
    }
    if (params.match_id !== undefined) {
      queryParams.append('match_id', String(params.match_id));
    }
    if (params.leagueid !== undefined) {
      queryParams.append('leagueid', String(params.leagueid));
    }
    if (params.team_id !== undefined) {
      queryParams.append('team_id', String(params.team_id));
    }
    if (params.player_id !== undefined) {
      queryParams.append('player_id', String(params.player_id));
    }
    if (params.sources !== undefined) {
      queryParams.append('include_pro', String(params.sources.includes('pro')));
      queryParams.append('include_public', String(params.sources.includes('public')));
    }

    const response = await fetch(buildApiUrl(`/api/v1/remote/matches?${queryParams.toString()}`), {
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

  async searchRemoteMatches(params: RemoteSearchParams): Promise<RemoteMatchesResponse> {
    const queryParams = new URLSearchParams();

    if (params.q !== undefined && params.q.trim()) {
      queryParams.append('q', params.q.trim());
    }
    if (params.limit !== undefined) {
      queryParams.append('limit', String(params.limit));
    }
    if (params.offset !== undefined) {
      queryParams.append('offset', String(params.offset));
    }
    if (params.match_id !== undefined) {
      queryParams.append('match_id', String(params.match_id));
    }
    if (params.player_id !== undefined) {
      queryParams.append('player_id', String(params.player_id));
    }
    if (params.leagueid !== undefined) {
      queryParams.append('leagueid', String(params.leagueid));
    }
    if (params.team_id !== undefined) {
      queryParams.append('team_id', String(params.team_id));
    }
    if (params.player_name !== undefined && params.player_name.trim()) {
      queryParams.append('player_name', params.player_name.trim());
    }
    if (params.league_name !== undefined && params.league_name.trim()) {
      queryParams.append('league_name', params.league_name.trim());
    }
    if (params.team_name !== undefined && params.team_name.trim()) {
      queryParams.append('team_name', params.team_name.trim());
    }
    if (params.sources !== undefined) {
      queryParams.append('include_pro', String(params.sources.includes('pro')));
      queryParams.append('include_public', String(params.sources.includes('public')));
    }

    const response = await fetch(buildApiUrl(`/api/v1/remote/search?${queryParams.toString()}`), {
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

  async syncRemoteMatches(payload?: {
    sources?: RemoteMatchSource[];
    limit?: number;
    sync_reference?: boolean;
  }): Promise<RemoteSyncResponse> {
    const sources = payload?.sources ?? [];
    const requestBody = {
      include_pro: sources.length === 0 ? true : sources.includes('pro'),
      include_public: sources.length === 0 ? false : sources.includes('public'),
      limit: payload?.limit,
      sync_reference: payload?.sync_reference,
    };

    const response = await fetch(buildApiUrl('/api/v1/remote/sync'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async ingestMatches(matchIds: number[]): Promise<RemoteIngestResponse> {
    const response = await fetch(buildApiUrl('/api/v1/remote/ingest'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ match_ids: matchIds }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async getMatchStatus(matchId: number): Promise<RemoteMatchStatusResponse> {
    const response = await fetch(buildApiUrl(`/api/v1/remote/matches/${matchId}/status`), {
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

  async cancelMatchDownload(matchId: number): Promise<{ status: string; message?: string }> {
    const response = await fetch(buildApiUrl(`/api/v1/remote/matches/${matchId}/download`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<{ status: string; message?: string }>;
  }
}

export const remoteService = new RemoteService();
