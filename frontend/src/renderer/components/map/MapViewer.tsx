/**
 * MapViewer Component
 * React wrapper for DotaMapRenderer
 */

import { useEffect, useRef, useState } from 'react';
import DotaMapRenderer, { HeatmapBounds, HeroPosition, KillMarkerData, Ward } from './DotaMapRenderer';

export interface MapViewerProps {
  width?: number;
  height?: number;
  mapImageUrl?: string;
  heroPositions?: HeroPosition[];
  wards?: Ward[];
  /** Kill markers to display on the minimap */
  killMarkers?: KillMarkerData[];
  /** Current game time for kill marker fade calculation */
  currentGameTime?: number;
  /** Whether to show hero movement path traces */
  showPaths?: boolean;
  /** 是否使用英雄图标（默认 true） */
  useHeroIcons?: boolean;
  /** 英雄图标大小（默认 32） */
  heroIconSize?: number;
  /** 是否显示校准标记（用于调试坐标对齐） */
  showCalibrationMarkers?: boolean;
  /** 热力图网格数据 (64×64 normalized grid) */
  heatmapGrid?: number[][] | null;
  /** 热力图坐标边界 */
  heatmapBounds?: HeatmapBounds | null;
}

export function MapViewer({
  width = 800,
  height = 800,
  mapImageUrl,
  heroPositions = [],
  wards = [],
  killMarkers = [],
  currentGameTime = 0,
  showPaths = false,
  useHeroIcons = true,
  heroIconSize = 32,
  showCalibrationMarkers = false,
  heatmapGrid = null,
  heatmapBounds = null,
}: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<DotaMapRenderer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize renderer on mount
  useEffect(() => {
    if (!containerRef.current) {
      console.log('[MapViewer] No container ref');
      return;
    }

    // If already have a renderer, skip
    if (rendererRef.current) {
      console.log('[MapViewer] Renderer already exists');
      return;
    }

    console.log('[MapViewer] Starting initialization...');

    // Clear any existing canvas from previous render
    const container = containerRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    let mounted = true;
    const renderer = new DotaMapRenderer({
      width,
      height,
      // 只有在明确传入时才覆盖默认值
      ...(mapImageUrl !== undefined && { mapImageUrl }),
      useHeroIcons,
      heroIconSize,
      showCalibrationMarkers,
    });

    renderer.init(container).then(() => {
      if (mounted) {
        rendererRef.current = renderer;
        setIsInitialized(true);
        console.log('[MapViewer] Renderer initialized successfully');
      } else {
        // Component unmounted during init
        renderer.destroy();
      }
    }).catch((err) => {
      console.error('Failed to initialize map renderer:', err);
      if (mounted) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    });

    return () => {
      console.log('[MapViewer] Cleanup called');
      mounted = false;
      if (rendererRef.current) {
        console.log('[MapViewer] Destroying renderer');
        rendererRef.current.destroy();
        rendererRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [width, height, mapImageUrl, useHeroIcons, heroIconSize, showCalibrationMarkers]);

  // Update hero positions
  useEffect(() => {
    if (!isInitialized || !rendererRef.current) {
      console.log('[MapViewer] Skipping hero render - not initialized');
      return;
    }
    
    console.log('[MapViewer] Updating heroes:', heroPositions.length);
    rendererRef.current.renderHeroes(heroPositions);
    if (showPaths) {
      rendererRef.current.updatePathTraces(heroPositions);
    }
  }, [isInitialized, heroPositions, showPaths]);

  // Toggle path traces visibility
  useEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.togglePathTraces(showPaths);
  }, [isInitialized, showPaths]);

  // Update wards
  useEffect(() => {
    if (!isInitialized || !rendererRef.current) {
      console.log('[MapViewer] Skipping ward render - not initialized');
      return;
    }
    
    console.log('[MapViewer] Updating wards:', wards.length);
    rendererRef.current.renderWards(wards);
  }, [isInitialized, wards]);

  // Update kill markers
  useEffect(() => {
    if (!isInitialized || !rendererRef.current) {
      return;
    }
    rendererRef.current.updateKillMarkers(killMarkers, currentGameTime);
  }, [isInitialized, killMarkers, currentGameTime]);

  // Update heatmap overlay
  useEffect(() => {
    if (!isInitialized || !rendererRef.current) {
      return;
    }
    if (heatmapGrid && heatmapBounds) {
      rendererRef.current.renderHeatmap(heatmapGrid, heatmapBounds);
    } else {
      rendererRef.current.clearHeatmap();
    }
  }, [isInitialized, heatmapGrid, heatmapBounds]);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700 p-4 rounded">
        <p className="text-red-400">Failed to initialize map renderer:</p>
        <code className="text-sm text-gray-400">{error}</code>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="border border-gray-700 rounded overflow-hidden"
        style={{ width, height }}
      />
      {!isInitialized && (
        <div className="absolute inset-0 flex items-center justify-center bg-dota-bg/80">
          <p className="text-gray-400">Loading map...</p>
        </div>
      )}
    </div>
  );
}

export default MapViewer;
