/**
 * Dota 2 Map Renderer using PixiJS
 * 
 * Handles:
 * - Map rendering with Dota 2 minimap texture
 * - Coordinate system conversion (game coords -> screen coords)
 * - Hero position rendering with icons and smooth interpolation
 * - Ward placement visualization
 */

import * as PIXI from 'pixi.js';
import { HEROES, getHeroById } from '@/data/heroes';
import {
  MAP_ELEMENTS,
  MapElement,
} from '@/data/mapElements';
import {
  createMapCoordinateMapper,
  DOTA_MAP_BOUNDS,
  MINIMAP_CONTENT_BOUNDS,
  type MapCoordinateMapper,
} from './mapCoordinateMapper';
import {
  OBJECTIVE_ICON_SPECS,
  resolveObjectiveIconKey,
  type ObjectiveIconKey,
} from './objectiveIconCatalog';

export { DOTA_MAP_BOUNDS } from './mapCoordinateMapper';

export const MINIMAP_IMAGE_CONFIG = {
  contentLeft: MINIMAP_CONTENT_BOUNDS.left,
  contentRight: MINIMAP_CONTENT_BOUNDS.right,
  contentTop: MINIMAP_CONTENT_BOUNDS.top,
  contentBottom: MINIMAP_CONTENT_BOUNDS.bottom,
  contentWidthRatio: MINIMAP_CONTENT_BOUNDS.right - MINIMAP_CONTENT_BOUNDS.left,
  contentHeightRatio: MINIMAP_CONTENT_BOUNDS.bottom - MINIMAP_CONTENT_BOUNDS.top,
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
  instanceKey?: string;
  type: 'observer' | 'sentry';
  team: 'radiant' | 'dire';
  x: number;
  y: number;
  placed: boolean;
  handle?: number;
  placedSourceTime?: number;
  placedGameTime?: number;
  removalSourceTime?: number;
  removalGameTime?: number;
  removalKind?: 'destroyed' | 'expired';
  destroyerName?: string;
  destroyerKind?: 'hero' | 'hero_summon' | 'lane_creep' | 'neutral_creep' | 'unit';
  destroyerTeam?: number;
  destroyerLabel?: string;
  lifetimeSeconds?: number;
  activeAtCurrentTime?: boolean;
}

export interface WardInteractionPayload {
  wards: Ward[];
  localX: number;
  localY: number;
}

/**
 * Kill event marker data for minimap display
 */
export interface KillMarkerData {
  time: number;         // game_time of kill (seconds)
  victim: string;       // hero name
  x: number;            // world x coordinate
  y: number;            // world y coordinate
  victimTeam: number;   // 2=Radiant, 3=Dire
}

/**
 * Heatmap bounds from backend visualization API
 */
export interface HeatmapBounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

export interface PathOverlayPoint {
  x: number;
  y: number;
}

export interface PathOverlay {
  hero_name: string;
  team: 'radiant' | 'dire';
  points: PathOverlayPoint[];
}

export interface ObjectiveMarker {
  id: string;
  type: MapElement['type'];
  team: MapElement['team'];
  x: number;
  y: number;
  name: string;
  nameZh: string;
  state: 'alive' | 'destroyed' | 'respawning' | 'inactive' | 'uncertain';
  detailLabel?: string;
}

/**
 * Renderer configuration
 */
export interface RendererConfig {
  width: number;
  height: number;
  mapImageUrl?: string;
  backgroundColor?: number;
  /** 小地图遮罩透明度（0-1，值越大地图越暗） */
  mapDimOpacity?: number;
  /** 是否使用英雄图标（否则使用圆形图形） */
  useHeroIcons?: boolean;
  /** 英雄图标大小 */
  heroIconSize?: number;
  /** 眼位图标大小 */
  wardIconSize?: number;
  /** 是否显示调试校准标记 */
  showCalibrationMarkers?: boolean;
}

/**
 * 内部英雄状态，用于平滑动画
 */
interface HeroState {
  container: PIXI.Container;
  sprite?: PIXI.Sprite;
  graphic?: PIXI.Graphics;
  teamIndicator: PIXI.Graphics;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  team: 'radiant' | 'dire';
  heroId: number;
  heroName: string;
  usingIcon: boolean;
}

interface ObjectiveTextureAsset {
  texture: PIXI.Texture;
  anchorX: number;
  anchorY: number;
  sizeRatio: number;
}

const BUILDING_TEAM_TINT: Record<'radiant' | 'dire' | 'neutral', number> = {
  radiant: 0x22c55e,
  dire: 0xef4444,
  neutral: 0xffd700,
};

const BUILDING_DESTROYED_TINT: Record<'radiant' | 'dire' | 'neutral', number> = {
  radiant: 0x3f7f58,
  dire: 0x9f3f49,
  neutral: 0x78716c,
};

/**
 * Main Dota Map Renderer Class
 */
export class DotaMapRenderer {
  private app!: PIXI.Application;
  private mapContainer!: PIXI.Container;
  private buildingsContainer!: PIXI.Container;  // 目标物层
  private wardsContainer!: PIXI.Container;
  private killsContainer!: PIXI.Container;   // 击杀标记层
  private pathsContainer!: PIXI.Container;   // 英雄移动轨迹层
  private heatmapContainer!: PIXI.Container;
  private heroesContainer!: PIXI.Container;
  
  private mapSprite?: PIXI.Sprite;
  private heroStates: Map<number, HeroState> = new Map();
  private showPaths: boolean = false;
  private pathHistory: Map<string, Array<{x: number, y: number}>> = new Map();
  private readonly animateTick = () => this.animate();
  /** 按英雄 ID 索引的纹理缓存 */
  private heroTexturesById: Map<number, PIXI.Texture> = new Map();
  /** 按英雄名称索引的纹理缓存 (用于后端返回英雄名而非 ID 的情况) */
  private heroTexturesByName: Map<string, PIXI.Texture> = new Map();
  /** 眼位 SVG 纹理缓存 (按类型 + 阵营) */
  private wardTextures: Record<Ward['type'], Record<Ward['team'], PIXI.Texture | undefined>> = {
    observer: { radiant: undefined, dire: undefined },
    sentry: { radiant: undefined, dire: undefined },
  };
  private objectiveTextures: Map<ObjectiveIconKey, ObjectiveTextureAsset> = new Map();
  private coordinateMapper: MapCoordinateMapper;
  private currentWards: Ward[] = [];
  private selectedWardKeys: Set<string> = new Set();
  private onWardSelectionChange?: (wards: Ward[]) => void;
  private onWardHoverChange?: (payload: WardInteractionPayload | null) => void;
  private onWardClick?: (payload: WardInteractionPayload | null) => void;
  private hoveredWardSignature = '';
  
  private config: Required<RendererConfig>;
  private initialized = false;
  private texturesLoaded = false;
  
  // 动画插值参数
  private readonly LERP_SPEED = 0.15; // 插值速度，越大越快
  private readonly WARD_SELECTION_RADIUS_PX = 18;
  private readonly handleWardPointerTap = (event: PIXI.FederatedPointerEvent) => {
    if (!this.onWardClick) {
      return;
    }

    const localPos = event.getLocalPosition(this.app.stage);
    const wards = this.getWardsAtLocalPosition(localPos.x, localPos.y);
    this.onWardClick({
      wards,
      localX: localPos.x,
      localY: localPos.y,
    });
  };
  private readonly handleWardPointerMove = (event: PIXI.FederatedPointerEvent) => {
    if (!this.onWardSelectionChange && !this.onWardHoverChange) {
      return;
    }

    const localPos = event.getLocalPosition(this.app.stage);
    const selectedWards = this.getWardsAtLocalPosition(localPos.x, localPos.y);
    this.emitWardSelection(selectedWards);
    this.onWardHoverChange?.({
      wards: selectedWards,
      localX: localPos.x,
      localY: localPos.y,
    });
  };
  private readonly handleWardPointerLeave = () => {
    this.emitWardSelection([]);
    this.onWardHoverChange?.(null);
  };

