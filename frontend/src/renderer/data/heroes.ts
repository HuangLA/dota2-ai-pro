/**
 * Dota 2 英雄数据配置
 * 包含英雄 ID、内部名称、英文名、中文名和图片路径映射
 */

export interface HeroData {
  id: number;
  /** 内部名称 (不含 npc_dota_hero_ 前缀) */
  name: string;
  /** 英文显示名 */
  localizedName: string;
  /** 中文名 */
  chineseName: string;
  /** 主属性: str/agi/int/all */
  primaryAttr: string;
  /** 攻击类型: Melee/Ranged */
  attackType: string;
}

type HeroNameIndex = Map<string, HeroData>;

function normalizeHeroLookupKey(name: string): string {
  let normalized = name.trim();

  normalized = normalized.replace(/^npc_dota_hero_/i, '');
  normalized = normalized.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
  normalized = normalized.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  normalized = normalized.replace(/[\s-]+/g, '_');
  normalized = normalized.replace(/[^\p{L}\p{N}_]+/gu, '');
  normalized = normalized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');

  return normalized.toLowerCase();
}

function toCompactHeroLookupKey(name: string): string {
  return normalizeHeroLookupKey(name).replace(/_/g, '');
}

/**
 * 英雄数据映射表 (按 ID 索引)
 */
