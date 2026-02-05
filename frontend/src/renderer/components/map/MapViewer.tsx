/**
 * MapViewer Component
 * React wrapper for DotaMapRenderer
 */

import { useEffect, useRef, useState } from 'react';
import DotaMapRenderer, { HeroPosition, Ward } from './DotaMapRenderer';

export interface MapViewerProps {
  width?: number;
  height?: number;
  mapImageUrl?: string;
  heroPositions?: HeroPosition[];
  wards?: Ward[];
}

export function MapViewer({
  width = 800,
  height = 800,
  mapImageUrl,
  heroPositions = [],
  wards = [],
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
      mapImageUrl,
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
  }, [width, height, mapImageUrl]);

  // Update hero positions
  useEffect(() => {
    if (!isInitialized || !rendererRef.current) {
      console.log('[MapViewer] Skipping hero render - not initialized');
      return;
    }
    
    console.log('[MapViewer] Updating heroes:', heroPositions.length);
    rendererRef.current.renderHeroes(heroPositions);
  }, [isInitialized, heroPositions]);

  // Update wards
  useEffect(() => {
    if (!isInitialized || !rendererRef.current) {
      console.log('[MapViewer] Skipping ward render - not initialized');
      return;
    }
    
    console.log('[MapViewer] Updating wards:', wards.length);
    rendererRef.current.renderWards(wards);
  }, [isInitialized, wards]);

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
