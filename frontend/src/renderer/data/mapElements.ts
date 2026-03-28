/**
 * Dota 2 地图元素配置
 * 
 * 坐标系说明:
 * - 使用 Source 2 cell-based 坐标系统
 * - 范围: 8192 ~ 24576 (对应传统坐标 -8192 ~ 8192)
 * - 中心点: (16384, 16384) 对应传统坐标 (0, 0)
 * - 转换公式: cell_based = traditional + 16384
 * 
 * 版本: 7.41
 */

/** 地图元素类型 */
export type MapElementType = 
  | 'tower'
  | 'barracks'
  | 'ancient'
  | 'fountain'
  | 'outpost'
  | 'roshan'
  | 'rune_bounty'
  | 'rune_power'
  | 'rune_wisdom'
  | 'portal'
  | 'lotus_pool'
  | 'tormentor';

/** 队伍 */
export type Team = 'radiant' | 'dire' | 'neutral';

/** 地图元素 */
export interface MapElement {
  id: string;
  type: MapElementType;
  team: Team;
  x: number;
  y: number;
  name: string;
  nameZh: string;
}

/**
 * 将传统坐标 (-8192 ~ 8192) 转换为 cell-based 坐标
 */
function toCell(traditional: number): number {
  return traditional + 16384;
}

export const OBJECTIVE_MAP_ELEMENT_TYPES: MapElementType[] = [
  'tower',
  'barracks',
  'ancient',
];

/**
 * 所有地图元素配置
 * 坐标来源:
 * - 解析器产出的 objective 世界坐标
 * - 官方 minimap 建筑覆盖图 `dotamap_*_buildings.png`
 *
 * 注意:
 * - 已优先使用 replay 中实测的建筑坐标
 * - 只有少量当前样本里还没被摧毁过的建筑继续使用对称推导或近似值
 */
