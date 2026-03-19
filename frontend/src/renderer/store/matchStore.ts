/**
 * Match Store - Zustand store for managing match selection and replay context
 * Provides global state for cross-page match navigation
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReplayEntryContext {
  source: 'match_database' | 'team_profile' | 'replay_library';
  matchId: number;
  downloadStatus?: string;
  downloadTaskId?: string;
}

interface MatchState {
  // Core match state
  currentMatchId: number | null;
  replayEntryContext: ReplayEntryContext | null;

  // Loading/error states
  isLoading: boolean;
  error: string | null;

  // Actions
  selectMatch: (matchId: number, context?: ReplayEntryContext) => void;
  clearMatch: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const initialState = {
  currentMatchId: null,
  replayEntryContext: null,
  isLoading: false,
  error: null,
};

export const useMatchStore = create<MatchState>()(
  persist(
    (set) => ({
      ...initialState,

      selectMatch: (matchId, context) =>
        set({
          currentMatchId: matchId,
          replayEntryContext: context || null,
          error: null,
        }),

      clearMatch: () => set(initialState),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),
    }),
    {
      name: 'match-store',
      partialize: (state) => ({
        currentMatchId: state.currentMatchId,
        replayEntryContext: state.replayEntryContext,
      }),
    }
  )
);

// Selector hooks for better performance
export const useCurrentMatchId = () => useMatchStore((state) => state.currentMatchId);
export const useReplayEntryContext = () => useMatchStore((state) => state.replayEntryContext);
export const useMatchLoading = () => useMatchStore((state) => state.isLoading);
export const useMatchError = () => useMatchStore((state) => state.error);