export const HEROES: Record<number, HeroData> = {
  1: { id: 1, name: 'antimage', localizedName: 'Anti-Mage', chineseName: '敌法师', primaryAttr: 'agi', attackType: 'Melee' },
  2: { id: 2, name: 'axe', localizedName: 'Axe', chineseName: '斧王', primaryAttr: 'str', attackType: 'Melee' },
  3: { id: 3, name: 'bane', localizedName: 'Bane', chineseName: '祸乱之源', primaryAttr: 'all', attackType: 'Ranged' },
  4: { id: 4, name: 'bloodseeker', localizedName: 'Bloodseeker', chineseName: '血魔', primaryAttr: 'agi', attackType: 'Melee' },
  5: { id: 5, name: 'crystal_maiden', localizedName: 'Crystal Maiden', chineseName: '水晶室女', primaryAttr: 'int', attackType: 'Ranged' },
  6: { id: 6, name: 'drow_ranger', localizedName: 'Drow Ranger', chineseName: '卓尔游侠', primaryAttr: 'agi', attackType: 'Ranged' },
  7: { id: 7, name: 'earthshaker', localizedName: 'Earthshaker', chineseName: '撼地者', primaryAttr: 'str', attackType: 'Melee' },
  8: { id: 8, name: 'juggernaut', localizedName: 'Juggernaut', chineseName: '主宰', primaryAttr: 'agi', attackType: 'Melee' },
  9: { id: 9, name: 'mirana', localizedName: 'Mirana', chineseName: '米拉娜', primaryAttr: 'agi', attackType: 'Ranged' },
  10: { id: 10, name: 'morphling', localizedName: 'Morphling', chineseName: '变体精灵', primaryAttr: 'agi', attackType: 'Ranged' },
  11: { id: 11, name: 'nevermore', localizedName: 'Shadow Fiend', chineseName: '影魔', primaryAttr: 'agi', attackType: 'Ranged' },
  12: { id: 12, name: 'phantom_lancer', localizedName: 'Phantom Lancer', chineseName: '幻影长矛手', primaryAttr: 'agi', attackType: 'Melee' },
  13: { id: 13, name: 'puck', localizedName: 'Puck', chineseName: '帕克', primaryAttr: 'int', attackType: 'Ranged' },
  14: { id: 14, name: 'pudge', localizedName: 'Pudge', chineseName: '帕吉', primaryAttr: 'str', attackType: 'Melee' },
  15: { id: 15, name: 'razor', localizedName: 'Razor', chineseName: '剃刀', primaryAttr: 'agi', attackType: 'Ranged' },
  16: { id: 16, name: 'sand_king', localizedName: 'Sand King', chineseName: '沙王', primaryAttr: 'all', attackType: 'Melee' },
  17: { id: 17, name: 'storm_spirit', localizedName: 'Storm Spirit', chineseName: '风暴之灵', primaryAttr: 'int', attackType: 'Ranged' },
  18: { id: 18, name: 'sven', localizedName: 'Sven', chineseName: '斯温', primaryAttr: 'str', attackType: 'Melee' },
  19: { id: 19, name: 'tiny', localizedName: 'Tiny', chineseName: '小小', primaryAttr: 'str', attackType: 'Melee' },
  20: { id: 20, name: 'vengefulspirit', localizedName: 'Vengeful Spirit', chineseName: '复仇之魂', primaryAttr: 'agi', attackType: 'Ranged' },
  21: { id: 21, name: 'windrunner', localizedName: 'Windranger', chineseName: '风行者', primaryAttr: 'all', attackType: 'Ranged' },
  22: { id: 22, name: 'zuus', localizedName: 'Zeus', chineseName: '宙斯', primaryAttr: 'int', attackType: 'Ranged' },
  23: { id: 23, name: 'kunkka', localizedName: 'Kunkka', chineseName: '昆卡', primaryAttr: 'str', attackType: 'Melee' },
  25: { id: 25, name: 'lina', localizedName: 'Lina', chineseName: '莉娜', primaryAttr: 'int', attackType: 'Ranged' },
  26: { id: 26, name: 'lion', localizedName: 'Lion', chineseName: '恶魔巫师', primaryAttr: 'int', attackType: 'Ranged' },
  27: { id: 27, name: 'shadow_shaman', localizedName: 'Shadow Shaman', chineseName: '暗影萨满', primaryAttr: 'int', attackType: 'Ranged' },
  28: { id: 28, name: 'slardar', localizedName: 'Slardar', chineseName: '斯拉达', primaryAttr: 'str', attackType: 'Melee' },
  29: { id: 29, name: 'tidehunter', localizedName: 'Tidehunter', chineseName: '潮汐猎人', primaryAttr: 'str', attackType: 'Melee' },
  30: { id: 30, name: 'witch_doctor', localizedName: 'Witch Doctor', chineseName: '巫医', primaryAttr: 'int', attackType: 'Ranged' },
  31: { id: 31, name: 'lich', localizedName: 'Lich', chineseName: '巫妖', primaryAttr: 'int', attackType: 'Ranged' },
  32: { id: 32, name: 'riki', localizedName: 'Riki', chineseName: '力丸', primaryAttr: 'agi', attackType: 'Melee' },
  33: { id: 33, name: 'enigma', localizedName: 'Enigma', chineseName: '谜团', primaryAttr: 'all', attackType: 'Ranged' },
  34: { id: 34, name: 'tinker', localizedName: 'Tinker', chineseName: '修补匠', primaryAttr: 'int', attackType: 'Ranged' },
  35: { id: 35, name: 'sniper', localizedName: 'Sniper', chineseName: '狙击手', primaryAttr: 'agi', attackType: 'Ranged' },
  36: { id: 36, name: 'necrolyte', localizedName: 'Necrophos', chineseName: '瘟疫法师', primaryAttr: 'int', attackType: 'Ranged' },
  37: { id: 37, name: 'warlock', localizedName: 'Warlock', chineseName: '术士', primaryAttr: 'int', attackType: 'Ranged' },
  38: { id: 38, name: 'beastmaster', localizedName: 'Beastmaster', chineseName: '兽王', primaryAttr: 'all', attackType: 'Melee' },
  39: { id: 39, name: 'queenofpain', localizedName: 'Queen of Pain', chineseName: '痛苦女王', primaryAttr: 'int', attackType: 'Ranged' },
  40: { id: 40, name: 'venomancer', localizedName: 'Venomancer', chineseName: '剧毒术士', primaryAttr: 'all', attackType: 'Ranged' },
  41: { id: 41, name: 'faceless_void', localizedName: 'Faceless Void', chineseName: '虚空假面', primaryAttr: 'agi', attackType: 'Melee' },
  42: { id: 42, name: 'skeleton_king', localizedName: 'Wraith King', chineseName: '冥魂大帝', primaryAttr: 'str', attackType: 'Melee' },
  43: { id: 43, name: 'death_prophet', localizedName: 'Death Prophet', chineseName: '死亡先知', primaryAttr: 'all', attackType: 'Ranged' },
  44: { id: 44, name: 'phantom_assassin', localizedName: 'Phantom Assassin', chineseName: '幻影刺客', primaryAttr: 'agi', attackType: 'Melee' },
  45: { id: 45, name: 'pugna', localizedName: 'Pugna', chineseName: '帕格纳', primaryAttr: 'int', attackType: 'Ranged' },
  46: { id: 46, name: 'templar_assassin', localizedName: 'Templar Assassin', chineseName: '圣堂刺客', primaryAttr: 'agi', attackType: 'Ranged' },
  47: { id: 47, name: 'viper', localizedName: 'Viper', chineseName: '冥界亚龙', primaryAttr: 'agi', attackType: 'Ranged' },
  48: { id: 48, name: 'luna', localizedName: 'Luna', chineseName: '露娜', primaryAttr: 'agi', attackType: 'Ranged' },
  49: { id: 49, name: 'dragon_knight', localizedName: 'Dragon Knight', chineseName: '龙骑士', primaryAttr: 'str', attackType: 'Melee' },
  50: { id: 50, name: 'dazzle', localizedName: 'Dazzle', chineseName: '戴泽', primaryAttr: 'all', attackType: 'Ranged' },
  51: { id: 51, name: 'rattletrap', localizedName: 'Clockwerk', chineseName: '发条技师', primaryAttr: 'str', attackType: 'Melee' },
  52: { id: 52, name: 'leshrac', localizedName: 'Leshrac', chineseName: '拉席克', primaryAttr: 'int', attackType: 'Ranged' },
  53: { id: 53, name: 'furion', localizedName: "Nature's Prophet", chineseName: '先知', primaryAttr: 'all', attackType: 'Ranged' },
  54: { id: 54, name: 'life_stealer', localizedName: 'Lifestealer', chineseName: '噬魂鬼', primaryAttr: 'str', attackType: 'Melee' },
  55: { id: 55, name: 'dark_seer', localizedName: 'Dark Seer', chineseName: '黑暗贤者', primaryAttr: 'int', attackType: 'Melee' },
  56: { id: 56, name: 'clinkz', localizedName: 'Clinkz', chineseName: '克林克兹', primaryAttr: 'agi', attackType: 'Ranged' },
  57: { id: 57, name: 'omniknight', localizedName: 'Omniknight', chineseName: '全能骑士', primaryAttr: 'str', attackType: 'Melee' },
  58: { id: 58, name: 'enchantress', localizedName: 'Enchantress', chineseName: '魅惑魔女', primaryAttr: 'int', attackType: 'Ranged' },
  59: { id: 59, name: 'huskar', localizedName: 'Huskar', chineseName: '哈斯卡', primaryAttr: 'str', attackType: 'Ranged' },
  60: { id: 60, name: 'night_stalker', localizedName: 'Night Stalker', chineseName: '暗夜魔王', primaryAttr: 'str', attackType: 'Melee' },
  61: { id: 61, name: 'broodmother', localizedName: 'Broodmother', chineseName: '育母蜘蛛', primaryAttr: 'agi', attackType: 'Melee' },
  62: { id: 62, name: 'bounty_hunter', localizedName: 'Bounty Hunter', chineseName: '赏金猎人', primaryAttr: 'agi', attackType: 'Melee' },
  63: { id: 63, name: 'weaver', localizedName: 'Weaver', chineseName: '编织者', primaryAttr: 'agi', attackType: 'Ranged' },
  64: { id: 64, name: 'jakiro', localizedName: 'Jakiro', chineseName: '杰奇洛', primaryAttr: 'int', attackType: 'Ranged' },
  65: { id: 65, name: 'batrider', localizedName: 'Batrider', chineseName: '蝙蝠骑士', primaryAttr: 'all', attackType: 'Ranged' },
  66: { id: 66, name: 'chen', localizedName: 'Chen', chineseName: '陈', primaryAttr: 'int', attackType: 'Ranged' },
  67: { id: 67, name: 'spectre', localizedName: 'Spectre', chineseName: '幽鬼', primaryAttr: 'agi', attackType: 'Melee' },
  68: { id: 68, name: 'ancient_apparition', localizedName: 'Ancient Apparition', chineseName: '远古冰魄', primaryAttr: 'int', attackType: 'Ranged' },
  69: { id: 69, name: 'doom_bringer', localizedName: 'Doom', chineseName: '末日使者', primaryAttr: 'str', attackType: 'Melee' },
  70: { id: 70, name: 'ursa', localizedName: 'Ursa', chineseName: '熊战士', primaryAttr: 'agi', attackType: 'Melee' },
  71: { id: 71, name: 'spirit_breaker', localizedName: 'Spirit Breaker', chineseName: '裂魂人', primaryAttr: 'str', attackType: 'Melee' },
  72: { id: 72, name: 'gyrocopter', localizedName: 'Gyrocopter', chineseName: '矮人直升机', primaryAttr: 'agi', attackType: 'Ranged' },
  73: { id: 73, name: 'alchemist', localizedName: 'Alchemist', chineseName: '炼金术士', primaryAttr: 'str', attackType: 'Melee' },
  74: { id: 74, name: 'invoker', localizedName: 'Invoker', chineseName: '祈求者', primaryAttr: 'int', attackType: 'Ranged' },
  75: { id: 75, name: 'silencer', localizedName: 'Silencer', chineseName: '沉默术士', primaryAttr: 'int', attackType: 'Ranged' },
  76: { id: 76, name: 'obsidian_destroyer', localizedName: 'Outworld Destroyer', chineseName: '殁境神蚀者', primaryAttr: 'int', attackType: 'Ranged' },
  77: { id: 77, name: 'lycan', localizedName: 'Lycan', chineseName: '狼人', primaryAttr: 'str', attackType: 'Melee' },
  78: { id: 78, name: 'brewmaster', localizedName: 'Brewmaster', chineseName: '酒仙', primaryAttr: 'all', attackType: 'Melee' },
  79: { id: 79, name: 'shadow_demon', localizedName: 'Shadow Demon', chineseName: '暗影恶魔', primaryAttr: 'int', attackType: 'Ranged' },
  80: { id: 80, name: 'lone_druid', localizedName: 'Lone Druid', chineseName: '德鲁伊', primaryAttr: 'agi', attackType: 'Ranged' },
  81: { id: 81, name: 'chaos_knight', localizedName: 'Chaos Knight', chineseName: '混沌骑士', primaryAttr: 'str', attackType: 'Melee' },
  82: { id: 82, name: 'meepo', localizedName: 'Meepo', chineseName: '米波', primaryAttr: 'agi', attackType: 'Melee' },
  83: { id: 83, name: 'treant', localizedName: 'Treant Protector', chineseName: '树精卫士', primaryAttr: 'str', attackType: 'Melee' },
  84: { id: 84, name: 'ogre_magi', localizedName: 'Ogre Magi', chineseName: '食人魔魔法师', primaryAttr: 'str', attackType: 'Melee' },
  85: { id: 85, name: 'undying', localizedName: 'Undying', chineseName: '不朽尸王', primaryAttr: 'str', attackType: 'Melee' },
  86: { id: 86, name: 'rubick', localizedName: 'Rubick', chineseName: '拉比克', primaryAttr: 'int', attackType: 'Ranged' },
  87: { id: 87, name: 'disruptor', localizedName: 'Disruptor', chineseName: '干扰者', primaryAttr: 'int', attackType: 'Ranged' },
  88: { id: 88, name: 'nyx_assassin', localizedName: 'Nyx Assassin', chineseName: '司夜刺客', primaryAttr: 'all', attackType: 'Melee' },
  89: { id: 89, name: 'naga_siren', localizedName: 'Naga Siren', chineseName: '娜迦海妖', primaryAttr: 'agi', attackType: 'Melee' },
  90: { id: 90, name: 'keeper_of_the_light', localizedName: 'Keeper of the Light', chineseName: '光之守卫', primaryAttr: 'int', attackType: 'Ranged' },
  91: { id: 91, name: 'wisp', localizedName: 'Io', chineseName: '艾欧', primaryAttr: 'all', attackType: 'Ranged' },
  92: { id: 92, name: 'visage', localizedName: 'Visage', chineseName: '维萨吉', primaryAttr: 'all', attackType: 'Ranged' },
  93: { id: 93, name: 'slark', localizedName: 'Slark', chineseName: '斯拉克', primaryAttr: 'agi', attackType: 'Melee' },
  94: { id: 94, name: 'medusa', localizedName: 'Medusa', chineseName: '美杜莎', primaryAttr: 'agi', attackType: 'Ranged' },
  95: { id: 95, name: 'troll_warlord', localizedName: 'Troll Warlord', chineseName: '巨魔战将', primaryAttr: 'agi', attackType: 'Ranged' },
  96: { id: 96, name: 'centaur', localizedName: 'Centaur Warrunner', chineseName: '半人马战行者', primaryAttr: 'str', attackType: 'Melee' },
  97: { id: 97, name: 'magnataur', localizedName: 'Magnus', chineseName: '马格纳斯', primaryAttr: 'all', attackType: 'Melee' },
  98: { id: 98, name: 'shredder', localizedName: 'Timbersaw', chineseName: '伐木机', primaryAttr: 'str', attackType: 'Melee' },
  99: { id: 99, name: 'bristleback', localizedName: 'Bristleback', chineseName: '钢背兽', primaryAttr: 'str', attackType: 'Melee' },
  100: { id: 100, name: 'tusk', localizedName: 'Tusk', chineseName: '巨牙海民', primaryAttr: 'str', attackType: 'Melee' },
  101: { id: 101, name: 'skywrath_mage', localizedName: 'Skywrath Mage', chineseName: '天怒法师', primaryAttr: 'int', attackType: 'Ranged' },
  102: { id: 102, name: 'abaddon', localizedName: 'Abaddon', chineseName: '亚巴顿', primaryAttr: 'all', attackType: 'Melee' },
  103: { id: 103, name: 'elder_titan', localizedName: 'Elder Titan', chineseName: '上古巨神', primaryAttr: 'str', attackType: 'Melee' },
  104: { id: 104, name: 'legion_commander', localizedName: 'Legion Commander', chineseName: '军团指挥官', primaryAttr: 'str', attackType: 'Melee' },
  105: { id: 105, name: 'techies', localizedName: 'Techies', chineseName: '工程师', primaryAttr: 'all', attackType: 'Ranged' },
  106: { id: 106, name: 'ember_spirit', localizedName: 'Ember Spirit', chineseName: '灰烬之灵', primaryAttr: 'agi', attackType: 'Melee' },
  107: { id: 107, name: 'earth_spirit', localizedName: 'Earth Spirit', chineseName: '大地之灵', primaryAttr: 'str', attackType: 'Melee' },
  108: { id: 108, name: 'abyssal_underlord', localizedName: 'Underlord', chineseName: '孽主', primaryAttr: 'str', attackType: 'Melee' },
  109: { id: 109, name: 'terrorblade', localizedName: 'Terrorblade', chineseName: '恐怖利刃', primaryAttr: 'agi', attackType: 'Melee' },
  110: { id: 110, name: 'phoenix', localizedName: 'Phoenix', chineseName: '凤凰', primaryAttr: 'str', attackType: 'Ranged' },
  111: { id: 111, name: 'oracle', localizedName: 'Oracle', chineseName: '神谕者', primaryAttr: 'int', attackType: 'Ranged' },
  112: { id: 112, name: 'winter_wyvern', localizedName: 'Winter Wyvern', chineseName: '寒冬飞龙', primaryAttr: 'int', attackType: 'Ranged' },
  113: { id: 113, name: 'arc_warden', localizedName: 'Arc Warden', chineseName: '天穹守望者', primaryAttr: 'all', attackType: 'Ranged' },
  114: { id: 114, name: 'monkey_king', localizedName: 'Monkey King', chineseName: '齐天大圣', primaryAttr: 'agi', attackType: 'Melee' },
  119: { id: 119, name: 'dark_willow', localizedName: 'Dark Willow', chineseName: '邪影芳灵', primaryAttr: 'int', attackType: 'Ranged' },
  120: { id: 120, name: 'pangolier', localizedName: 'Pangolier', chineseName: '石鳞剑士', primaryAttr: 'all', attackType: 'Melee' },
  121: { id: 121, name: 'grimstroke', localizedName: 'Grimstroke', chineseName: '天涯墨客', primaryAttr: 'int', attackType: 'Ranged' },
  123: { id: 123, name: 'hoodwink', localizedName: 'Hoodwink', chineseName: '森海飞霞', primaryAttr: 'agi', attackType: 'Ranged' },
  126: { id: 126, name: 'void_spirit', localizedName: 'Void Spirit', chineseName: '虚无之灵', primaryAttr: 'all', attackType: 'Melee' },
  128: { id: 128, name: 'snapfire', localizedName: 'Snapfire', chineseName: '电炎绝手', primaryAttr: 'all', attackType: 'Ranged' },
  129: { id: 129, name: 'mars', localizedName: 'Mars', chineseName: '玛尔斯', primaryAttr: 'str', attackType: 'Melee' },
  131: { id: 131, name: 'ringmaster', localizedName: 'Ringmaster', chineseName: '马戏团长', primaryAttr: 'int', attackType: 'Ranged' },
  135: { id: 135, name: 'dawnbreaker', localizedName: 'Dawnbreaker', chineseName: '破晓辰星', primaryAttr: 'str', attackType: 'Melee' },
  136: { id: 136, name: 'marci', localizedName: 'Marci', chineseName: '玛西', primaryAttr: 'all', attackType: 'Melee' },
  137: { id: 137, name: 'primal_beast', localizedName: 'Primal Beast', chineseName: '獸', primaryAttr: 'str', attackType: 'Melee' },
  138: { id: 138, name: 'muerta', localizedName: 'Muerta', chineseName: '琼英碧灵', primaryAttr: 'int', attackType: 'Ranged' },
  145: { id: 145, name: 'kez', localizedName: 'Kez', chineseName: '凯斯', primaryAttr: 'agi', attackType: 'Melee' },
  155: { id: 155, name: 'largo', localizedName: 'Largo', chineseName: '拉尔戈', primaryAttr: 'str', attackType: 'Melee' },
};