  constructor(config: RendererConfig) {
    this.config = {
      backgroundColor: 0x1a1a2e,
      mapImageUrl: '/assets/dota/minimap/minimap.png',
      mapDimOpacity: 0.32,
      useHeroIcons: true,
      heroIconSize: 32,
      wardIconSize: 26,
      showCalibrationMarkers: false,
      ...config,
    };

    this.coordinateMapper = createMapCoordinateMapper({
      viewportWidth: this.config.width,
      viewportHeight: this.config.height,
      worldBounds: DOTA_MAP_BOUNDS,
      minimapContentBounds: MINIMAP_CONTENT_BOUNDS,
    });
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
      preference: 'webgl',
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      autoStart: true,
    });

    container.appendChild(this.app.canvas);

    this.mapContainer = new PIXI.Container();
    this.heatmapContainer = new PIXI.Container();
    this.buildingsContainer = new PIXI.Container();
    this.wardsContainer = new PIXI.Container();
    this.killsContainer = new PIXI.Container();
    this.pathsContainer = new PIXI.Container();
    this.heroesContainer = new PIXI.Container();
    
    // 图层顺序: 地图背景 -> 热力图 -> 建筑 -> 眼位 -> 路径轨迹 -> 击杀标记 -> 英雄
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.heatmapContainer);
    this.app.stage.addChild(this.buildingsContainer);
    this.app.stage.addChild(this.wardsContainer);
    this.app.stage.addChild(this.pathsContainer);
    this.app.stage.addChild(this.killsContainer);
    this.app.stage.addChild(this.heroesContainer);
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointermove', this.handleWardPointerMove);
    this.app.stage.on('pointertap', this.handleWardPointerTap);
    this.app.canvas.addEventListener('pointerleave', this.handleWardPointerLeave);

    if (this.config.mapImageUrl) {
      await this.loadMapBackground(this.config.mapImageUrl);
    } else {
      this.drawGrid();
    }

    await this.preloadObjectiveTextures();

    this.drawMapDimOverlay();
    
    // 预加载英雄图标
    if (this.config.useHeroIcons) {
      await this.preloadHeroTextures();
    }
    
    // 预加载眼位图标
    await this.preloadWardTextures();
    
    // 注意: 静态地图元素（建筑、Roshan等）暂时禁用
    // 这些元素应该从录像数据动态获取，而不是使用静态配置
    // TODO: 扩展解析器追踪建筑和 Roshan 状态后启用动态渲染
    // this.drawMapElements();
    
    // 绘制校准标记（用于调试坐标对齐）
    if (this.config.showCalibrationMarkers) {
      this.drawCalibrationMarkers();
    }
    
    // 添加动画循环
    this.app.ticker.add(this.animateTick);
    
    this.initialized = true;
    console.log('[DotaMapRenderer] Initialization complete');
  }

  /**
   * 绘制校准标记
   * 用于验证游戏坐标与 minimap 图片是否正确对齐
   * 
   * 天辉和夜魇泉水标记可拖拽！拖拽后会在控制台输出当前坐标。
   * 
   * 已知的地标位置 (cell-based 坐标):
   * - Radiant 泉水: ~(9484, 9884)
   * - Dire 泉水: ~(23484, 22784)
   * - 地图中心: (16384, 16384)
   * - Roshan (7.40): ~(16384+2816, 16384+3584) = (19200, 19968) - Dire 侧
   * - 中路河道: ~(16384, 16384)
   * - 天辉高地: ~(12000, 12000)
   * - 夜魇高地: ~(20000, 20000)
   */
  private drawCalibrationMarkers(): void {
    console.log('[DotaMapRenderer] Drawing calibration markers (DRAGGABLE)...');
    console.log('[DotaMapRenderer] 🎯 提示: 拖拽天辉(绿)或夜魇(红)标记到正确位置，然后查看控制台输出的坐标！');
    
    const calibrationContainer = new PIXI.Container();
    this.mapContainer.addChild(calibrationContainer);
    
    // 可拖拽标记 (泉水位置 + 地图中心)
    // 坐标基于录像数据中英雄的开局位置
    const draggableMarkers = [
      { name: 'Radiant Fountain', x: 9550, y: 9950, color: 0x00ff00, size: 25 },
      { name: 'Dire Fountain', x: 23450, y: 22750, color: 0xff0000, size: 25 },
      // 地图中心 (Source 2 引擎理论值)
      { name: 'Map Center', x: 16384, y: 16384, color: 0xffff00, size: 20 },
    ];
    
    // 静态参考标记 (边界角落)
    const staticMarkers = [
      // 边界角落 (用于检验边框校准)
      { name: 'Min Corner', x: DOTA_MAP_BOUNDS.minX, y: DOTA_MAP_BOUNDS.minY, color: 0x0000ff, size: 10 },
      { name: 'Max Corner', x: DOTA_MAP_BOUNDS.maxX, y: DOTA_MAP_BOUNDS.maxY, color: 0x0000ff, size: 10 },
    ];
    
    // 绘制静态标记
    for (const landmark of staticMarkers) {
      const screenPos = this.gameToScreen(landmark.x, landmark.y);
      
      const marker = new PIXI.Graphics();
      marker.moveTo(screenPos.x - landmark.size, screenPos.y);
      marker.lineTo(screenPos.x + landmark.size, screenPos.y);
      marker.moveTo(screenPos.x, screenPos.y - landmark.size);
      marker.lineTo(screenPos.x, screenPos.y + landmark.size);
      marker.stroke({ width: 2, color: landmark.color });
      marker.circle(screenPos.x, screenPos.y, landmark.size / 2);
      marker.stroke({ width: 2, color: landmark.color });
      
      calibrationContainer.addChild(marker);
      
      const label = new PIXI.Text({
        text: landmark.name,
        style: {
          fontSize: 10,
          fill: landmark.color,
          stroke: { color: 0x000000, width: 2 },
        },
      });
      label.x = screenPos.x + landmark.size + 2;
      label.y = screenPos.y - 5;
      calibrationContainer.addChild(label);
    }
    
    // 绘制可拖拽标记
    for (const landmark of draggableMarkers) {
      this.createDraggableMarker(calibrationContainer, landmark);
    }
  }
  
  /**
   * 创建可拖拽的校准标记
   */
  private createDraggableMarker(
    parent: PIXI.Container,
    landmark: { name: string; x: number; y: number; color: number; size: number }
  ): void {
    const screenPos = this.gameToScreen(landmark.x, landmark.y);
    
    // 创建容器 (用于整体拖拽)
    const markerContainer = new PIXI.Container();
    markerContainer.x = screenPos.x;
    markerContainer.y = screenPos.y;
    markerContainer.eventMode = 'static';
    markerContainer.cursor = 'grab';
    
    // 创建可拖拽区域 (较大的透明圆形)
    const hitArea = new PIXI.Graphics();
    hitArea.circle(0, 0, landmark.size + 10);
    hitArea.fill({ color: 0xffffff, alpha: 0.01 }); // 几乎透明
    markerContainer.addChild(hitArea);
    
    // 创建十字准星
    const crosshair = new PIXI.Graphics();
    crosshair.moveTo(-landmark.size, 0);
    crosshair.lineTo(landmark.size, 0);
    crosshair.moveTo(0, -landmark.size);
    crosshair.lineTo(0, landmark.size);
    crosshair.stroke({ width: 3, color: landmark.color });
    
    // 圆圈
    crosshair.circle(0, 0, landmark.size / 2);
    crosshair.stroke({ width: 3, color: landmark.color });
    crosshair.circle(0, 0, 5);
    crosshair.fill({ color: landmark.color });
    
    markerContainer.addChild(crosshair);
    
    // 标签
    const label = new PIXI.Text({
      text: `${landmark.name}\n(拖拽我!)`,
      style: {
        fontSize: 11,
        fill: landmark.color,
        stroke: { color: 0x000000, width: 3 },
        align: 'left',
      },
    });
    label.x = landmark.size + 5;
    label.y = -15;
    markerContainer.addChild(label);
    
    // 拖拽状态
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };
    
    // 拖拽开始
    markerContainer.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
      dragging = true;
      markerContainer.cursor = 'grabbing';
      const localPos = event.getLocalPosition(parent);
      dragOffset.x = markerContainer.x - localPos.x;
      dragOffset.y = markerContainer.y - localPos.y;
      markerContainer.alpha = 0.8;
    });
    
    // 拖拽移动
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointermove', (event: PIXI.FederatedPointerEvent) => {
      if (!dragging) return;
      const localPos = event.getLocalPosition(parent);
      markerContainer.x = localPos.x + dragOffset.x;
      markerContainer.y = localPos.y + dragOffset.y;
    });
    
    // 拖拽结束
    const onDragEnd = () => {
      if (!dragging) return;
      dragging = false;
      markerContainer.cursor = 'grab';
      markerContainer.alpha = 1;
      
      // 计算当前游戏坐标
      const gamePos = this.screenToGame(markerContainer.x, markerContainer.y);
      
      // 输出到控制台
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`🎯 校准标记移动: ${landmark.name}`);
      console.log(`   屏幕坐标: (${markerContainer.x.toFixed(0)}, ${markerContainer.y.toFixed(0)})`);
      console.log(`   游戏坐标: (${gamePos.x}, ${gamePos.y})`);
      console.log('');
      console.log(`   原始坐标: (${landmark.x}, ${landmark.y})`);
      console.log(`   坐标差值: (${gamePos.x - landmark.x}, ${gamePos.y - landmark.y})`);
      console.log('');
      
      // 如果是泉水标记，输出建议的边界调整
      if (landmark.name === 'Radiant Fountain') {
        console.log('   💡 如果天辉标记需要往某方向移动:');
        console.log(`      当前 minX: ${DOTA_MAP_BOUNDS.minX}, minY: ${DOTA_MAP_BOUNDS.minY}`);
        console.log(`      如果标记需要往右移 → 增大 minX (如 +${Math.abs(gamePos.x - landmark.x)})`);
        console.log(`      如果标记需要往左移 → 减小 minX (如 -${Math.abs(gamePos.x - landmark.x)})`);
        console.log(`      如果标记需要往下移 → 增大 minY (如 +${Math.abs(gamePos.y - landmark.y)})`);
        console.log(`      如果标记需要往上移 → 减小 minY (如 -${Math.abs(gamePos.y - landmark.y)})`);
      } else if (landmark.name === 'Dire Fountain') {
        console.log('   💡 如果夜魇标记需要往某方向移动:');
        console.log(`      当前 maxX: ${DOTA_MAP_BOUNDS.maxX}, maxY: ${DOTA_MAP_BOUNDS.maxY}`);
        console.log(`      如果标记需要往右移 → 增大 maxX (如 +${Math.abs(gamePos.x - landmark.x)})`);
        console.log(`      如果标记需要往左移 → 减小 maxX (如 -${Math.abs(gamePos.x - landmark.x)})`);
        console.log(`      如果标记需要往下移 → 增大 maxY (如 +${Math.abs(gamePos.y - landmark.y)})`);
        console.log(`      如果标记需要往上移 → 减小 maxY (如 -${Math.abs(gamePos.y - landmark.y)})`);
      } else if (landmark.name === 'Map Center') {
        console.log('   💡 地图中心标记 (用于验证线性映射是否正确):');
        console.log(`      如果中心偏移较大，说明映射可能不是线性的`);
        console.log(`      预期位置应该在河道/Roshan坑附近`);
      }
      console.log('═══════════════════════════════════════════════════════════════');
      
      // 更新标签显示当前坐标
      label.text = `${landmark.name}\n游戏: (${gamePos.x}, ${gamePos.y})`;
    };
    
    this.app.stage.on('pointerup', onDragEnd);
    this.app.stage.on('pointerupoutside', onDragEnd);
    
    parent.addChild(markerContainer);
    
    console.log(`[Calibration] ${landmark.name}: game(${landmark.x}, ${landmark.y}) -> screen(${screenPos.x.toFixed(0)}, ${screenPos.y.toFixed(0)}) [DRAGGABLE]`);
  }

  /**
   * 绘制静态地图元素 (建筑、Roshan、神符等)
   * 
   * 注意: 这个方法暂时未使用
   * 建筑和 Roshan 等元素应该从录像数据动态获取
   * TODO: 扩展解析器后，这个方法可以改为渲染动态数据
   * 
   * @param _unused - 占位参数，防止未使用警告
   */
  public drawMapElements(_unused?: boolean): void {
    console.log('[DotaMapRenderer] Drawing map elements...');
    
    for (const element of MAP_ELEMENTS) {
      const screenPos = this.gameToScreen(element.x, element.y);
      const graphic = this.createMapElementGraphic(element);
      
      if (graphic) {
        graphic.x = screenPos.x;
        graphic.y = screenPos.y;
        this.buildingsContainer.addChild(graphic);
      }
    }
    
    console.log(`[DotaMapRenderer] Drew ${MAP_ELEMENTS.length} map elements`);
  }

  public renderObjectives(objectives: ObjectiveMarker[]): void {
    const previousChildren = this.buildingsContainer.removeChildren();
    for (const child of previousChildren) {
      child.destroy({ children: true });
    }

    for (const objective of objectives) {
      const screenPos = this.gameToScreen(objective.x, objective.y);
      const container = this.createObjectiveSprite(objective) ?? this.createObjectiveGraphic(objective);
      if (!container) {
        continue;
      }
      container.x = screenPos.x;
      container.y = screenPos.y;
      this.buildingsContainer.addChild(container);
    }
  }

  /**
   * 创建地图元素的图形表示
   */
  private createMapElementGraphic(element: MapElement): PIXI.Graphics | null {
    const graphic = new PIXI.Graphics();
    
    // 根据队伍确定颜色
    const teamColor = element.team === 'radiant' 
      ? 0x22c55e  // 绿色
      : element.team === 'dire' 
        ? 0xef4444  // 红色
        : 0xffd700; // 金色 (中立)
    
    switch (element.type) {
      case 'tower':
        // 防御塔: 小方块
        graphic.rect(-4, -4, 8, 8);
        graphic.fill({ color: teamColor, alpha: 0.8 });
        graphic.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
        break;
        
      case 'barracks':
        // 兵营: 矩形
        graphic.rect(-6, -4, 12, 8);
        graphic.fill({ color: teamColor, alpha: 0.7 });
        graphic.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
        break;
        
      case 'ancient':
        // 遗迹 (基地): 大圆形
        graphic.circle(0, 0, 10);
        graphic.fill({ color: teamColor, alpha: 0.6 });
        graphic.stroke({ width: 2, color: teamColor });
        break;
        
      case 'fountain':
        // 泉水: 小圆形 + 发光效果
        graphic.circle(0, 0, 8);
        graphic.fill({ color: teamColor, alpha: 0.4 });
        graphic.circle(0, 0, 5);
        graphic.fill({ color: 0x00ffff, alpha: 0.6 });
        break;
        
      case 'outpost':
        // 前哨: 六边形
        this.drawHexagon(graphic, 6, teamColor);
        break;
        
      case 'roshan':
        // Roshan: 带骷髅标记的圆形
        graphic.circle(0, 0, 8);
        graphic.fill({ color: 0xff6600, alpha: 0.8 });
        graphic.stroke({ width: 2, color: 0xffffff });
        // 内部标记
        graphic.circle(0, 0, 3);
        graphic.fill({ color: 0x000000, alpha: 0.6 });
        break;
        
      case 'rune_bounty':
        // 赏金神符: 金色小圆形
        graphic.circle(0, 0, 4);
        graphic.fill({ color: 0xffd700, alpha: 0.8 });
        break;
        
      case 'rune_power':
        // 河道神符: 蓝色菱形
        graphic.moveTo(0, -5);
        graphic.lineTo(5, 0);
        graphic.lineTo(0, 5);
        graphic.lineTo(-5, 0);
        graphic.closePath();
        graphic.fill({ color: 0x00bfff, alpha: 0.8 });
        break;
        
      case 'rune_wisdom':
        // 智慧神符: 紫色三角形
        graphic.moveTo(0, -5);
        graphic.lineTo(4, 4);
        graphic.lineTo(-4, 4);
        graphic.closePath();
        graphic.fill({ color: 0x9966ff, alpha: 0.8 });
        break;
        
      case 'portal':
        // 传送门: 双圆环
        graphic.circle(0, 0, 7);
        graphic.stroke({ width: 2, color: 0x00ffff, alpha: 0.8 });
        graphic.circle(0, 0, 4);
        graphic.stroke({ width: 2, color: 0x00ffff, alpha: 0.6 });
        break;
        
      case 'lotus_pool':
        // 莲花池: 粉色圆形
        graphic.circle(0, 0, 5);
        graphic.fill({ color: 0xff69b4, alpha: 0.6 });
        break;
        
      case 'tormentor':
        // 折磨者: 红色六边形
        this.drawHexagon(graphic, 7, 0xcc0000);
        break;
        
      default:
        return null;
    }
    
    return graphic;
  }

  private createObjectiveSprite(objective: ObjectiveMarker): PIXI.Container | null {
    const asset = this.getObjectiveTextureAsset(objective);
    if (!asset) {
      return null;
    }

    const container = new PIXI.Container();
    const sprite = new PIXI.Sprite(asset.texture);
    const iconSize = Math.min(this.config.width, this.config.height) * asset.sizeRatio;
    sprite.anchor.set(
      asset.anchorX / asset.texture.width,
      asset.anchorY / asset.texture.height,
    );
    sprite.scale.set(iconSize / Math.max(asset.texture.width, asset.texture.height));

    if (objective.state === 'destroyed') {
      sprite.tint = BUILDING_DESTROYED_TINT[objective.team];
      sprite.alpha = 0.28;
    } else if (objective.state === 'uncertain') {
      sprite.tint = 0xfacc15;
      sprite.alpha = 0.72;
    } else {
      sprite.tint = BUILDING_TEAM_TINT[objective.team];
      sprite.alpha = 0.96;
    }

    container.addChild(sprite);
    return container;
  }

  private getObjectiveTextureAsset(objective: ObjectiveMarker): ObjectiveTextureAsset | undefined {
    const iconKey = resolveObjectiveIconKey(objective);
    return iconKey ? this.objectiveTextures.get(iconKey) : undefined;
  }

  private createObjectiveGraphic(objective: ObjectiveMarker): PIXI.Container | null {
    const container = new PIXI.Container();
    const graphic = new PIXI.Graphics();

    let fillColor =
      objective.team === 'radiant'
        ? 0x22c55e
        : objective.team === 'dire'
          ? 0xef4444
          : 0xffd700;
    let alpha = 0.82;
    let strokeColor = 0xf8fafc;

    if (objective.type === 'roshan') {
      fillColor = 0xf97316;
    } else if (objective.type === 'tormentor') {
      fillColor = 0xe11d48;
    } else if (objective.type === 'barracks') {
      alpha = 0.7;
    }

    if (objective.state === 'destroyed') {
      fillColor = 0x64748b;
      alpha = 0.22;
      strokeColor = 0x94a3b8;
    } else if (objective.state === 'inactive') {
      fillColor = 0x475569;
      alpha = 0.18;
      strokeColor = 0x64748b;
    } else if (objective.state === 'respawning') {
      fillColor = 0xf59e0b;
      alpha = 0.6;
      strokeColor = 0xfde68a;
    } else if (objective.state === 'uncertain') {
      fillColor = 0xfacc15;
      alpha = 0.52;
      strokeColor = 0xfef3c7;
    }

    switch (objective.type) {
      case 'tower':
        graphic.rect(-4, -4, 8, 8);
        graphic.fill({ color: fillColor, alpha });
        graphic.stroke({ width: 1.25, color: strokeColor, alpha: 0.8 });
        break;
      case 'barracks':
        graphic.rect(-6, -4, 12, 8);
        graphic.fill({ color: fillColor, alpha });
        graphic.stroke({ width: 1.25, color: strokeColor, alpha: 0.8 });
        break;
      case 'ancient':
        graphic.circle(0, 0, 9);
        graphic.fill({ color: fillColor, alpha });
        graphic.stroke({ width: 2, color: strokeColor, alpha: 0.85 });
        break;
      case 'roshan':
        graphic.circle(0, 0, 8);
        graphic.fill({ color: fillColor, alpha });
        graphic.stroke({ width: 2, color: strokeColor, alpha: 0.9 });
        graphic.circle(0, 0, 3);
        graphic.fill({ color: 0x020617, alpha: 0.7 });
        break;
      case 'tormentor':
        this.drawHexagon(graphic, 7, fillColor);
        graphic.alpha = alpha;
        break;
      default:
        return null;
    }

    container.addChild(graphic);

    if (objective.state === 'destroyed' || objective.state === 'inactive') {
      const slash = new PIXI.Graphics();
      slash.moveTo(-6, -6);
      slash.lineTo(6, 6);
      slash.stroke({ width: 2, color: strokeColor, alpha: 0.8 });
      container.addChild(slash);
    } else if (objective.state === 'respawning' || objective.state === 'uncertain') {
      const ring = new PIXI.Graphics();
      ring.circle(0, 0, objective.type === 'roshan' ? 11 : 9);
      ring.stroke({ width: 2, color: strokeColor, alpha: 0.9 });
      container.addChild(ring);
    }

    if (
      objective.detailLabel &&
      (objective.type === 'roshan' || objective.type === 'tormentor')
    ) {
      const label = new PIXI.Text({
        text: objective.detailLabel,
        style: {
          fontSize: 9,
          fill: strokeColor,
          fontWeight: '700',
          stroke: { color: 0x020617, width: 3 },
          align: 'center',
        },
      });
      label.anchor.set(0.5, 0);
      label.y = objective.type === 'roshan' ? 12 : 10;
      container.addChild(label);
    }

    return container;
  }

  /**
   * 绘制六边形
   */
  private drawHexagon(graphic: PIXI.Graphics, radius: number, color: number): void {
    const points: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    graphic.poly(points);
    graphic.fill({ color, alpha: 0.7 });
    graphic.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
  }

  /**
   * 预加载英雄图标纹理
   */
  private async preloadHeroTextures(): Promise<void> {
    console.log('[DotaMapRenderer] Preloading hero textures...');
    
    const heroIds = Object.keys(HEROES).map(Number);
    const loadPromises: Promise<void>[] = [];
    
    for (const heroId of heroIds) {
      const hero = getHeroById(heroId);
      if (!hero) continue;
      
      const iconUrl = `/assets/dota/heroes/icons/${hero.name}.png`;
      loadPromises.push(
        PIXI.Assets.load(iconUrl)
          .then((texture: PIXI.Texture) => {
            // 同时用 ID 和名称索引
            this.heroTexturesById.set(heroId, texture);
            this.heroTexturesByName.set(hero.name, texture);
            // 也支持完整名称 (npc_dota_hero_xxx)
            this.heroTexturesByName.set(`npc_dota_hero_${hero.name}`, texture);
            
            // 添加无下划线版本 (如 queenofpain, shadowshaman)
            const noUnderscore = hero.name.replace(/_/g, '');
            if (noUnderscore !== hero.name) {
              this.heroTexturesByName.set(noUnderscore, texture);
            }
            
            // 添加驼峰版本 (如 QueenOfPain, ShadowShaman)
            const camelCase = hero.name
              .split('_')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join('');
            this.heroTexturesByName.set(camelCase, texture);
            this.heroTexturesByName.set(camelCase.toLowerCase(), texture);
          })
          .catch(() => {
            // 图标加载失败，使用 fallback
            console.warn(`[DotaMapRenderer] Failed to load icon for hero ${hero.name}`);
          })
      );
    }
    
    await Promise.allSettled(loadPromises);
    this.texturesLoaded = true;
    console.log(`[DotaMapRenderer] Loaded ${this.heroTexturesById.size} hero textures`);
  }

  private async preloadObjectiveTextures(): Promise<void> {
    const entries = Object.entries(OBJECTIVE_ICON_SPECS) as Array<[ObjectiveIconKey, (typeof OBJECTIVE_ICON_SPECS)[ObjectiveIconKey]]>;

    await Promise.allSettled(
      entries.map(async ([iconKey, spec]) => {
        try {
          const texture = await PIXI.Assets.load<PIXI.Texture>(spec.assetPath);
          this.objectiveTextures.set(iconKey, {
            texture,
            anchorX: texture.width / 2,
            anchorY: texture.height / 2,
            sizeRatio: spec.sizeRatio,
          });
        } catch (error) {
          console.warn(`[DotaMapRenderer] Failed to load objective icon ${iconKey}`, error);
        }
      }),
    );
  }

  /**
   * 预加载眼位 SVG 纹理
   *
   * 实现方式：
   * - 以原始 ward PNG 图标为基底（保持形状与细节一致）
   * - 在 SVG 中使用颜色矩阵做阵营着色（天辉绿/夜魇红）
   */
  private async preloadWardTextures(): Promise<void> {
    console.log('[DotaMapRenderer] Preloading ward SVG textures...');

    const wardTypes: Ward['type'][] = ['observer', 'sentry'];
    const teams: Ward['team'][] = ['radiant', 'dire'];

    try {
      const loadPromises: Promise<void>[] = [];
      const sourceDataUrls = await Promise.all(
        wardTypes.map(async (type) => ({
          type,
          dataUrl: await this.loadWardSourceDataUrl(type),
        }))
      );
      const sourceMap = new Map<Ward['type'], string>(
        sourceDataUrls.map((item) => [item.type, item.dataUrl])
      );

      for (const type of wardTypes) {
        const sourceDataUrl = sourceMap.get(type);
        if (!sourceDataUrl) {
          continue;
        }

        for (const team of teams) {
          const svgDataUrl = this.createWardSvgDataUrl(team, sourceDataUrl);
          loadPromises.push(
            PIXI.Assets.load<PIXI.Texture>(svgDataUrl).then((texture) => {
              this.wardTextures[type][team] = texture;
            })
          );
        }
      }

      await Promise.all(loadPromises);
      console.log('[DotaMapRenderer] Ward SVG textures loaded successfully');
    } catch (error) {
      console.warn('[DotaMapRenderer] Failed to load ward SVG textures, using fallback graphics:', error);
      for (const type of wardTypes) {
        for (const team of teams) {
          this.wardTextures[type][team] = undefined;
        }
      }
    }
  }

  private async loadWardSourceDataUrl(type: Ward['type']): Promise<string> {
    const sourcePath =
      type === 'observer'
        ? '/assets/dota/wards/observer_mapicon.svg'
        : '/assets/dota/wards/sentry_mapicon.svg';

    const response = await fetch(sourcePath);
    if (!response.ok) {
      throw new Error(`Failed to load ward source image: ${sourcePath}`);
    }

    const blob = await response.blob();
    return this.blobToDataUrl(blob);
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to data URL'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 生成 ward SVG data URL
   *
   * 关键点：
   * - 复用原始 observer/sentry 图标轮廓与细节（形状不变）
   * - 通过 feColorMatrix 将 RGB 统一映射为阵营色
   * - 保留 alpha 通道，确保图标边缘与透明区域一致
   */
  private createWardSvgDataUrl(team: Ward['team'], sourceImageDataUrl: string): string {

    const colorHex = team === 'radiant' ? '#22c55e' : '#ef4444';
    const red = parseInt(colorHex.slice(1, 3), 16) / 255;
    const green = parseInt(colorHex.slice(3, 5), 16) / 255;
    const blue = parseInt(colorHex.slice(5, 7), 16) / 255;

    // 颜色矩阵：忽略输入 RGB，直接输出目标阵营色；alpha 保持原图 alpha
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <defs>
          <filter id="teamTint" color-interpolation-filters="sRGB">
            <feColorMatrix type="matrix" values="
              0 0 0 0 ${red}
              0 0 0 0 ${green}
              0 0 0 0 ${blue}
              0 0 0 1 0
            "/>
          </filter>
        </defs>
        <image href="${sourceImageDataUrl}" x="0" y="0" width="32" height="32" filter="url(#teamTint)" preserveAspectRatio="xMidYMid meet"/>
      </svg>
    `.replace(/\s+/g, ' ').trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  /**
   * 特殊英雄名称映射表
   * 用于处理 Clarity 解析器返回的名称与标准名称不一致的情况
   */
  private static readonly HERO_NAME_ALIASES: Record<string, string> = {
    // Clarity 返回的名称 -> 标准文件名
    'queenofpain': 'queenofpain',
    'queen_of_pain': 'queenofpain',
    'vengefulspirit': 'vengefulspirit',
    'vengeful_spirit': 'vengefulspirit',
    'windrunner': 'windrunner',
    'wind_runner': 'windrunner',
    'skeleton_king': 'skeleton_king',
    'skeletonking': 'skeleton_king',
    'wraithking': 'skeleton_king',
    'wraith_king': 'skeleton_king',
    'nevermore': 'nevermore',
    'shadow_fiend': 'nevermore',
    'shadowfiend': 'nevermore',
    'obsidian_destroyer': 'obsidian_destroyer',
    'obsidiandestroyer': 'obsidian_destroyer',
    'outworld_destroyer': 'obsidian_destroyer',
    'outworlddestroyer': 'obsidian_destroyer',
    'necrolyte': 'necrolyte',
    'necrophos': 'necrolyte',
    'rattletrap': 'rattletrap',
    'clockwerk': 'rattletrap',
    'furion': 'furion',
    'nature_prophet': 'furion',
    'naturesprophet': 'furion',
    'doom_bringer': 'doom_bringer',
    'doombringer': 'doom_bringer',
    'doom': 'doom_bringer',
    'wisp': 'wisp',
    'io': 'wisp',
    'magnataur': 'magnataur',
    'magnus': 'magnataur',
    'shredder': 'shredder',
    'timbersaw': 'shredder',
    'centaur': 'centaur',
    'centaur_warrunner': 'centaur',
    'centaurwarrunner': 'centaur',
    'abyssal_underlord': 'abyssal_underlord',
    'abyssalunderlord': 'abyssal_underlord',
    'underlord': 'abyssal_underlord',
    'zuus': 'zuus',
    'zeus': 'zuus',
    'treant': 'treant',
    'treant_protector': 'treant',
    'treantprotector': 'treant',
    'life_stealer': 'life_stealer',
    'lifestealer': 'life_stealer',
    'night_stalker': 'night_stalker',
    'nightstalker': 'night_stalker',
    'shadow_shaman': 'shadow_shaman',
    'shadowshaman': 'shadow_shaman',
    'witch_doctor': 'witch_doctor',
    'witchdoctor': 'witch_doctor',
    'sand_king': 'sand_king',
    'sandking': 'sand_king',
    'storm_spirit': 'storm_spirit',
    'stormspirit': 'storm_spirit',
    'drow_ranger': 'drow_ranger',
    'drowranger': 'drow_ranger',
    'crystal_maiden': 'crystal_maiden',
    'crystalmaiden': 'crystal_maiden',
    'phantom_lancer': 'phantom_lancer',
    'phantomlancer': 'phantom_lancer',
    'phantom_assassin': 'phantom_assassin',
    'phantomassassin': 'phantom_assassin',
    'bounty_hunter': 'bounty_hunter',
    'bountyhunter': 'bounty_hunter',
    'dragon_knight': 'dragon_knight',
    'dragonknight': 'dragon_knight',
    'lone_druid': 'lone_druid',
    'lonedruid': 'lone_druid',
    'chaos_knight': 'chaos_knight',
    'chaosknight': 'chaos_knight',
    'ogre_magi': 'ogre_magi',
    'ogremagi': 'ogre_magi',
    'nyx_assassin': 'nyx_assassin',
    'nyxassassin': 'nyx_assassin',
    'naga_siren': 'naga_siren',
    'nagasiren': 'naga_siren',
    'keeper_of_the_light': 'keeper_of_the_light',
    'keeperofthelight': 'keeper_of_the_light',
    'kotl': 'keeper_of_the_light',
    'troll_warlord': 'troll_warlord',
    'trollwarlord': 'troll_warlord',
    'skywrath_mage': 'skywrath_mage',
    'skywrathmage': 'skywrath_mage',
    'elder_titan': 'elder_titan',
    'eldertitan': 'elder_titan',
    'legion_commander': 'legion_commander',
    'legioncommander': 'legion_commander',
    'ember_spirit': 'ember_spirit',
    'emberspirit': 'ember_spirit',
    'earth_spirit': 'earth_spirit',
    'earthspirit': 'earth_spirit',
    'templar_assassin': 'templar_assassin',
    'templarassassin': 'templar_assassin',
    'faceless_void': 'faceless_void',
    'facelessvoid': 'faceless_void',
    'death_prophet': 'death_prophet',
    'deathprophet': 'death_prophet',
    'spirit_breaker': 'spirit_breaker',
    'spiritbreaker': 'spirit_breaker',
    'dark_seer': 'dark_seer',
    'darkseer': 'dark_seer',
    'shadow_demon': 'shadow_demon',
    'shadowdemon': 'shadow_demon',
    'ancient_apparition': 'ancient_apparition',
    'ancientapparition': 'ancient_apparition',
    'winter_wyvern': 'winter_wyvern',
    'winterwyvern': 'winter_wyvern',
    'arc_warden': 'arc_warden',
    'arcwarden': 'arc_warden',
    'monkey_king': 'monkey_king',
    'monkeyking': 'monkey_king',
    'dark_willow': 'dark_willow',
    'darkwillow': 'dark_willow',
    'void_spirit': 'void_spirit',
    'voidspirit': 'void_spirit',
    'primal_beast': 'primal_beast',
    'primalbeast': 'primal_beast',
  };

  /**
   * 将驼峰式或混合格式的英雄名转换为小写下划线格式
   * 例如: "ShadowShaman" -> "shadow_shaman", "Skywrath_Mage" -> "skywrath_mage"
   */
  private normalizeHeroName(name: string): string {
    // 去掉 npc_dota_hero_ 前缀
    let normalized = name.replace('npc_dota_hero_', '');
    
    // 将驼峰式转换为下划线格式 (ShadowShaman -> Shadow_Shaman -> shadow_shaman)
    normalized = normalized.replace(/([a-z])([A-Z])/g, '$1_$2');
    
    // 转换为小写
    normalized = normalized.toLowerCase();
    
    // 查找别名映射
    const aliasResult = DotaMapRenderer.HERO_NAME_ALIASES[normalized];
    if (aliasResult) {
      return aliasResult;
    }
    
    return normalized;
  }

  /**
   * 根据英雄 ID 或名称获取纹理
   */
  private getHeroTexture(heroId: number, heroName?: string): PIXI.Texture | undefined {
    // 优先按名称查找 (因为后端返回的是英雄内部名称)
    if (heroName) {
      // 直接查找
      const textureByName = this.heroTexturesByName.get(heroName);
      if (textureByName) {
        return textureByName;
      }
      
      // 尝试标准化名称后查找
      const normalizedName = this.normalizeHeroName(heroName);
      const textureByNormalized = this.heroTexturesByName.get(normalizedName);
      if (textureByNormalized) {
        return textureByNormalized;
      }

      // 兜底：忽略下划线差异（如 anti_mage <-> antimage）
      const compactName = normalizedName.replace(/_/g, '');
      if (compactName && compactName !== normalizedName) {
        const textureByCompact = this.heroTexturesByName.get(compactName);
        if (textureByCompact) {
          return textureByCompact;
        }
      }
      
      // 调试: 显示查找失败的信息
      console.log(`[DotaMapRenderer] Texture not found for hero: ${heroName} (normalized: ${normalizedName}, compact: ${compactName}), available names sample:`, 
        Array.from(this.heroTexturesByName.keys()).slice(0, 5));
    }
    
    // 按 ID 查找 (如果后端返回的是真正的英雄 ID)
    const textureById = this.heroTexturesById.get(heroId);
    if (!textureById) {
      console.log(`[DotaMapRenderer] Texture not found by ID: ${heroId}`);
    }
    return textureById;
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
      
      // 更新容器位置
      state.container.x = state.currentX;
      state.container.y = state.currentY;
    }
  }

  /**
   * Load and display Dota 2 minimap background
   */
  private async loadMapBackground(url: string): Promise<void> {
    const candidates = Array.from(new Set([
      url,
      '/assets/dota/minimap/minimap_source.png',
      '/assets/dota/minimap/minimap_game.png',
      '/assets/dota/minimap/minimap_simple.png',
      '/assets/dota/minimap/minimap_740.png',
      '/assets/dota/minimap/minimap.jpg',
    ]));

    for (const candidate of candidates) {
      console.log('[DotaMapRenderer] Loading map background from:', candidate);
      try {
        const texture = await PIXI.Assets.load(candidate);
        this.mapSprite = new PIXI.Sprite(texture);
        this.mapSprite.width = this.config.width;
        this.mapSprite.height = this.config.height;
        this.mapContainer.addChild(this.mapSprite);
        console.log('[DotaMapRenderer] Map background loaded successfully');
        return;
      } catch (error) {
        console.warn('[DotaMapRenderer] Failed to load map image candidate:', candidate, error);
      }
    }

    console.error('[DotaMapRenderer] Failed to load all map image candidates');
    this.drawGrid();
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
    
    // Radiant base (传统坐标约 -6900, -6500 -> cell-based 9484, 9884)
    const radiantPos = this.gameToScreen(9484, 9884);
    const radiantBase = new PIXI.Graphics();
    radiantBase.circle(radiantPos.x, radiantPos.y, 35);
    radiantBase.fill({ color: 0x22c55e, alpha: 0.2 });
    radiantBase.stroke({ width: 2, color: 0x22c55e });
    this.mapContainer.addChild(radiantBase);
    
    // Dire base (传统坐标约 7100, 6400 -> cell-based 23484, 22784)
    const direPos = this.gameToScreen(23484, 22784);
    const direBase = new PIXI.Graphics();
    direBase.circle(direPos.x, direPos.y, 35);
    direBase.fill({ color: 0xef4444, alpha: 0.2 });
    direBase.stroke({ width: 2, color: 0xef4444 });
    this.mapContainer.addChild(direBase);
  }

  /**
   * 在小地图上加一层轻微暗化遮罩，提升前景元素可读性
   */
  private drawMapDimOverlay(): void {
    const opacity = Math.max(0, Math.min(1, this.config.mapDimOpacity));
    if (opacity <= 0) {
      return;
    }

    const overlay = new PIXI.Graphics();
    overlay.rect(0, 0, this.config.width, this.config.height);
    overlay.fill({ color: 0x000000, alpha: opacity });
    this.mapContainer.addChild(overlay);
  }

  /**
   * Convert game world coordinates to screen coordinates
   * 
   * 考虑 minimap 图片的透明边框:
   * - 图片有约 6% 的透明边框
   * - 实际地图内容区域是 (6%, 6%) 到 (94%, 94%)
   * - 需要将游戏坐标映射到这个内容区域内
   */
  gameToScreen(gameX: number, gameY: number): { x: number; y: number } {
    return this.coordinateMapper.gameToScreen(gameX, gameY);
  }

  /**
   * Convert screen coordinates to game world coordinates
   * (gameToScreen 的反向操作)
   */
  screenToGame(screenX: number, screenY: number): { x: number; y: number } {
    return this.coordinateMapper.screenToGame(screenX, screenY);
  }

  private destroyContainerChildren(container?: PIXI.Container): void {
    if (!container) {
      return;
    }

    const children = container.removeChildren();
    for (const child of children) {
      child.destroy({ children: true });
    }
  }

  /**
   * 创建英雄图形（圆形 fallback）
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
   * 创建队伍颜色指示器（圆环）
   */
  private createTeamIndicator(team: 'radiant' | 'dire', size: number): PIXI.Graphics {
    const color = team === 'radiant' ? 0x22c55e : 0xef4444;
    const indicator = new PIXI.Graphics();
    
    // 圆形边框
    indicator.circle(0, 0, size / 2 + 2);
    indicator.stroke({ color: color, width: 3 });
    
    return indicator;
  }

  /**
   * 创建英雄容器（包含图标和队伍指示器）
   */
  private createHeroContainer(heroId: number, heroName: string, team: 'radiant' | 'dire'): {
    container: PIXI.Container;
    sprite?: PIXI.Sprite;
    graphic?: PIXI.Graphics;
    teamIndicator: PIXI.Graphics;
    usingIcon: boolean;
  } {
    const container = new PIXI.Container();
    const iconSize = this.config.heroIconSize;
    
    // 队伍颜色指示器（底层）
    const teamIndicator = this.createTeamIndicator(team, iconSize);
    container.addChild(teamIndicator);
    
    // 尝试使用英雄图标
    const texture = this.getHeroTexture(heroId, heroName);
    
    if (this.config.useHeroIcons && texture) {
      // 使用英雄图标精灵
      const sprite = new PIXI.Sprite(texture);
      sprite.width = iconSize;
      sprite.height = iconSize;
      sprite.anchor.set(0.5, 0.5); // 居中锚点
      
      // 创建圆形遮罩
      const mask = new PIXI.Graphics();
      mask.circle(0, 0, iconSize / 2);
      mask.fill({ color: 0xffffff });
      container.addChild(mask);
      sprite.mask = mask;
      
      container.addChild(sprite);
      
      console.log(`[DotaMapRenderer] Created hero ${heroName} with icon`);
      return { container, sprite, teamIndicator, usingIcon: true };
    } else {
      // 使用圆形图形作为 fallback
      console.log(`[DotaMapRenderer] Created hero ${heroName} with fallback (texture: ${!!texture}, useIcons: ${this.config.useHeroIcons}, texturesLoaded: ${this.texturesLoaded})`);
      const graphic = this.createHeroGraphic(team);
      container.addChild(graphic);
      
      return { container, graphic, teamIndicator, usingIcon: false };
    }
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
        this.heroesContainer.removeChild(state.container);
        state.container.destroy({ children: true });
        this.heroStates.delete(heroId);
      }
    }
    
    // 更新或创建英雄
    for (const pos of positions) {
      const screenPos = this.gameToScreen(pos.x, pos.y);
      
      let state = this.heroStates.get(pos.hero_id);
      
      // 如果英雄存在但没有使用图标，且现在纹理已加载，则重新创建
      const shouldRecreate = state && !state.usingIcon && this.texturesLoaded && this.config.useHeroIcons;
      
      if (!state || shouldRecreate) {
        // 如果需要重新创建，先移除旧的
        if (state) {
          this.heroesContainer.removeChild(state.container);
          state.container.destroy({ children: true });
          this.heroStates.delete(pos.hero_id);
        }
        
        // 创建新英雄
        const { container, sprite, graphic, teamIndicator, usingIcon } = this.createHeroContainer(pos.hero_id, pos.hero_name, pos.team);
        container.x = screenPos.x;
        container.y = screenPos.y;
        this.heroesContainer.addChild(container);
        
        state = {
          container,
          sprite,
          graphic,
          teamIndicator,
          currentX: screenPos.x,
          currentY: screenPos.y,
          targetX: screenPos.x,
          targetY: screenPos.y,
          team: pos.team,
          heroId: pos.hero_id,
          heroName: pos.hero_name,
          usingIcon,
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
   * 创建眼位图形
   * 设计说明:
   * - Observer Ward (假眼): 圆形，黄色内心，提供视野
   * - Sentry Ward (真眼): 菱形，蓝色内心，探测隐身
   * - 队伍区分: 天辉绿色边框，夜魇红色边框 (与英雄一致)
   */
  private createWardGraphic(type: 'observer' | 'sentry', team: 'radiant' | 'dire'): PIXI.Graphics {
    const wardGraphic = new PIXI.Graphics();
    const teamColor = team === 'radiant' ? 0x22c55e : 0xef4444;
    // Observer = 假眼 (黄色), Sentry = 真眼 (蓝/紫色)
    const innerColor = type === 'observer' ? 0xffd700 : 0x6a5acd;
    const size = 12;
    
    if (type === 'observer') {
      // 假眼: 圆形设计
      // 外圈 - 队伍颜色
      wardGraphic.circle(0, 0, size);
      wardGraphic.stroke({ color: teamColor, width: 3 });
      
      // 内圈填充 - 黄色 (代表视野)
      wardGraphic.circle(0, 0, size - 2);
      wardGraphic.fill({ color: innerColor });
      
      // 中心眼睛图案
      wardGraphic.circle(0, 0, 4);
      wardGraphic.fill({ color: 0x000000, alpha: 0.6 });
      wardGraphic.circle(0, 0, 2);
      wardGraphic.fill({ color: 0xffffff });
    } else {
      // 真眼: 菱形设计
      // 外框 - 队伍颜色
      wardGraphic.moveTo(0, -size);
      wardGraphic.lineTo(size, 0);
      wardGraphic.lineTo(0, size);
      wardGraphic.lineTo(-size, 0);
      wardGraphic.closePath();
      wardGraphic.stroke({ color: teamColor, width: 3 });
      
      // 内部填充 - 蓝紫色 (代表反隐)
      wardGraphic.moveTo(0, -(size - 2));
      wardGraphic.lineTo(size - 2, 0);
      wardGraphic.lineTo(0, size - 2);
      wardGraphic.lineTo(-(size - 2), 0);
      wardGraphic.closePath();
      wardGraphic.fill({ color: innerColor });
      
      // 中心图案
      wardGraphic.circle(0, 0, 3);
      wardGraphic.fill({ color: 0xffffff, alpha: 0.8 });
    }
    
    return wardGraphic;
  }

  /**
   * 创建眼位容器
   * 
   * 设计说明:
   * - 使用 SVG 封装原始 ward 图标，保持原图形状
   * - 通过 SVG 颜色矩阵做阵营着色（Radiant 绿 / Dire 红）
   */
  private createWardContainer(type: 'observer' | 'sentry', team: 'radiant' | 'dire'): PIXI.Container {
    const container = new PIXI.Container();
    const wardSize = this.config.wardIconSize;
    const texture = this.wardTextures[type][team];

    const glow = this.createWardGlow(type, team, wardSize);
    container.addChild(glow);
    
    if (texture) {
      // 使用 SVG 纹理
      const sprite = new PIXI.Sprite(texture);
      sprite.width = wardSize;
      sprite.height = wardSize;
      sprite.anchor.set(0.5, 0.5);
      container.addChild(sprite);
    } else {
      // Fallback: 使用几何图形
      const graphic = this.createWardGraphic(type, team);
      container.addChild(graphic);
    }
    
    return container;
  }

  private createWardSelectionRing(wardSize: number): PIXI.Graphics {
    const ring = new PIXI.Graphics();
    ring.circle(0, 0, wardSize * 0.68);
    ring.stroke({ width: 3, color: 0xf8fafc, alpha: 0.92 });
    ring.filters = [new PIXI.BlurFilter(1.5)];
    return ring;
  }

  /**
   * 创建眼位柔和辉光，增强在复杂背景上的识别度
   */
  private createWardGlow(type: 'observer' | 'sentry', team: 'radiant' | 'dire', wardSize: number): PIXI.Graphics {
    void type;
    const glow = new PIXI.Graphics();
    const color = team === 'radiant' ? 0x22c55e : 0xef4444;

    // 使用单层柔和光晕，避免明显图层感
    glow.circle(0, 0, wardSize * 0.58);
    glow.fill({ color, alpha: 0.12 });
    glow.filters = [new PIXI.BlurFilter(3)];

    return glow;
  }

  /**
   * Render ward placements
   */
  renderWards(wards: Ward[]): void {
    if (!this.initialized || !this.app?.stage) {
      return;
    }
    
    this.currentWards = wards;
    if (wards.length === 0) {
      this.emitWardSelection([]);
    }
    this.destroyContainerChildren(this.wardsContainer);

    for (const ward of wards) {
      const screenPos = this.gameToScreen(ward.x, ward.y);
      const wardContainer = this.createWardContainer(ward.type, ward.team);
      const isSelected = ward.instanceKey ? this.selectedWardKeys.has(ward.instanceKey) : false;
      
      wardContainer.x = screenPos.x;
      wardContainer.y = screenPos.y;
      wardContainer.alpha = ward.placed ? 1.0 : 0.5;
      if (isSelected) {
        wardContainer.addChildAt(this.createWardSelectionRing(this.config.wardIconSize), 0);
      }
      
      this.wardsContainer.addChild(wardContainer);
    }
  }

  setWardSelectionHandler(handler?: (wards: Ward[]) => void): void {
    this.onWardSelectionChange = handler;
    if (!handler) {
      this.hoveredWardSignature = '';
    }
  }

  setWardHoverHandler(handler?: (payload: WardInteractionPayload | null) => void): void {
    this.onWardHoverChange = handler;
  }

  setWardClickHandler(handler?: (payload: WardInteractionPayload | null) => void): void {
    this.onWardClick = handler;
  }

  setSelectedWardKeys(instanceKeys: string[]): void {
    this.selectedWardKeys = new Set(
      instanceKeys.filter((instanceKey) => typeof instanceKey === 'string' && instanceKey.length > 0)
    );

    if (this.initialized) {
      this.renderWards(this.currentWards);
    }
  }

  /**
   * Update kill markers on the minimap
   * Shows kill events within ±KILL_TIME_WINDOW seconds of currentGameTime
   * Opacity fades based on time distance (1.0 at current, 0.3 at edge)
   */
  private static readonly KILL_TIME_WINDOW = 5;
  private static readonly KILL_MARKER_SIZE = 8;
  private static readonly KILL_MARKER_MIN_ALPHA = 0.3;

  updateKillMarkers(kills: KillMarkerData[], currentGameTime: number): void {
    if (!this.initialized || !this.app?.stage) {
      return;
    }

    this.destroyContainerChildren(this.killsContainer);

    const window = DotaMapRenderer.KILL_TIME_WINDOW;
    const minAlpha = DotaMapRenderer.KILL_MARKER_MIN_ALPHA;
    const size = DotaMapRenderer.KILL_MARKER_SIZE;

    for (const kill of kills) {
      const timeDiff = Math.abs(kill.time - currentGameTime);
      if (timeDiff > window) {
        continue;
      }

      // Opacity: 1.0 at current time, KILL_MARKER_MIN_ALPHA at ±window edge
      const alpha = 1.0 - (1.0 - minAlpha) * (timeDiff / window);

      const screenPos = this.gameToScreen(kill.x, kill.y);

      // Color based on victim team:
      // Radiant victim (team 2) = red marker (bad for Radiant)
      // Dire victim (team 3) = green marker (good for Radiant)
      const markerColor = kill.victimTeam === 2 ? 0xef4444 : 0x22c55e;
      const outlineColor = 0x000000;

      const marker = new PIXI.Graphics();

      // Dark outline for readability
      marker.moveTo(screenPos.x - size, screenPos.y - size);
      marker.lineTo(screenPos.x + size, screenPos.y + size);
      marker.moveTo(screenPos.x + size, screenPos.y - size);
      marker.lineTo(screenPos.x - size, screenPos.y + size);
      marker.stroke({ width: 4, color: outlineColor, alpha: alpha * 0.6 });

      // Colored X marker
      marker.moveTo(screenPos.x - size, screenPos.y - size);
      marker.lineTo(screenPos.x + size, screenPos.y + size);
      marker.moveTo(screenPos.x + size, screenPos.y - size);
      marker.lineTo(screenPos.x - size, screenPos.y + size);
      marker.stroke({ width: 2.5, color: markerColor, alpha });

      // Small center dot for emphasis
      marker.circle(screenPos.x, screenPos.y, 2.5);
      marker.fill({ color: markerColor, alpha });

      this.killsContainer.addChild(marker);
    }
  }

  /**
   * Clear all kill markers
   */
  clearKillMarkers(): void {
    if (this.killsContainer) {
      this.destroyContainerChildren(this.killsContainer);
    }
  }

  renderPathOverlays(paths: PathOverlay[]): void {
    if (!this.initialized || !this.app?.stage || !this.showPaths) {
      return;
    }

    this.destroyContainerChildren(this.pathsContainer);

    for (const path of paths) {
      if (!Array.isArray(path.points) || path.points.length < 2) {
        continue;
      }

      const gfx = new PIXI.Graphics();
      const color = path.team === 'radiant' ? 0x22c55e : 0xef4444;

      for (let index = 1; index < path.points.length; index++) {
        const previous = path.points[index - 1];
        const current = path.points[index];
        const from = this.gameToScreen(previous.x, previous.y);
        const to = this.gameToScreen(current.x, current.y);
        const progress = index / (path.points.length - 1);
        const alpha = 0.12 + 0.38 * progress;

        gfx.moveTo(from.x, from.y);
        gfx.lineTo(to.x, to.y);
        gfx.stroke({ width: 2.5, color, alpha });
      }

      this.pathsContainer.addChild(gfx);
    }
  }

  clearPathOverlays(): void {
    if (this.pathsContainer) {
      this.destroyContainerChildren(this.pathsContainer);
    }
  }

  // ────────── Path Traces ──────────

  /**
   * Update hero movement path traces on the minimap.
   * Maintains a rolling buffer of recent positions per hero and draws
   * polylines with fading opacity (oldest 0.05 → newest 0.5).
   */
  updatePathTraces(heroPositions: HeroPosition[], trailLength: number = 30): void {
    if (!this.initialized || !this.app?.stage || !this.showPaths) {
      return;
    }

    this.destroyContainerChildren(this.pathsContainer);

    for (const pos of heroPositions) {
      const screenPos = this.gameToScreen(pos.x, pos.y);
      const key = pos.hero_name;

      // Get or create history buffer
      let history = this.pathHistory.get(key);
      if (!history) {
        history = [];
        this.pathHistory.set(key, history);
      }

      // Skip duplicate points (e.g. when playback is paused)
      const last = history[history.length - 1];
      if (!last || Math.abs(last.x - screenPos.x) > 0.5 || Math.abs(last.y - screenPos.y) > 0.5) {
        history.push({ x: screenPos.x, y: screenPos.y });
      }

      // Trim to trail length
      if (history.length > trailLength) {
        history.splice(0, history.length - trailLength);
      }

      // Need at least 2 points to draw a segment
      if (history.length < 2) continue;

      const teamColor = pos.team === 'radiant' ? 0x22c55e : 0xef4444;
      const gfx = new PIXI.Graphics();

      for (let i = 1; i < history.length; i++) {
        const p0 = history[i - 1];
        const p1 = history[i];

        // Opacity gradient: oldest segment ≈ 0.05, newest ≈ 0.5
        const progress = i / (history.length - 1);
        const alpha = 0.05 + 0.45 * progress;

        gfx.moveTo(p0.x, p0.y);
        gfx.lineTo(p1.x, p1.y);
        gfx.stroke({ width: 2, color: teamColor, alpha });
      }

      this.pathsContainer.addChild(gfx);
    }
  }

  /**
   * Toggle hero movement path traces on/off.
   * Clears accumulated path history when disabling.
   */
  togglePathTraces(enabled: boolean): void {
    this.showPaths = enabled;
    if (this.pathsContainer) {
      this.pathsContainer.visible = enabled;
    }
    if (!enabled) {
      this.pathHistory.clear();
      if (this.pathsContainer) {
        this.destroyContainerChildren(this.pathsContainer);
      }
    }
  }
  // ────────── Heatmap Overlay ──────────

  /**
   * Compute heatmap color for a normalized value [0, 1]
   * Blue → Cyan → Yellow → Red gradient
   */
  private static heatmapColor(value: number): number {
    const v = Math.max(0, Math.min(1, value));
    let r: number, g: number, b: number;

    if (v < 0.33) {
      const t = v / 0.33;
      r = 0;
      g = Math.floor(t * 255);
      b = 255;
    } else if (v < 0.66) {
      const t = (v - 0.33) / 0.33;
      r = Math.floor(t * 255);
      g = 255;
      b = Math.floor((1 - t) * 255);
    } else {
      const t = (v - 0.66) / 0.34;
      r = 255;
      g = Math.floor((1 - t) * 255);
      b = 0;
    }

    return (r << 16) | (g << 8) | b;
  }

  /**
   * Render a heatmap overlay on the minimap
   * @param grid 2D array of normalized [0,1] density values (grid[row][col], row 0 = min_y)
   * @param bounds Game-world bounds for the grid
   */
  renderHeatmap(grid: number[][], bounds: HeatmapBounds): void {
    if (!this.initialized || !this.app?.stage) {
      return;
    }

    this.clearHeatmap();

    const resolution = grid.length;
    if (resolution === 0) return;

    const THRESHOLD = 0.05;

    // Screen-space bounding box for the heatmap area
    const topLeft = this.gameToScreen(bounds.min_x, bounds.max_y);
    const bottomRight = this.gameToScreen(bounds.max_x, bounds.min_y);
    const totalW = bottomRight.x - topLeft.x;
    const totalH = bottomRight.y - topLeft.y;
    const cellW = totalW / resolution;
    const cellH = totalH / resolution;

    const gfx = new PIXI.Graphics();

    for (let row = 0; row < resolution; row++) {
      const rowData = grid[row];
      if (!rowData) continue;

      for (let col = 0; col < resolution; col++) {
        const value = rowData[col] ?? 0;
        if (value < THRESHOLD) continue;

        // row 0 = min_y (map bottom) → screen bottom, so invert row index
        const sx = topLeft.x + col * cellW;
        const sy = topLeft.y + (resolution - 1 - row) * cellH;
        const color = DotaMapRenderer.heatmapColor(value);
        const alpha = 0.24 + value * 0.62;

        gfx.rect(sx, sy, cellW, cellH);
        gfx.fill({ color, alpha });
      }
    }

    this.heatmapContainer.addChild(gfx);
    this.heatmapContainer.visible = true;
  }

  /**
   * Clear the heatmap overlay
   */
  clearHeatmap(): void {
    if (this.heatmapContainer) {
      this.destroyContainerChildren(this.heatmapContainer);
    }
  }

  /**
   * Toggle heatmap layer visibility
   */
  setHeatmapVisible(visible: boolean): void {
    if (this.heatmapContainer) {
      this.heatmapContainer.visible = visible;
    }
  }
  /**
   * Clear all rendered objects
   */
  clear(): void {
    if (this.heroesContainer) {
      this.destroyContainerChildren(this.heroesContainer);
    }
    if (this.wardsContainer) {
      this.destroyContainerChildren(this.wardsContainer);
    }
    if (this.killsContainer) {
      this.destroyContainerChildren(this.killsContainer);
    }
    if (this.pathsContainer) {
      this.destroyContainerChildren(this.pathsContainer);
    }
    this.pathHistory.clear();
    if (this.heatmapContainer) {
      this.destroyContainerChildren(this.heatmapContainer);
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
      this.app.stage.off('pointermove', this.handleWardPointerMove);
      this.app.stage.off('pointertap', this.handleWardPointerTap);
      this.app.canvas.removeEventListener('pointerleave', this.handleWardPointerLeave);
      this.app.ticker.remove(this.animateTick);
      this.app.ticker.stop();
      this.app.destroy(true, { children: true });
    }
    this.heroTexturesById.clear();
    this.heroTexturesByName.clear();
    this.wardTextures.observer.radiant = undefined;
    this.wardTextures.observer.dire = undefined;
    this.wardTextures.sentry.radiant = undefined;
    this.wardTextures.sentry.dire = undefined;
    this.currentWards = [];
    this.selectedWardKeys.clear();
    this.onWardSelectionChange = undefined;
    this.onWardHoverChange = undefined;
    this.onWardClick = undefined;
    this.hoveredWardSignature = '';
    this.texturesLoaded = false;
  }

  private getWardsAtLocalPosition(localX: number, localY: number): Ward[] {
    if (this.currentWards.length === 0) {
      return [];
    }

    const hitRadius = Math.max(this.WARD_SELECTION_RADIUS_PX, this.config.wardIconSize * 0.95);

    return this.currentWards
      .map((ward) => {
        const screenPos = this.gameToScreen(ward.x, ward.y);
        const distance = Math.hypot(screenPos.x - localX, screenPos.y - localY);
        return {
          ward,
          distance,
        };
      })
      .filter(({ distance }) => distance <= hitRadius)
      .sort((left, right) => left.distance - right.distance)
      .map(({ ward }) => ward);
  }

  private emitWardSelection(wards: Ward[]): void {
    if (!this.onWardSelectionChange) {
      return;
    }

    const signature = wards
      .map((ward) => ward.instanceKey ?? `${ward.handle ?? 'unknown'}:${ward.type}:${Math.round(ward.x)}:${Math.round(ward.y)}`)
      .join('|');

    if (signature === this.hoveredWardSignature) {
      return;
    }

    this.hoveredWardSignature = signature;
    this.onWardSelectionChange(wards);
  }

  /**
   * Get the PixiJS app instance
   */
  getApp(): PIXI.Application {
    return this.app;
  }

  /**
   * 检查是否使用了英雄图标
   */
  isUsingHeroIcons(): boolean {
    return this.config.useHeroIcons && this.texturesLoaded;
  }

  /**
   * 强制刷新所有英雄图标（在纹理加载完成后调用）
   */
  refreshHeroIcons(): void {
    if (!this.texturesLoaded || !this.config.useHeroIcons) {
      console.log('[DotaMapRenderer] Cannot refresh: texturesLoaded=', this.texturesLoaded, 'useHeroIcons=', this.config.useHeroIcons);
      return;
    }

    console.log('[DotaMapRenderer] Refreshing hero icons...');
    
    // 收集所有当前英雄的信息
    const heroInfos: Array<{heroId: number; heroName: string; team: 'radiant' | 'dire'; x: number; y: number}> = [];
    
    for (const [heroId, state] of this.heroStates) {
      heroInfos.push({
        heroId,
        heroName: state.heroName,
        team: state.team,
        x: state.currentX,
        y: state.currentY,
      });
      
      // 移除旧容器
      this.heroesContainer.removeChild(state.container);
      state.container.destroy({ children: true });
    }
    
    this.heroStates.clear();
    
    // 重新创建所有英雄
    for (const info of heroInfos) {
      const { container, sprite, graphic, teamIndicator, usingIcon } = this.createHeroContainer(
        info.heroId, 
        info.heroName, 
        info.team
      );
      container.x = info.x;
      container.y = info.y;
      this.heroesContainer.addChild(container);
      
      this.heroStates.set(info.heroId, {
        container,
        sprite,
        graphic,
        teamIndicator,
        currentX: info.x,
        currentY: info.y,
        targetX: info.x,
        targetY: info.y,
        team: info.team,
        heroId: info.heroId,
        heroName: info.heroName,
        usingIcon,
      });
    }
    
    console.log(`[DotaMapRenderer] Refreshed ${heroInfos.length} heroes`);
  }

  /**
   * 获取已加载的纹理数量（调试用）
   */
  getLoadedTextureCount(): { byId: number; byName: number } {
    return {
      byId: this.heroTexturesById.size,
      byName: this.heroTexturesByName.size,
    };
  }
}

export default DotaMapRenderer;
