/**
 * Map Test Page - Demonstrates Dota 2 Map Rendering
 */

import { useState } from 'react';
import MapViewer from '../components/map/MapViewer';
import { HeroPosition, Ward } from '../components/map/DotaMapRenderer';

// Sample hero positions for testing (approximate locations)
const SAMPLE_HERO_POSITIONS: HeroPosition[] = [
  // Radiant heroes
  { hero_id: 1, hero_name: 'Anti-Mage', team: 'radiant', x: -6000, y: -6000, hp: 620, mana: 280, level: 6 },
  { hero_id: 2, hero_name: 'Axe', team: 'radiant', x: -3000, y: -3500, hp: 800, mana: 200, level: 5 },
  { hero_id: 3, hero_name: 'Crystal Maiden', team: 'radiant', x: -4500, y: -5000, hp: 420, mana: 450, level: 4 },
  { hero_id: 4, hero_name: 'Drow Ranger', team: 'radiant', x: -6500, y: -5500, hp: 540, mana: 320, level: 5 },
  { hero_id: 5, hero_name: 'Earthshaker', team: 'radiant', x: -2000, y: 0, hp: 700, mana: 250, level: 6 },
  
  // Dire heroes
  { hero_id: 6, hero_name: 'Pudge', team: 'dire', x: 6000, y: 6000, hp: 900, mana: 300, level: 7 },
  { hero_id: 7, hero_name: 'Shadow Fiend', team: 'dire', x: 500, y: 500, hp: 480, mana: 380, level: 6 },
  { hero_id: 8, hero_name: 'Queen of Pain', team: 'dire', x: 3000, y: 2000, hp: 520, mana: 420, level: 5 },
  { hero_id: 9, hero_name: 'Lion', team: 'dire', x: 5000, y: 4500, hp: 450, mana: 500, level: 4 },
  { hero_id: 10, hero_name: 'Sniper', team: 'dire', x: 6500, y: 5500, hp: 500, mana: 280, level: 5 },
];

// Sample ward positions
const SAMPLE_WARDS: Ward[] = [
  { type: 'observer', team: 'radiant', x: -2000, y: 3000, placed: true },
  { type: 'observer', team: 'radiant', x: 1000, y: -1500, placed: true },
  { type: 'sentry', team: 'radiant', x: -3000, y: 0, placed: true },
  { type: 'observer', team: 'dire', x: 2000, y: -3000, placed: true },
  { type: 'observer', team: 'dire', x: -1000, y: 1500, placed: true },
  { type: 'sentry', team: 'dire', x: 3000, y: 0, placed: true },
];

export function MapTestPage() {
  const [showHeroes, setShowHeroes] = useState(true);
  const [showWards, setShowWards] = useState(true);

  return (
    <div className="min-h-screen bg-dota-bg p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-dota-gold mb-2">
          Dota 2 Map Renderer Test
        </h1>
        <p className="text-gray-400 mb-6">
          Testing PixiJS-based map rendering with hero positions and ward placements
        </p>

        {/* Controls */}
        <div className="bg-dota-surface p-4 rounded-lg mb-6">
          <h2 className="text-lg font-medium mb-3">Display Controls</h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showHeroes}
                onChange={(e) => setShowHeroes(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Show Heroes ({SAMPLE_HERO_POSITIONS.length})</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showWards}
                onChange={(e) => setShowWards(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Show Wards ({SAMPLE_WARDS.length})</span>
            </label>
          </div>
        </div>

        {/* Map Display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Canvas */}
          <div className="lg:col-span-2">
            <div className="bg-dota-surface p-4 rounded-lg">
              <h2 className="text-lg font-medium mb-3">Map View</h2>
              <MapViewer
                width={800}
                height={800}
                heroPositions={showHeroes ? SAMPLE_HERO_POSITIONS : []}
                wards={showWards ? SAMPLE_WARDS : []}
              />
            </div>
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            {/* Hero List */}
            <div className="bg-dota-surface p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-3">Heroes</h3>
              <div className="space-y-2">
                <div>
                  <h4 className="text-sm font-medium text-radiant-500 mb-1">Radiant (5)</h4>
                  <ul className="text-sm text-gray-400 space-y-1">
                    {SAMPLE_HERO_POSITIONS.filter(h => h.team === 'radiant').map(h => (
                      <li key={h.hero_id} className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-radiant-500 rounded-full"></span>
                        {h.hero_name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2">
                  <h4 className="text-sm font-medium text-dire-500 mb-1">Dire (5)</h4>
                  <ul className="text-sm text-gray-400 space-y-1">
                    {SAMPLE_HERO_POSITIONS.filter(h => h.team === 'dire').map(h => (
                      <li key={h.hero_id} className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-dire-500 rounded-full"></span>
                        {h.hero_name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Ward Legend */}
            <div className="bg-dota-surface p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-3">Ward Legend</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-radiant-500"></div>
                  <span>Observer Ward (Radiant)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-radiant-500"></div>
                  <span>Sentry Ward (Radiant)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-dire-500"></div>
                  <span>Observer Ward (Dire)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-dire-500"></div>
                  <span>Sentry Ward (Dire)</span>
                </div>
              </div>
            </div>

            {/* Map Info */}
            <div className="bg-dota-surface p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-3">Map Info</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <p>Size: 800x800 px</p>
                <p>Game bounds: ±7500 units</p>
                <p>Coordinate system: Center origin</p>
                <p>Renderer: PixiJS v8</p>
              </div>
            </div>
          </div>
        </div>

        {/* Implementation Status */}
        <div className="bg-dota-primary/20 border border-dota-primary p-4 rounded mt-6">
          <h3 className="font-medium mb-2">Implementation Status</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Core map renderer with coordinate system conversion
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Hero position rendering (10 heroes)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Ward placement visualization
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
              Grid fallback (minimap image optional)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
              Real replay data integration (next step)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MapTestPage;
