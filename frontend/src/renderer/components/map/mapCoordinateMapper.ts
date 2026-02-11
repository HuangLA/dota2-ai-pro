export interface DotaMapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MinimapContentBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface MapCoordinateMapperConfig {
  viewportWidth: number;
  viewportHeight: number;
  worldBounds: DotaMapBounds;
  minimapContentBounds: MinimapContentBounds;
  preserveAspectRatio?: boolean;
}

export interface CoordinatePoint {
  x: number;
  y: number;
}

export const DOTA_MAP_BOUNDS: DotaMapBounds = Object.freeze({
  minX: 7558,
  maxX: 25353,
  minY: 7502,
  maxY: 25269,
});

export const MINIMAP_CONTENT_BOUNDS: MinimapContentBounds = Object.freeze({
  left: 61 / 1024,
  right: 962 / 1024,
  top: 61 / 1024,
  bottom: 962 / 1024,
});

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getWorldSize(bounds: DotaMapBounds): { width: number; height: number } {
  return {
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

function getContentSize(bounds: MinimapContentBounds): { width: number; height: number } {
  return {
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

export interface MapCoordinateMapper {
  gameToScreen(gameX: number, gameY: number): CoordinatePoint;
  screenToGame(screenX: number, screenY: number): CoordinatePoint;
}

export function createMapCoordinateMapper(config: MapCoordinateMapperConfig): MapCoordinateMapper {
  const worldSize = getWorldSize(config.worldBounds);
  const contentSize = getContentSize(config.minimapContentBounds);
  const preserveAspectRatio = config.preserveAspectRatio ?? true;
  const worldSpan = preserveAspectRatio ? Math.max(worldSize.width, worldSize.height) : 0;
  const worldPaddingX = preserveAspectRatio ? (worldSpan - worldSize.width) / 2 : 0;
  const worldPaddingY = preserveAspectRatio ? (worldSpan - worldSize.height) / 2 : 0;

  return {
    gameToScreen(gameX: number, gameY: number): CoordinatePoint {
      const normalizedX = preserveAspectRatio
        ? clamp01((gameX - config.worldBounds.minX + worldPaddingX) / worldSpan)
        : clamp01((gameX - config.worldBounds.minX) / worldSize.width);
      const normalizedY = preserveAspectRatio
        ? clamp01((config.worldBounds.maxY - gameY + worldPaddingY) / worldSpan)
        : clamp01((config.worldBounds.maxY - gameY) / worldSize.height);

      const normalizedContentX = config.minimapContentBounds.left + normalizedX * contentSize.width;
      const normalizedContentY = config.minimapContentBounds.top + normalizedY * contentSize.height;

      return {
        x: normalizedContentX * config.viewportWidth,
        y: normalizedContentY * config.viewportHeight,
      };
    },

    screenToGame(screenX: number, screenY: number): CoordinatePoint {
      const normalizedContentX = screenX / config.viewportWidth;
      const normalizedContentY = screenY / config.viewportHeight;

      const normalizedX = clamp01((normalizedContentX - config.minimapContentBounds.left) / contentSize.width);
      const normalizedY = clamp01((normalizedContentY - config.minimapContentBounds.top) / contentSize.height);

      const gameX = preserveAspectRatio
        ? config.worldBounds.minX + normalizedX * worldSpan - worldPaddingX
        : config.worldBounds.minX + normalizedX * worldSize.width;
      const gameY = preserveAspectRatio
        ? config.worldBounds.maxY - (normalizedY * worldSpan - worldPaddingY)
        : config.worldBounds.maxY - normalizedY * worldSize.height;

      return {
        x: Math.round(gameX),
        y: Math.round(gameY),
      };
    },
  };
}
