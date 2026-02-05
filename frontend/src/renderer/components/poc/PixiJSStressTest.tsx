/**
 * POC Test: PixiJS Rendering Performance
 * Target: 60 FPS with 1000+ moving sprites
 */

import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';

interface Unit {
  id: number;
  sprite: PIXI.Graphics;
  vx: number;
  vy: number;
}

interface PerformanceStats {
  fps: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  frameCount: number;
  unitCount: number;
}

export function PixiJSStressTest() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const unitsRef = useRef<Unit[]>([]);
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 0,
    avgFps: 0,
    minFps: 999,
    maxFps: 0,
    frameCount: 0,
    unitCount: 0,
  });
  const [unitCount, setUnitCount] = useState(1000);
  const [isRunning, setIsRunning] = useState(false);

  const fpsHistory = useRef<number[]>([]);

  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    // Initialize PixiJS
    const app = new PIXI.Application();
    
    app.init({
      width: 800,
      height: 600,
      backgroundColor: 0x1a1a2e,
      antialias: false, // Disable for performance
      resolution: 1,
    }).then(() => {
      if (containerRef.current) {
        containerRef.current.appendChild(app.canvas);
        appRef.current = app;
      }
    });

    return () => {
      app.destroy(true);
      appRef.current = null;
    };
  }, []);

  const createUnits = (count: number) => {
    const app = appRef.current;
    if (!app) return;

    // Clear existing units
    unitsRef.current.forEach((unit) => {
      app.stage.removeChild(unit.sprite);
      unit.sprite.destroy();
    });
    unitsRef.current = [];
    fpsHistory.current = [];

    // Create new units
    const colors = [0x22c55e, 0xef4444, 0x3b82f6, 0xf59e0b, 0xa855f7];
    
    for (let i = 0; i < count; i++) {
      const sprite = new PIXI.Graphics();
      sprite.circle(0, 0, 4);
      sprite.fill(colors[i % colors.length]);
      
      sprite.x = Math.random() * 800;
      sprite.y = Math.random() * 600;

      app.stage.addChild(sprite);

      unitsRef.current.push({
        id: i,
        sprite,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
      });
    }

    setStats((prev) => ({ ...prev, unitCount: count, frameCount: 0, minFps: 999, maxFps: 0 }));
  };

  const startTest = () => {
    const app = appRef.current;
    if (!app) return;

    createUnits(unitCount);
    setIsRunning(true);

    let lastTime = performance.now();

    const ticker = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      const fps = 1000 / delta;
      fpsHistory.current.push(fps);

      // Keep last 60 frames for average
      if (fpsHistory.current.length > 60) {
        fpsHistory.current.shift();
      }

      const avgFps = fpsHistory.current.reduce((a, b) => a + b, 0) / fpsHistory.current.length;

      // Update units
      unitsRef.current.forEach((unit) => {
        unit.sprite.x += unit.vx;
        unit.sprite.y += unit.vy;

        // Bounce off walls
        if (unit.sprite.x < 0 || unit.sprite.x > 800) unit.vx *= -1;
        if (unit.sprite.y < 0 || unit.sprite.y > 600) unit.vy *= -1;

        // Keep in bounds
        unit.sprite.x = Math.max(0, Math.min(800, unit.sprite.x));
        unit.sprite.y = Math.max(0, Math.min(600, unit.sprite.y));
      });

      setStats((prev) => ({
        fps: Math.round(fps),
        avgFps: Math.round(avgFps),
        minFps: Math.min(prev.minFps, Math.round(fps)),
        maxFps: Math.max(prev.maxFps, Math.round(fps)),
        frameCount: prev.frameCount + 1,
        unitCount: prev.unitCount,
      }));
    };

    app.ticker.add(ticker);
  };

  const stopTest = () => {
    const app = appRef.current;
    if (!app) return;

    app.ticker.stop();
    setIsRunning(false);
  };

  const getVerdictColor = (fps: number) => {
    if (fps >= 60) return 'text-green-400';
    if (fps >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="p-4 bg-dota-surface rounded-lg">
      <h2 className="text-xl font-bold text-dota-gold mb-4">
        PixiJS Performance Test
      </h2>

      {/* Controls */}
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Units:</label>
          <input
            type="number"
            value={unitCount}
            onChange={(e) => setUnitCount(Number(e.target.value))}
            className="w-24 px-2 py-1 bg-dota-bg border border-gray-600 rounded text-white"
            min={100}
            max={10000}
            step={100}
            disabled={isRunning}
          />
        </div>
        <button
          onClick={isRunning ? stopTest : startTest}
          className={`px-4 py-1 rounded ${
            isRunning
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-green-600 hover:bg-green-700'
          } text-white`}
        >
          {isRunning ? 'Stop' : 'Start Test'}
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="border border-gray-700 rounded mb-4"
        style={{ width: 800, height: 600 }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-dota-bg p-3 rounded">
          <div className="text-sm text-gray-400">Current FPS</div>
          <div className={`text-2xl font-bold ${getVerdictColor(stats.fps)}`}>
            {stats.fps}
          </div>
        </div>
        <div className="bg-dota-bg p-3 rounded">
          <div className="text-sm text-gray-400">Average FPS</div>
          <div className={`text-2xl font-bold ${getVerdictColor(stats.avgFps)}`}>
            {stats.avgFps}
          </div>
        </div>
        <div className="bg-dota-bg p-3 rounded">
          <div className="text-sm text-gray-400">Min / Max FPS</div>
          <div className="text-2xl font-bold text-white">
            {stats.minFps === 999 ? '-' : stats.minFps} / {stats.maxFps || '-'}
          </div>
        </div>
        <div className="bg-dota-bg p-3 rounded">
          <div className="text-sm text-gray-400">Frame Count</div>
          <div className="text-2xl font-bold text-white">
            {stats.frameCount}
          </div>
        </div>
      </div>

      {/* Verdict */}
      {stats.frameCount > 60 && (
        <div className="mt-4 p-4 bg-dota-bg rounded">
          <h3 className="font-bold mb-2">Performance Verdict</h3>
          <div className={`text-lg ${getVerdictColor(stats.avgFps)}`}>
            {stats.avgFps >= 60
              ? `PASS - ${stats.unitCount} units at ${stats.avgFps} FPS (target: 60 FPS)`
              : stats.avgFps >= 30
              ? `WARNING - ${stats.unitCount} units at ${stats.avgFps} FPS (below 60 FPS target)`
              : `FAIL - ${stats.unitCount} units at ${stats.avgFps} FPS (below 30 FPS minimum)`}
          </div>
        </div>
      )}
    </div>
  );
}

export default PixiJSStressTest;
