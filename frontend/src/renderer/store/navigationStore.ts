/**
 * Navigation Store - Zustand store for managing page navigation state
 * Persists view states across page transitions for seamless user experience
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type HasDownloadFilter = 'all' | 'true' | 'false';

interface FilterFormState {
  teamId: string;
  leagueId: string;
  startTimeFrom: string;
  startTimeTo: string;
  hasDownload: HasDownloadFilter;
  professionalOnly: boolean;
}

interface TeamProfileSnapshot {
  name: string;
  teamId: number;
  limit: number;
  leagueQuickFilter: number | null;
  sort: 'newest' | 'oldest';
  onlyWithDownload: boolean;
  focusLatestLeague: boolean;
  compareSelection: number[];
}

export interface MatchDatabaseViewState {
  filters: FilterFormState;
  appliedFilters: FilterFormState;
  offset: number;
}

export interface TeamProfileViewState {
  teamId: number;
  limit: number;
  leagueQuickFilter: number | null;
  sort: 'newest' | 'oldest';
  onlyWithDownload: boolean;
  focusLatestLeague: boolean;
  presetView: 'all' | 'with_download' | 'latest_20';
  compareSelection: number[];
  expandedLeagues: Set<number>;
  snapshots: TeamProfileSnapshot[];
}

interface NavigationState {
  // Match Database page state
  matchDatabaseViewState: MatchDatabaseViewState | undefined;
  
  // Team Profile page state
  teamProfileViewState: TeamProfileViewState | undefined;
  
  // Previous page for breadcrumb/back navigation
  previousPage: string | null;
  
  // Actions
  setMatchDatabaseViewState: (state: MatchDatabaseViewState | undefined) => void;
  setTeamProfileViewState: (state: TeamProfileViewState | undefined) => void;
  setPreviousPage: (page: string | null) => void;
  
  // Helper actions
  updateMatchDatabaseOffset: (offset: number) => void;
  updateMatchDatabaseFilters: (filters: FilterFormState) => void;
  updateTeamProfileTeamId: (teamId: number) => void;
  updateTeamProfileLeagueFilter: (leagueId: number | null) => void;
  
  // Reset actions
  clearMatchDatabaseState: () => void;
  clearTeamProfileState: () => void;
  clearAllNavigationState: () => void;
}

const initialState = {
  matchDatabaseViewState: undefined as MatchDatabaseViewState | undefined,
  teamProfileViewState: undefined as TeamProfileViewState | undefined,
  previousPage: null as string | null,
};

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setMatchDatabaseViewState: (state) => set({ matchDatabaseViewState: state }),
      
      setTeamProfileViewState: (state) => set({ teamProfileViewState: state }),
      
      setPreviousPage: (page) => set({ previousPage: page }),

      updateMatchDatabaseOffset: (offset) => {
        const current = get().matchDatabaseViewState;
        if (current) {
          set({
            matchDatabaseViewState: { ...current, offset },
          });
        }
      },

      updateMatchDatabaseFilters: (filters) => {
        const current = get().matchDatabaseViewState;
        set({
          matchDatabaseViewState: {
            filters,
            appliedFilters: filters,
            offset: current?.offset ?? 0,
          },
        });
      },

      updateTeamProfileTeamId: (teamId) => {
        const current = get().teamProfileViewState;
        set({
          teamProfileViewState: {
            ...current,
            teamId,
            limit: current?.limit ?? 100,
            leagueQuickFilter: current?.leagueQuickFilter ?? null,
            sort: current?.sort ?? 'newest',
            onlyWithDownload: current?.onlyWithDownload ?? false,
            focusLatestLeague: current?.focusLatestLeague ?? false,
            presetView: current?.presetView ?? 'all',
            compareSelection: current?.compareSelection ?? [],
            expandedLeagues: current?.expandedLeagues ?? new Set(),
            snapshots: current?.snapshots ?? [],
          } as TeamProfileViewState,
        });
      },

      updateTeamProfileLeagueFilter: (leagueId) => {
        const current = get().teamProfileViewState;
        if (current) {
          set({
            teamProfileViewState: { ...current, leagueQuickFilter: leagueId },
          });
        }
      },

      clearMatchDatabaseState: () => set({ matchDatabaseViewState: undefined }),
      
      clearTeamProfileState: () => set({ teamProfileViewState: undefined }),
      
      clearAllNavigationState: () => set(initialState),
    }),
    {
      name: 'navigation-store',
      partialize: (state) => ({
        matchDatabaseViewState: state.matchDatabaseViewState,
        teamProfileViewState: state.teamProfileViewState,
      }),
    }
  )
);

// Selector hooks for better performance
export const useMatchDatabaseViewState = () => 
  useNavigationStore((state) => state.matchDatabaseViewState);

export const useTeamProfileViewState = () => 
  useNavigationStore((state) => state.teamProfileViewState);

export const usePreviousPage = () => 
  useNavigationStore((state) => state.previousPage);
