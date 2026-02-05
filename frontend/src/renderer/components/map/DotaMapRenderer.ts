/**
 * Dota 2 Map Renderer using PixiJS
 * 
 * Handles:
 * - Map rendering with Dota 2 minimap texture
 * - Coordinate system conversion (game coords -> screen coords)
 * - Hero position rendering with smooth interpolation
 * - Ward placement visualization
 */

import * as PIXI from 'pixi.js';

/**
 * Dota 2 game world coordinates
 * Map bounds: Based on actual replay data analysis
 * 
 * 实测数据范围:
 * - X: 7974 ~ 24992
 * - Y: 7844 ~ 24852
 * 
 * 为了安全，设置稍大的边界以容纳所有可能位置
 */
export const DOTA_MAP_BOUNDS = {
  minX: 7500,
  maxX: 25500,
  minY: 7500,
  maxY: 25500,
  width: 18000,  // 25500 - 7500
  height: 18000, // 25500 - 7500
};

/**
 * Position data structure from backend
 */
export interface HeroPosition {
  hero_id: number;
  hero_name: string;
  team: 'radiant' | 'dire';
  x: number;
  y: number;
  hp: number;
  mana: number;
  level: number;
}

/**
 * Ward placement data
 */
export interface Ward {
  type: 'observer' | 'sentry';
  team: 'radiant' | 'dire';
  x: number;
  y: number;
  placed: boolean;
}

/**
 * Renderer configuration
 */
export interface RendererConfig {
  width: number;
  height: number;
  mapImageUrl?: string;
  backgroundColor?: number;
}

/**
 * 内部英雄状态，用于平滑动画
 */
interface HeroState {
  graphic: PIXI.Graphics;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  team: 'radiant' | 'dire';
  heroName: string;
}

/**
 * Main Dota Map Renderer Class
 */
export class DotaMapRenderer {
  private app!: PIXI.Application;
  private mapContainer!: PIXI.Container;
  private heroesContainer!: PIXI.Container;
  private wardsContainer!: PIXI.Container;
  
  private mapSprite?: PIXI.Sprite;
  private heroStates: Map<number, HeroState> = new Map();
  
  private config: Required<RendererConfig>;
  private initialized = false;
  
  // 动画插值参数
  private readonly LERP_SPEED = 0.15; // 插值速度，越大越快

  constructor(config: RendererConfig) {
    this.config = {
      backgroundColor: 0x1a1a2e,
      mapImageUrl: '',
      ...config,
    };
  }

  /**
   * Initialize the renderer and mount to DOM
   */
  async init(container: HTMLElement): Promise<void> {
    console.log('[DotaMapRenderer] Initializing...');
    
    this.app = new PIXI.Application();
    
    await this.app.init({
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      autoStart: true,
    });

    container.appendChild(this.app.canvas);

    this.mapContainer = new PIXI.Container();
    this.wardsContainer = new PIXI.Container();
    this.heroesContainer = new PIXI.Container();
    
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.wardsContainer);
    this.app.stage.addChild(this.heroesContainer);

    if (this.config.mapImageUrl) {
      await this.loadMapBackground(this.config.mapImageUrl);
    } else {
      this.drawGrid();
    }
    
    // 添加动画循环
    this.app.ticker.add(this.animate.bind(this));
    