export const MAP_ELEMENTS: MapElement[] = [
  // ===============================
  // 天辉 (Radiant) 建筑
  // ===============================
  
  // 天辉泉水
  {
    id: 'radiant_fountain',
    type: 'fountain',
    team: 'radiant',
    x: toCell(-7000),  // 9384
    y: toCell(-6800),  // 9584
    name: 'Radiant Fountain',
    nameZh: '天辉泉水',
  },
  
  // 天辉遗迹 (基地)
  {
    id: 'radiant_ancient',
    type: 'ancient',
    team: 'radiant',
    x: 10464,
    y: 11032,
    name: 'Radiant Ancient',
    nameZh: '天辉遗迹',
  },
  
  // 天辉防御塔 - 中路
  {
    id: 'radiant_mid_t1',
    type: 'tower',
    team: 'radiant',
    x: 14840,
    y: 14976,
    name: 'Radiant Mid T1',
    nameZh: '天辉中路一塔',
  },
  {
    id: 'radiant_mid_t2',
    type: 'tower',
    team: 'radiant',
    x: 13193.656,
    y: 13457.75,
    name: 'Radiant Mid T2',
    nameZh: '天辉中路二塔',
  },
  {
    id: 'radiant_mid_t3',
    type: 'tower',
    team: 'radiant',
    x: 11744,
    y: 12240,
    name: 'Radiant Mid T3',
    nameZh: '天辉中路三塔',
  },
  
  // 天辉防御塔 - 上路 (顶路)
  {
    id: 'radiant_top_t1',
    type: 'tower',
    team: 'radiant',
    x: 10048,
    y: 18240,
    name: 'Radiant Top T1',
    nameZh: '天辉上路一塔',
  },
  {
    id: 'radiant_top_t2',
    type: 'tower',
    team: 'radiant',
    x: 9883,
    y: 15512,
    name: 'Radiant Top T2',
    nameZh: '天辉上路二塔',
  },
  {
    id: 'radiant_top_t3',
    type: 'tower',
    team: 'radiant',
    x: 9792,
    y: 12976,
    name: 'Radiant Top T3',
    nameZh: '天辉上路三塔',
  },
  
  // 天辉防御塔 - 下路 (底路)
  {
    id: 'radiant_bot_t1',
    type: 'tower',
    team: 'radiant',
    x: 21287.5,
    y: 10185.719,
    name: 'Radiant Bot T1',
    nameZh: '天辉下路一塔',
  },
  {
    id: 'radiant_bot_t2',
    type: 'tower',
    team: 'radiant',
    x: 16024,
    y: 10128,
    name: 'Radiant Bot T2',
    nameZh: '天辉下路二塔',
  },
  {
    id: 'radiant_bot_t3',
    type: 'tower',
    team: 'radiant',
    x: 12432,
    y: 10272,
    name: 'Radiant Bot T3',
    nameZh: '天辉下路三塔',
  },
  
  // 天辉防御塔 - T4
  {
    id: 'radiant_t4_top',
    type: 'tower',
    team: 'radiant',
    x: 10672,
    y: 11520,
    name: 'Radiant T4 Top',
    nameZh: '天辉四塔(上)',
  },
  {
    id: 'radiant_t4_bot',
    type: 'tower',
    team: 'radiant',
    x: 10992,
    y: 11192,
    name: 'Radiant T4 Bot',
    nameZh: '天辉四塔(下)',
  },

  // 天辉兵营
  {
    id: 'radiant_top_rax_melee',
    type: 'barracks',
    team: 'radiant',
    x: 10048,
    y: 12626,
    name: 'Radiant Top Melee Barracks',
    nameZh: '天辉上路近战兵营',
  },
  {
    id: 'radiant_top_rax_ranged',
    type: 'barracks',
    team: 'radiant',
    x: 9540,
    y: 12625,
    name: 'Radiant Top Ranged Barracks',
    nameZh: '天辉上路远程兵营',
  },
  {
    id: 'radiant_mid_rax_melee',
    type: 'barracks',
    team: 'radiant',
    x: 11712,
    y: 11832,
    name: 'Radiant Mid Melee Barracks',
    nameZh: '天辉中路近战兵营',
  },
  {
    id: 'radiant_mid_rax_ranged',
    type: 'barracks',
    team: 'radiant',
    x: 11324,
    y: 12185,
    name: 'Radiant Mid Ranged Barracks',
    nameZh: '天辉中路远程兵营',
  },
  {
    id: 'radiant_bot_rax_melee',
    type: 'barracks',
    team: 'radiant',
    x: 12104,
    y: 10024,
    name: 'Radiant Bot Melee Barracks',
    nameZh: '天辉下路近战兵营',
  },
  {
    id: 'radiant_bot_rax_ranged',
    type: 'barracks',
    team: 'radiant',
    x: 12105,
    y: 10531,
    name: 'Radiant Bot Ranged Barracks',
    nameZh: '天辉下路远程兵营',
  },
  
  // ===============================
  // 夜魇 (Dire) 建筑
  // ===============================
  
  // 夜魇泉水
  {
    id: 'dire_fountain',
    type: 'fountain',
    team: 'dire',
    x: toCell(7100),   // 23484
    y: toCell(6500),   // 22884
    name: 'Dire Fountain',
    nameZh: '夜魇泉水',
  },
  
  // 夜魇遗迹 (基地)
  {
    id: 'dire_ancient',
    type: 'ancient',
    team: 'dire',
    x: 21912,
    y: 21384,
    name: 'Dire Ancient',
    nameZh: '夜魇遗迹',
  },
  
  // 夜魇防御塔 - 中路
  {
    id: 'dire_mid_t1',
    type: 'tower',
    team: 'dire',
    x: 16908,
    y: 17036,
    name: 'Dire Mid T1',
    nameZh: '夜魇中路一塔',
  },
  {
    id: 'dire_mid_t2',
    type: 'tower',
    team: 'dire',
    x: 18880,
    y: 18496,
    name: 'Dire Mid T2',
    nameZh: '夜魇中路二塔',
  },
  {
    id: 'dire_mid_t3',
    type: 'tower',
    team: 'dire',
    x: 20656,
    y: 20143,
    name: 'Dire Mid T3',
    nameZh: '夜魇中路三塔',
  },
  
  // 夜魇防御塔 - 上路 (顶路)
  {
    id: 'dire_top_t1',
    type: 'tower',
    team: 'dire',
    x: 11108.9375,
    y: 22312.438,
    name: 'Dire Top T1',
    nameZh: '夜魇上路一塔',
  },
  {
    id: 'dire_top_t2',
    type: 'tower',
    team: 'dire',
    x: 16256,
    y: 22400,
    name: 'Dire Top T2',
    nameZh: '夜魇上路二塔',
  },
  {
    id: 'dire_top_t3',
    type: 'tower',
    team: 'dire',
    x: 19936,
    y: 22160,
    name: 'Dire Top T3',
    nameZh: '夜魇上路三塔',
  },
  
  // 夜魇防御塔 - 下路 (底路)
  {
    id: 'dire_bot_t1',
    type: 'tower',
    team: 'dire',
    x: 22653.344,
    y: 14144,
    name: 'Dire Bot T1',
    nameZh: '夜魇下路一塔',
  },
  {
    id: 'dire_bot_t2',
    type: 'tower',
    team: 'dire',
    x: 22784,
    y: 16768,
    name: 'Dire Bot T2',
    nameZh: '夜魇下路二塔',
  },
  {
    id: 'dire_bot_t3',
    type: 'tower',
    team: 'dire',
    x: 22720,
    y: 19416,
    name: 'Dire Bot T3',
    nameZh: '夜魇下路三塔',
  },
  
  // 夜魇防御塔 - T4
  {
    id: 'dire_t4_top',
    type: 'tower',
    team: 'dire',
    x: 21328,
    y: 21160,
    name: 'Dire T4 Top',
    nameZh: '夜魇四塔(上)',
  },
  {
    id: 'dire_t4_bot',
    type: 'tower',
    team: 'dire',
    x: 21664,
    y: 20816,
    name: 'Dire T4 Bot',
    nameZh: '夜魇四塔(下)',
  },

  // 夜魇兵营
  {
    id: 'dire_top_rax_melee',
    type: 'barracks',
    team: 'dire',
    x: 20282.031,
    y: 21880,
    name: 'Dire Top Melee Barracks',
    nameZh: '夜魇上路近战兵营',
  },
  {
    id: 'dire_top_rax_ranged',
    type: 'barracks',
    team: 'dire',
    x: 20278,
    y: 22409,
    name: 'Dire Top Ranged Barracks',
    nameZh: '夜魇上路远程兵营',
  },
  {
    id: 'dire_mid_rax_melee',
    type: 'barracks',
    team: 'dire',
    x: 21086,
    y: 20208,
    name: 'Dire Mid Melee Barracks',
    nameZh: '夜魇中路近战兵营',
  },
  {
    id: 'dire_mid_rax_ranged',
    type: 'barracks',
    team: 'dire',
    x: 20720,
    y: 20567,
    name: 'Dire Mid Ranged Barracks',
    nameZh: '夜魇中路远程兵营',
  },
  {
    id: 'dire_bot_rax_melee',
    type: 'barracks',
    team: 'dire',
    x: 22976,
    y: 19776.031,
    name: 'Dire Bot Melee Barracks',
    nameZh: '夜魇下路近战兵营',
  },
  {
    id: 'dire_bot_rax_ranged',
    type: 'barracks',
    team: 'dire',
    x: 22448,
    y: 19760,
    name: 'Dire Bot Ranged Barracks',
    nameZh: '夜魇下路远程兵营',
  },
  
  // ===============================
  // 中立元素
  // ===============================
  
  // Roshan pits (7.33+)
  // 这里使用夜魇侧已验证坑位 + 关于地图中心的镜像，便于和动态昼夜状态对齐
  {
    id: 'roshan_dire',
    type: 'roshan',
    team: 'neutral',
    x: 17500,
    y: 19200,
    name: 'Roshan Pit (Dire Side)',
    nameZh: '肉山巢穴(夜魇侧)',
  },
  {
    id: 'roshan_radiant',
    type: 'roshan',
    team: 'neutral',
    x: 15268,
    y: 13568,
    name: 'Roshan Pit (Radiant Side)',
    nameZh: '肉山巢穴(天辉侧)',
  },
  
  // 前哨 (7.23+ 引入, 位置多次调整)
  {
    id: 'outpost_radiant',
    type: 'outpost',
    team: 'neutral', // 初始为中立
    x: toCell(-4000),  // 12384
    y: toCell(2000),   // 18384
    name: 'Radiant Outpost',
    nameZh: '天辉侧前哨',
  },
  {
    id: 'outpost_dire',
    type: 'outpost',
    team: 'neutral',
    x: toCell(3600),   // 19984
    y: toCell(-2200),  // 14184
    name: 'Dire Outpost',
    nameZh: '夜魇侧前哨',
  },
  
  // 赏金神符点 (4个角落)
  {
    id: 'rune_bounty_radiant_jungle',
    type: 'rune_bounty',
    team: 'neutral',
    x: toCell(-4300),  // 12084
    y: toCell(-3800),  // 12584
    name: 'Bounty Rune (Radiant Jungle)',
    nameZh: '赏金神符(天辉野区)',
  },
  {
    id: 'rune_bounty_dire_jungle',
    type: 'rune_bounty',
    team: 'neutral',
    x: toCell(4100),   // 20484
    y: toCell(3600),   // 19984
    name: 'Bounty Rune (Dire Jungle)',
    nameZh: '赏金神符(夜魇野区)',
  },
  {
    id: 'rune_bounty_radiant_offlane',
    type: 'rune_bounty',
    team: 'neutral',
    x: toCell(-5200),  // 11184
    y: toCell(2800),   // 19184
    name: 'Bounty Rune (Radiant Offlane)',
    nameZh: '赏金神符(天辉劣势路)',
  },
  {
    id: 'rune_bounty_dire_offlane',
    type: 'rune_bounty',
    team: 'neutral',
    x: toCell(4800),   // 21184
    y: toCell(-3000),  // 13384
    name: 'Bounty Rune (Dire Offlane)',
    nameZh: '赏金神符(夜魇劣势路)',
  },
  
  // 河道神符点 (Power Runes)
  // 从录像眼位数据推断:
  // - 上路神符区域: (13500-14500, 17500-18500)
  // - 下路神符区域: (18000-19500, 12500-13500)
  {
    id: 'rune_power_top',
    type: 'rune_power',
    team: 'neutral',
    x: 14000,   // 从眼位数据推断
    y: 18000,   // 上路河道
    name: 'Power Rune (Top)',
    nameZh: '河道神符(上)',
  },
  {
    id: 'rune_power_bot',
    type: 'rune_power',
    team: 'neutral',
    x: 18500,   // 从眼位数据推断
    y: 13000,   // 下路河道
    name: 'Power Rune (Bot)',
    nameZh: '河道神符(下)',
  },
  
  // 智慧神符点 (Wisdom Runes, 7.33+)
  {
    id: 'rune_wisdom_radiant',
    type: 'rune_wisdom',
    team: 'neutral',
    x: toCell(-5800),  // 10584
    y: toCell(-2600),  // 13784
    name: 'Wisdom Rune (Radiant)',
    nameZh: '智慧神符(天辉)',
  },
  {
    id: 'rune_wisdom_dire',
    type: 'rune_wisdom',
    team: 'neutral',
    x: toCell(5600),   // 21984
    y: toCell(2400),   // 18784
    name: 'Wisdom Rune (Dire)',
    nameZh: '智慧神符(夜魇)',
  },
  
  // 莲花池 (Lotus Pool, 7.33+)
  {
    id: 'lotus_pool_radiant',
    type: 'lotus_pool',
    team: 'neutral',
    x: toCell(-1800),  // 14584
    y: toCell(-600),   // 15784
    name: 'Lotus Pool (Radiant)',
    nameZh: '莲花池(天辉侧)',
  },
  {
    id: 'lotus_pool_dire',
    type: 'lotus_pool',
    team: 'neutral',
    x: toCell(1600),   // 17984
    y: toCell(400),    // 16784
    name: 'Lotus Pool (Dire)',
    nameZh: '莲花池(夜魇侧)',
  },
  
  // 折磨者 (Tormentor, 7.33+)
  {
    id: 'tormentor_radiant',
    type: 'tormentor',
    team: 'neutral',
    x: toCell(-6800),  // 9584
    y: toCell(-1200),  // 15184
    name: 'Tormentor (Radiant)',
    nameZh: '折磨者(天辉)',
  },
  {
    id: 'tormentor_dire',
    type: 'tormentor',
    team: 'neutral',
    x: toCell(6600),   // 22984
    y: toCell(1000),   // 17384
    name: 'Tormentor (Dire)',
    nameZh: '折磨者(夜魇)',
  },
  
  // 传送门 (Twin Gates, 7.33+)
  {
    id: 'portal_radiant',
    type: 'portal',
    team: 'neutral',
    x: toCell(-7200),  // 9184
    y: toCell(6600),   // 22984
    name: 'Portal (Radiant Side)',
    nameZh: '传送门(天辉侧)',
  },
  {
    id: 'portal_dire',
    type: 'portal',
    team: 'neutral',
    x: toCell(7000),   // 23384
    y: toCell(-6800),  // 9584
    name: 'Portal (Dire Side)',
    nameZh: '传送门(夜魇侧)',
  },
];

/**
 * 按类型获取地图元素
 */
export function getElementsByType(type: MapElementType): MapElement[] {
  return MAP_ELEMENTS.filter(e => e.type === type);
}

/**
 * 按队伍获取地图元素
 */
export function getElementsByTeam(team: Team): MapElement[] {
  return MAP_ELEMENTS.filter(e => e.team === team);
}

/**
 * 获取所有防御塔
 */
export function getTowers(): MapElement[] {
  return getElementsByType('tower');
}

/**
 * 获取所有神符点
 */
export function getRunes(): MapElement[] {
  return MAP_ELEMENTS.filter(e => 
    e.type === 'rune_bounty' || 
    e.type === 'rune_power' || 
    e.type === 'rune_wisdom'
  );
}

export function getMapElementById(id: string): MapElement | undefined {
  return MAP_ELEMENTS.find((element) => element.id === id);
}

export function getObjectiveMapElements(): MapElement[] {
  return MAP_ELEMENTS.filter((element) => OBJECTIVE_MAP_ELEMENT_TYPES.includes(element.type));
}

export default MAP_ELEMENTS;
