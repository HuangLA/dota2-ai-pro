/**
 * Map Test Page - Demonstrates Dota 2 Map Rendering
 */

import { useState } from 'react';
import MapViewer from '../components/map/MapViewer';
import { HeroPosition, Ward } from '../components/map/DotaMapRenderer';

// Sample hero positions for testing (approximate locations)
const SAMPLE_HERO_POSITIONS: HeroPosition[] = [
  // Radiant heroes
  { hero_id: 1, hero_name: '敌法师', team: 'radiant', x: -6000, y: -6000, hp: 620, mana: 280, level: 6 },
  { hero_id: 2, hero_name: '斧王', team: 'radiant', x: -3000, y: -3500, hp: 800, mana: 200, level: 5 },
  { hero_id: 3, hero_name: '水晶室女', team: 'radiant', x: -4500, y: -5000, hp: 420, mana: 450, level: 4 },
  { hero_id: 4, hero_name: '卓尔游侠', team: 'radiant', x: -6500, y: -5500, hp: 540, mana: 320, level: 5 },
  { hero_id: 5, hero_name: '撼地者', team: 'radiant', x: -2000, y: 0, hp: 700, mana: 250, level: 6 },

  // Dire heroes
  { hero_id: 6, hero_name: '帕吉', team: 'dire', x: 6000, y: 6000, hp: 900, mana: 300, level: 7 },
  { hero_id: 7, hero_name: '影魔', team: 'dire', x: 500, y: 500, hp: 480, mana: 380, level: 6 },
  { hero_id: 8, hero_name: '痛苦女王', team: 'dire', x: 3000, y: 2000, hp: 520, mana: 420, level: 5 },
  { hero_id: 9, hero_name: '恶魔巫师', team: 'dire', x: 5000, y: 4500, hp: 450, mana: 500, level: 4 },
  { hero_id: 10, hero_name: '狙击手', team: 'dire', x: 6500, y: 5500, hp: 500, mana: 280, level: 5 },
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
    <div className="workspace-page bg-dota-bg">
      <div className="workspace-stack max-w-[1280px]">
        <div className="workspace-header">
          <div className="workspace-header-row">
            <div>
              <p className="workspace-eyebrow text-cyan-300/80">Map Renderer</p>
              <h1 className="workspace-title text-dota-gold">Dota 2 地图渲染测试</h1>
              <p className="workspace-description">校验小地图、英雄点位和眼位图层。</p>
            </div>
            <div className="workspace-pill-row xl:mt-0">
              <span className="workspace-pill">PixiJS v8</span>
              <span className="workspace-pill">坐标映射</span>
              <span className="workspace-pill">图层校准</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="workspace-panel">
          <h2 className="text-lg font-medium mb-3">显示控制</h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showHeroes}
                onChange={(e) => setShowHeroes(e.target.checked)}
                className="w-4 h-4"
              />
              <span>显示英雄 ({SAMPLE_HERO_POSITIONS.length})</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showWards}
                onChange={(e) => setShowWards(e.target.checked)}
                className="w-4 h-4"
              />
              <span>显示眼位 ({SAMPLE_WARDS.length})</span>
            </label>
          </div>
        </div>

        {/* Map Display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Canvas */}
          <div className="lg:col-span-2">
            <div className="workspace-panel">
              <h2 className="text-lg font-medium mb-3">地图视图</h2>
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
            <div className="workspace-panel">
              <h3 className="text-lg font-medium mb-3">英雄列表</h3>
              <div className="space-y-2">
                <div>
                  <h4 className="text-sm font-medium text-radiant-500 mb-1">天辉 (5)</h4>
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
                  <h4 className="text-sm font-medium text-dire-500 mb-1">夜魇 (5)</h4>
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
            <div className="workspace-panel">
              <h3 className="text-lg font-medium mb-3">眼位图例</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-radiant-500"></div>
                  <span>假眼 (天辉)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-radiant-500"></div>
                  <span>真眼 (天辉)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-dire-500"></div>
                  <span>假眼 (夜魇)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-dire-500"></div>
                  <span>真眼 (夜魇)</span>
                </div>
              </div>
            </div>

            {/* Map Info */}
            <div className="workspace-panel">
              <h3 className="text-lg font-medium mb-3">地图信息</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <p>尺寸: 800x800 像素</p>
                <p>游戏范围: ±7500 单位</p>
                <p>坐标系: 中心原点</p>
                <p>渲染器: PixiJS v8</p>
              </div>
            </div>
          </div>
        </div>

        {/* Implementation Status */}
        <div className="bg-dota-primary/20 border border-dota-primary p-4 rounded mt-6">
          <h3 className="font-medium mb-2">实现状态</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              核心地图渲染器与坐标系转换
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              英雄位置渲染 (10 个英雄)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              眼位可视化
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
              网格回退 (小地图图片可选)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
              真实录像数据集成 (下一步)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MapTestPage;