const HERO_NAME_INDEX: HeroNameIndex = (() => {
  const index: HeroNameIndex = new Map();

  for (const hero of Object.values(HEROES)) {
    const seeds = [
      hero.name,
      hero.localizedName,
      hero.chineseName,
      `npc_dota_hero_${hero.name}`,
    ];

    for (const seed of seeds) {
      const normalized = normalizeHeroLookupKey(seed);
      if (normalized) {
        index.set(normalized, hero);
      }

      const compact = toCompactHeroLookupKey(seed);
      if (compact) {
        index.set(compact, hero);
      }
    }
  }

  return index;
})();

/**
 * 根据英雄 ID 获取英雄数据
 */
export function getHeroById(id: number): HeroData | undefined {
  return HEROES[id];
}

/**
 * 根据英雄内部名称获取英雄数据
 */
export function getHeroByName(name: string): HeroData | undefined {
  if (!name?.trim()) {
    return undefined;
  }

  const normalized = normalizeHeroLookupKey(name);
  if (normalized) {
    const byNormalized = HERO_NAME_INDEX.get(normalized);
    if (byNormalized) {
      return byNormalized;
    }
  }

  const compact = toCompactHeroLookupKey(name);
  if (compact) {
    return HERO_NAME_INDEX.get(compact);
  }

  return undefined;
}

