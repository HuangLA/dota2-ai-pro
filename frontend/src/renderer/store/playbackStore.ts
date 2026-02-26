/**
 * Playback Store - Zustand store for managing RealMatchViewer playback state
 * Manages core playback timeline and match selection state
 */

import { create } from 'zustand';

interface PlaybackState {
  // Core playback state
  selectedMatch: number | null;
  currentTime: number;
  currentDisplayGameTime: number;
  isPauseActive: boolean;
  loading: boolean;
  error: string | null;

  // Actions
  setSelectedMatch: (matchId: number | null) => void;
  setCurrentTime: (time: number) => void;
  setCurrentDisplayGameTime: (gameTime: number) => void;
  setIsPauseActive: (paused: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  selectedMatch: null,
  currentTime: 0,
  currentDisplayGameTime: -90,
  isPauseActive: false,
  loading: false,
  error: null,
};

export const usePlaybackStore = create<PlaybackState>((set) => ({
  ...initialState,

  setSelectedMatch: (matchId) => set({ selectedMatch: matchId }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setCurrentDisplayGameTime: (gameTime) => set({ currentDisplayGameTime: gameTime }),
  setIsPauseActive: (paused) => set({ isPauseActive: paused }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