    this.initialized = true;
    console.log('[DotaMapRenderer] Initialization complete');
  }

  /**
   * 动画循环 - 平滑插值英雄位置
   */
  private animate(): void {
    for (const [, state] of this.heroStates) {
      // 线性插值到目标位置
      const dx = state.targetX - state.currentX;
      const dy = state.targetY - state.currentY;
      
      // 如果距离很小，直接跳到目标位置
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        state.currentX = state.targetX;
        state.currentY = state.targetY;
      } else {
        state.currentX += dx * this.LERP_SPEED;
        state.currentY += dy * this.LERP_SPEED;
      }
      
      // 更新图形位置
      state.graphic.x = state.currentX;
      state.graphic.y = state.currentY;
    }
  }

  /**
   * Load and display Dota 2 minimap background
   */
  private async loadMapBackground(url: string): Promise<void> {
    try {
      const texture = await PIXI.Assets.load(url);
      this.mapSprite = new PIXI.Sprite(texture);
      this.mapSprite.width = this.config.width;
      this.mapSprite.height = this.config.height;
      this.mapContainer.addChild(this.mapSprite);
    } catch (error) {
      console.error('Failed to load map image:', error);
      this.drawGrid();
    }
  }

  /**
   * Draw a grid as fallback
   */
  private drawGrid(): void {
    const background = new PIXI.Graphics();
    background.rect(0, 0, this.config.width, this.config.height);
    background.fill({ color: 0x0d1a0d });
    this.mapContainer.addChild(background);
    
    const gridSize = this.config.width / 10;
    const gridLines = new PIXI.Graphics();
    
    for (let x = 0; x <= this.config.width; x += gridSize) {
      gridLines.moveTo(x, 0);
      gridLines.lineTo(x, this.config.height);
    }
    for (let y = 0; y <= this.config.height; y += gridSize) {
      gridLines.moveTo(0, y);
      gridLines.lineTo(this.config.width, y);
    }
    gridLines.stroke({ width: 1, color: 0x1a3a1a });
    this.mapContainer.addChild(gridLines);
    
    const river = new PIXI.Graphics();
    river.moveTo(0, this.config.height);
    river.lineTo(this.config.width, 0);
    river.stroke({ width: 3, color: 0x2a4a5a });
    this.mapContainer.addChild(river);
    
    // Radiant base
    const radiantPos = this.gameToScreen(9500, 10000);
    const radiantBase = new PIXI.Graphics();
    radiantBase.circle(radiantPos.x, radiantPos.y, 35);
    radiantBase.fill({ color: 0x22c55e, alpha: 0.2 });
    radiantBase.stroke({ width: 2, color: 0x22c55e });
    this.mapContainer.addChild(radiantBase);
    
    // Dire base
    const direPos = this.gameToScreen(23200, 22700);
    const direBase = new PIXI.Graphics();
    direBase.circle(direPos.x, direPos.y, 35);
    direBase.fill({ color: 0xef4444, alpha: 0.2 });
    direBase.stroke({ width: 2, color: 0xef4444 });
    this.mapContainer.addChild(direBase);
  }

  /**
   * Convert game world coordinates to screen coordinates
   */
  gameToScreen(gameX: number, gameY: number): { x: number; y: number } {
    const screenX = ((gameX - DOTA_MAP_BOUNDS.minX) / DOTA_MAP_BOUNDS.width) * this.config.width;
    const screenY = ((DOTA_MAP_BOUNDS.maxY - gameY) / DOTA_MAP_BOUNDS.height) * this.config.height;
    return { x: screenX, y: screenY };
  }

  /**
   * 创建英雄图形
   */
  private createHeroGraphic(team: 'radiant' | 'dire'): PIXI.Graphics {
    const color = team === 'radiant' ? 0x22c55e : 0xef4444;
    const heroRadius = 18;
    
    const heroGraphic = new PIXI.Graphics();
    
    // 外圈（队伍颜色）
    heroGraphic.circle(0, 0, heroRadius);
    heroGraphic.fill({ color: color });
    
    // 白色边框
    heroGraphic.circle(0, 0, heroRadius);
    heroGraphic.stroke({ color: 0xffffff, width: 2 });
    
    // 内部白点
    heroGraphic.circle(0, 0, 5);
    heroGraphic.fill({ color: 0xffffff });
    
    return heroGraphic;
  }

  /**
   * Render hero positions with smooth animation
   */
  renderHeroes(positions: HeroPosition[]): void {
    if (!this.initialized || !this.app?.stage) {
      return;
    }
    
    const currentHeroIds = new Set(positions.map(p => p.hero_id));
    
    // 移除不再存在的英雄
    for (const [heroId, state] of this.heroStates) {
      if (!currentHeroIds.has(heroId)) {
        this.heroesContainer.removeChild(state.graphic);
        state.graphic.destroy();
        this.heroStates.delete(heroId);
      }
    }
    
    // 更新或创建英雄
    for (const pos of positions) {
      const screenPos = this.gameToScreen(pos.x, pos.y);
      
      let state = this.heroStates.get(pos.hero_id);
      
      if (!state) {
        // 创建新英雄
        const graphic = this.createHeroGraphic(pos.team);
        graphic.x = screenPos.x;
        graphic.y = screenPos.y;
        this.heroesContainer.addChild(graphic);
        
        state = {
          graphic,
          currentX: screenPos.x,
          currentY: screenPos.y,
          targetX: screenPos.x,
          targetY: screenPos.y,
          team: pos.team,
          heroName: pos.hero_name,
        };
        this.heroStates.set(pos.hero_id, state);
      } else {
        // 更新目标位置（动画会平滑过渡）
        state.targetX = screenPos.x;
        state.targetY = screenPos.y;
      }
    }
  }

  /**
   * Render ward placements
   */
  renderWards(wards: Ward[]): void {
    if (!this.initialized || !this.app?.stage) {
      return;
    }
    
    this.wardsContainer.removeChildren();

    for (const ward of wards) {
      const screenPos = this.gameToScreen(ward.x, ward.y);
      const wardGraphic = new PIXI.Graphics();
      
      const teamColor = ward.team === 'radiant' ? 0x22c55e : 0xef4444;
      const innerColor = ward.type === 'observer' ? 0xffff00 : 0x4488ff;
      
      if (ward.type === 'observer') {
        wardGraphic.circle(0, 0, 14);
        wardGraphic.fill({ color: teamColor });
        wardGraphic.circle(0, 0, 14);
        wardGraphic.stroke({ color: 0xffffff, width: 2 });
        wardGraphic.circle(0, 0, 7);
        wardGraphic.fill({ color: innerColor });
      } else {
        wardGraphic.moveTo(0, -12);
        wardGraphic.lineTo(12, 0);
        wardGraphic.lineTo(0, 12);
        wardGraphic.lineTo(-12, 0);
        wardGraphic.closePath();
        wardGraphic.fill({ color: teamColor });
        wardGraphic.stroke({ color: 0xffffff, width: 2 });
        
        wardGraphic.moveTo(0, -6);
        wardGraphic.lineTo(6, 0);
        wardGraphic.lineTo(0, 6);
        wardGraphic.lineTo(-6, 0);
        wardGraphic.closePath();
        wardGraphic.fill({ color: innerColor });
      }
      
      wardGraphic.x = screenPos.x;
      wardGraphic.y = screenPos.y;
      wardGraphic.alpha = ward.placed ? 1.0 : 0.5;
      
      this.wardsContainer.addChild(wardGraphic);
    }
  }

  /**
   * Clear all rendered objects
   */
  clear(): void {
    if (this.heroesContainer) {
      this.heroesContainer.removeChildren();
    }
    if (this.wardsContainer) {
      this.wardsContainer.removeChildren();
    }
    this.heroStates.clear();
  }

  /**
   * Destroy the renderer and cleanup
   */
  destroy(): void {
    this.initialized = false;
    this.clear();
    if (this.app) {
      this.app.ticker.stop();
      this.app.destroy(true, { children: true, texture: true });
    }
  }

  /**
   * Get the PixiJS app instance
   */
  getApp(): PIXI.Application {
    return this.app;
  }
}

export default DotaMapRenderer;
