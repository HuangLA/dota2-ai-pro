export interface ReplayEntryContext {
  source: 'match_database' | 'team_profile' | 'replay_library';
  matchId: number;
  downloadStatus?: string;
  downloadTaskId?: string;
}

export interface TeamProfileReplayContext extends ReplayEntryContext {
  source: 'team_profile';
}