/**
 * 获取英雄的 minimap 图标 URL
 * 优先使用本地资源，fallback 到 Steam CDN
 */
export function getHeroIconUrl(heroId: number): string {
  const hero = HEROES[heroId];
  if (!hero) {
    return '/assets/dota/heroes/default.png';
  }
  // 本地资源路径
  return `/assets/dota/heroes/icons/${hero.name}.png`;
}

/**
 * 获取英雄的头像 URL (用于 UI 显示)
 */
export function getHeroPortraitUrl(heroId: number): string {
  const hero = HEROES[heroId];
  if (!hero) {
    return '/assets/dota/heroes/default.png';
  }
  return `/assets/dota/heroes/${hero.name}.png`;
}

/**
 * Steam CDN 英雄图片 URL (备用)
 */
export function getSteamHeroIconUrl(heroId: number): string {
  const hero = HEROES[heroId];
  if (!hero) {
    return '';
  }
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${hero.name}.png`;
}

export function getSteamHeroPortraitUrl(heroId: number): string {
  const hero = HEROES[heroId];
  if (!hero) {
    return '';
  }
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${hero.name}.png`;
}

/**
 * 获取所有英雄列表
 */
export function getAllHeroes(): HeroData[] {
  return Object.values(HEROES).sort((a, b) => a.id - b.id);
}

/**
 * 根据阵营获取英雄颜色
 */
export function getTeamColor(team: 'radiant' | 'dire'): number {
  return team === 'radiant' ? 0x3fca4c : 0xf44336;
}
