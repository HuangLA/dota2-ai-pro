import { buildApiUrl } from '../api/apiBase';
import itemTooltipSource from './itemTooltipData.generated.json';

type RawTooltipAttrib = {
  key: string;
  value: string;
  display: string | null;
};

type RawTooltipAbility = {
  type: string;
  title: string;
  description: string;
};

type RawTooltipEntry = {
  dname: string | null;
  attrib: RawTooltipAttrib[];
  abilities: RawTooltipAbility[];
  desc: string | null;
  notes: string | null;
  hint: string[];
  lore: string | null;
  mc: number | null;
  cd: number | null;
  cost: number | null;
  tier: number | null;
};

export interface LocalizedTooltipAbility {
  typeLabel: string;
  title: string;
  summary: string | null;
}

export interface LocalizedItemTooltip {
  normalizedName: string;
  name: string;
  categoryLabel: string;
  tierLabel: string | null;
  costLabel: string | null;
  manaCostLabel: string | null;
  cooldownLabel: string | null;
  attributes: string[];
  abilities: LocalizedTooltipAbility[];
  notes: string[];
  lore: string | null;
  enhancement: LocalizedItemTooltip | null;
}

const RAW_ITEM_TOOLTIPS = itemTooltipSource as Record<string, RawTooltipEntry>;

const ITEM_ALIASES: Record<string, string> = {
  aghanims_scepter: 'ultimate_scepter',
  aghanims_blessing: 'ultimate_scepter_roshan',
  aegis_of_the_immortal: 'aegis',
  ancient_janggo: 'drum_of_endurance',
  blink_dagger: 'blink',
  boots_of_travel: 'travel_boots',
  boots_of_travel_2: 'travel_boots_2',
  boots_of_speed: 'boots',
  dust_of_appearance: 'dust',
  dustof_appearance: 'dust',
  empty_bottle: 'bottle',
  guardian_shell: 'defiant_shell',
  greater_critical: 'greater_crit',
  lesser_critical: 'lesser_crit',
  observer_ward: 'ward_observer',
  robe_of_magi: 'robe',
  robe_of_the_magi: 'robe',
  sentry_ward: 'ward_sentry',
  ironwood_branch: 'branches',
  teleport_scroll: 'tpscroll',
  dagon_upgraded: 'dagon',
  planeswalkers_cloak: 'cloak',
  power_treads_agi: 'power_treads',
  power_treads_int: 'power_treads',
  power_treads_str: 'power_treads',
  smoke: 'smoke_of_deceit',
};

const ITEM_LABEL_OVERRIDES: Record<string, string> = {
  branches: 'Iron Branch',
  greater_crit: 'Daedalus',
  lesser_crit: 'Crystalys',
  robe: 'Robe of the Magi',
  tpscroll: 'Town Portal Scroll',
  ward_observer: 'Observer Ward',
  ward_sentry: 'Sentry Ward',
};

const ITEM_ZH_NAME_OVERRIDES: Record<string, string> = {
  aegis: '不朽盾',
  arcane_boots: '奥术鞋',
  armlet: '莫尔迪基安的臂章',
  belt_of_strength: '力量腰带',
  black_king_bar: '黑皇杖',
  blink: '闪烁匕首',
  blade_mail: '刃甲',
  blood_grenade: '血腥榴弹',
  bottle: '魔瓶',
  boots: '速度之靴',
  bracer: '护腕',
  branches: '铁树枝干',
  circlet: '圆环',
  clarity: '净化药水',
  cloak: '抗魔斗篷',
  cyclone: 'Eul神杖',
  dagon: '达贡之神力',
  defiant_shell: '不屈之壳',
  desolator: '黯灭',
  diadem: '王冠',
  dragon_lance: '魔龙枪',
  dust: '显影之尘',
  dust_of_appearance: '显影之尘',
  duelist_gloves: '决斗家手套',
  enchanted_mango: '魔芒果',
  essence_ring: '精华指环',
  faerie_fire: '仙灵之火',
  falcon_blade: '猎鹰战刃',
  famango: '巨型芒果',
  flask: '治疗药膏',
  force_staff: '原力法杖',
  gauntlets: '力量手套',
  gem_of_true_sight: '真视宝石',
  glimmer_cape: '微光披风',
  greater_crit: '代达罗斯之殇',
  guardian_greaves: '卫士胫甲',
  gunpowder_gauntlets: '火药拳套',
  infused_raindrop: '凝魂之露',
  jidi_pollen_bag: '极地花粉袋',
  kaya_and_sange: '慧光散华',
  kobold_cup: '狗头人酒杯',
  lesser_crit: '水晶剑',
  magic_wand: '魔杖',
  magic_stick: '魔棒',
  mana_draught: '法力药剂',
  meteor_hammer: '陨星锤',
  mithril_hammer: '秘银锤',
  mjollnir: '雷神之锤',
  null_talisman: '空灵挂件',
  ogre_axe: '食人魔之斧',
  occult_bracelet: '秘术臂环',
  octarine_core: '玲珑心',
  phase_boots: '相位鞋',
  pipe: '洞察烟斗',
  point_booster: '精气之球',
  pogo_stick: '弹跳杆',
  polliwog_charm: '蝌蚪护符',
  poor_mans_shield: '穷鬼盾',
  power_treads: '动力鞋',
  psychic_headband: '灵能头带',
  quelling_blade: '补刀斧',
  recipe: '配方',
  robe: '法师长袍',
  searing_signet: '灼烧印记',
  sentry_ward: '岗哨守卫',
  serrated_shiv: '锯齿短刃',
  shadow_amulet: '暗影护符',
  shivas_guard: '希瓦的守护',
  silver_edge: '白银之锋',
  smoke_of_deceit: '诡计之雾',
  sobi_mask: '贤者面罩',
  soul_ring: '灵魂之戒',
  tango: '树之祭祀',
  staff_of_wizardry: '魔力法杖',
  tpscroll: '回城卷轴',
  titan_sliver: '泰坦碎片',
  tranquil_boots: '静谧之鞋',
  travel_boots: '远行鞋',
  travel_boots_2: '远行鞋 2',
  ultimate_orb: '极限法球',
  ultimate_scepter: '阿哈利姆神杖',
  ultimate_scepter_roshan: '阿哈利姆神杖福佑',
  unrelenting_eye: '不屈之眼',
  ward_dispenser: '守卫补给包',
  ward_observer: '侦察守卫',
  whisper_of_the_dread: '恐惧低语',
  wind_lace: '风灵之纹',
  wraith_band: '怨灵系带',
  enhancement_alert: '警觉',
  enhancement_audacious: '无畏',
  enhancement_boundless: '无垠',
  enhancement_brawny: '勇武',
  enhancement_crude: '粗犷',
  enhancement_curious: '求知',
  enhancement_dominant: '统御',
  enhancement_evolved: '进化',
  enhancement_feverish: '狂热',
  enhancement_fierce: '凶猛',
  enhancement_fleetfooted: '迅足',
  enhancement_greedy: '贪婪',
  enhancement_keen_eyed: '鹰眼',
  enhancement_mystical: '神秘',
  enhancement_quickened: '迅捷',
  enhancement_restorative: '复苏',
  enhancement_thick: '厚实',
  enhancement_timeless: '永恒',
  enhancement_titanic: '泰坦',
  enhancement_tough: '坚韧',
  enhancement_vampiric: '吸血',
  enhancement_vast: '辽阔',
  enhancement_wise: '贤者',
};

const ABILITY_TYPE_LABELS: Record<string, string> = {
  active: '主动',
  passive: '被动',
  toggle: '切换',
  use: '使用',
  upgrade: '升级',
  text: '效果',
};

const ABILITY_TITLE_OVERRIDES: Record<string, string> = {
  blink: '闪烁',
  reciprocity: '反击',
  life_essence: '生命精华',
  ribbit: '呱鸣',
  cooldown_reduction: '冷却缩减',
  damage_return: '伤害反弹',
};

const ATTRIBUTE_TEMPLATE_OVERRIDES: Record<string, (value: string) => string> = {
  blink_range: (value) => `最远闪烁距离 ${value}`,
  blink_damage_cooldown: (value) => `受伤后 ${value} 秒内无法使用`,
  blink_range_clamp: (value) => `近距离施放时实际位移上限 ${value}`,
  bonus_xpm: (value) => `每分钟额外经验 ${value}`,
  shield: (value) => `伤害护盾 ${value}`,
  restore_time: (value) => `恢复时间 ${value} 秒`,
  vision_penalty: (value) => `白天视野降低 ${value}%`,
  bonus_spell_damage: (value) => `技能伤害提高 ${value}%`,
  max_health: (value) => `最大生命固定为 ${value}`,
  debuff_self: (value) => `自身额外承受伤害 ${value}%`,
  debuff_enemy: (value) => `目标额外承受伤害 ${value}%`,
  debuff_enemy_duration: (value) => `效果持续 ${value} 秒`,
  distance: (value) => `触发距离 ${value}`,
  damage_reduction: (value) => `伤害减免 ${value}%`,
  attack_lifesteal: (value) => `攻击吸血 ${value}%`,
  spell_lifesteal: (value) => `技能吸血 ${value}%`,
  creep_lifesteal_reduction_pct: (value) => `对非英雄吸血效率 ${value}%`,
  heal_reduction: (value) => `治疗削弱 ${value}%`,
  duration: (value) => `持续时间 ${value} 秒`,
  flight_threshold: (value) => `生命低于 ${value}% 时获得飞行移动`,
  bonus_mana: (value) => `额外魔法值 ${value}`,
  bonus_hp_regen: (value) => `额外生命恢复 ${value}`,
  bonus_damage: (value) => `攻击力 +${value}`,
  bonus_attack_speed: (value) => `攻击速度 +${value}`,
  bonus_attack_range: (value) => `攻击距离 +${value}`,
  bonus_cast_range: (value) => `施法距离 +${value}`,
  mana_regen: (value) => `魔法恢复 +${value}`,
  health_regen: (value) => `生命恢复 +${value}`,
  health_bonus: (value) => `生命值 +${value}`,
  bonus_night_vision: (value) => `夜间视野 +${value}`,
  armor: (value) => `护甲 +${value}`,
  movespeed: (value) => `移动速度 +${value}`,
  move_speed: (value) => `移动速度 +${value}`,
  magic_res: (value) => `魔法抗性 +${value}%`,
  magic_resist: (value) => `魔法抗性 +${value}%`,
  attack_speed: (value) => `攻击速度 +${value}`,
  magic_damage: (value) => `魔法攻击伤害 +${value}`,
  incoming_damage: (value) => `承受伤害 +${value}%`,
  slow_resist: (value) => `减速抗性 +${value}%`,
  radius: (value) => `范围 ${value}`,
  evasion: (value) => `闪避 +${value}%`,
  max_mana_pct: (value) => `最大魔法值 +${value}%`,
  intelligence_pct: (value) => `智力 ${value}%`,
  bonus_intellect: (value) => `智力 +${value}`,
  bonus_int: (value) => `智力 +${value}`,
  mp_regen: (value) => `魔法恢复 +${value}`,
  health_gain: (value) => `当前生命值与最大生命值 +${value}`,
  health_gain_duration: (value) => `效果持续 ${value} 秒`,
  regen_boost: (value) => `生命恢复 +${value}`,
  water_movespeed: (value) => `站在水中时移动速度 +${value}%`,
  counter_damage: (value) => `反击伤害为普通攻击的 ${value}%`,
  movement_speed: (value) => `移动速度 +${value}`,
  max_mana: (value) => `魔法值 +${value}`,
  bonus_all_stats: (value) => `全属性 +${value}`,
  bonus_strength: (value) => `力量 +${value}`,
  bonus_agility: (value) => `敏捷 +${value}`,
  bonus_cooldown: (value) => `冷却缩减 +${value}%`,
  bonus_health: (value) => `生命值 +${value}`,
  bonus_mana_regen: (value) => `魔法恢复 +${value}`,
  bonus_armor: (value) => `护甲 +${value}`,
  passive_reflection_constant: (value) => `基础反弹伤害 ${value}`,
  passive_reflection_pct: (value) => `额外反弹本次攻击伤害的 ${value}%`,
  active_reflection_pct: (value) => `主动反弹伤害额外提高 ${value}%`,
};

const ATTRIBUTE_LABEL_OVERRIDES: Record<string, string> = {
  extra_bonus_damage: '额外攻击力',
  bonus_damage: '攻击力',
  blink_range: '闪烁距离',
  blink_damage_cooldown: '受伤禁用时间',
  blink_range_clamp: '最远位移上限',
  bonus_xpm: '额外经验',
  shield: '护盾',
  restore_time: '恢复时间',
  vision_penalty: '视野惩罚',
  bonus_spell_damage: '技能伤害',
  max_health: '最大生命',
  distance: '距离',
  damage_reduction: '伤害减免',
  attack_lifesteal: '攻击吸血',
  spell_lifesteal: '技能吸血',
  creep_lifesteal_reduction_pct: '非英雄吸血效率',
  heal_reduction: '治疗削弱',
  duration: '持续时间',
  flight_threshold: '飞行阈值',
  bonus_mana: '额外魔法值',
  bonus_hp_regen: '额外生命恢复',
  bonus_attack_range: '攻击距离',
  bonus_cast_range: '施法距离',
  bonus_night_vision: '夜间视野',
  magic_damage: '魔法攻击伤害',
  incoming_damage: '承受伤害',
  slow_resist: '减速抗性',
  bonus_intellect: '智力',
  bonus_int: '智力',
  mp_regen: '魔法恢复',
  health_gain: '生命值增幅',
  health_gain_duration: '持续时间',
  regen_boost: '生命恢复',
  water_movespeed: '水域移动速度',
  counter_damage: '反击伤害',
  movement_speed: '移动速度',
  max_mana: '魔法值',
  bonus_all_stats: '全属性',
  bonus_strength: '力量',
  bonus_agility: '敏捷',
  bonus_cooldown: '冷却缩减',
  bonus_health: '生命值',
  bonus_mana_regen: '魔法恢复',
  bonus_armor: '护甲',
  passive_reflection_constant: '基础反弹伤害',
  passive_reflection_pct: '反弹攻击伤害比例',
  active_reflection_pct: '主动反弹增幅',
};

const EXACT_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Teleport to a target point up to ([\d.]+) units away\./gi, '闪烁到最远 $1 距离外的目标点。'],
  [
    /Blink Dagger cannot be used for ([\d.]+) seconds after taking damage from an enemy hero or Roshan\./gi,
    '在受到敌方英雄或肉山伤害后的 $1 秒内无法使用。',
  ],
  [
    /Equipped Hero has their daytime vision reduced by ([\d.]+)% but their Spell damage increased by ([\d.]+)%\./gi,
    '装备英雄白天视野降低 $1%，但技能伤害提高 $2%。',
  ],
  [
    /Equipped Hero has a ([\d.]+) HP Barrier against enemy damage\./gi,
    '装备英雄获得可抵挡敌方伤害的 $1 点护盾。',
  ],
  [
    /Barrier fully regenerates after not receiving damage for ([\d.]+) seconds\./gi,
    '在 $1 秒未受伤后，护盾会完全恢复。',
  ],
  [
    /When attacking a hero, apply a debuff increasing the damage received by that hero by ([\d.]+)% for ([\d.]+) seconds\./gi,
    '攻击英雄时会施加减益，使其额外承受 $1% 伤害，持续 $2 秒。',
  ],
  [
    /When attacked, the hero counter-attacks a target within their attack range for ([\d.]+)% of their regular attack damage\./gi,
    '受到攻击时，会自动反击攻击距离内的一名目标，造成相当于普通攻击 $1% 的伤害。',
  ],
  [
    /Increases your current and max health by ([\d.]+) for ([\d.]+) seconds\./gi,
    '使当前生命值和最大生命值提高 $1，持续 $2 秒。',
  ],
  [
    /Increases the health regeneration of a target ally by ([\d.]+) for ([\d.]+) seconds\./gi,
    '使目标友军的生命恢复提高 $1，持续 $2 秒。',
  ],
  [
    /While standing in water, the blessed unit also moves ([\d.]+)% faster\./gi,
    '如果目标站在水中，还会额外获得 $1% 的移动速度。',
  ],
  [
    /Self-casting will cause you to teleport in the direction of your team's fountain\./gi,
    '对自身施放时，会朝己方泉水方向闪烁。',
  ],
  [
    /For ([\d.]+) seconds, return all incoming damage, increasing the percentage by ([\d.]+)%\./gi,
    '在 $1 秒内反弹所受的全部伤害，并将反弹比例额外提高 $2%。',
  ],
  [
    /Everytime you are attacked, you return ([\d.]+) damage plus ([\d.]+)% of the attack damage dealt to you\./gi,
    '每次受到攻击时，都会反弹 $1 点伤害，并额外反弹本次攻击伤害的 $2%。',
  ],
];

const TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bAttack Range \(Melee & Ranged\)\b/gi, '攻击距离（近战与远程）'],
  [/\bMagic Attack Damage\b/gi, '魔法攻击伤害'],
  [/\bBonus Night Vision\b/gi, '额外夜间视野'],
  [/\bMana Regeneration\b/gi, '魔法恢复'],
  [/\bHealth Regeneration\b/gi, '生命恢复'],
  [/\bMagic Resistance\b/gi, '魔法抗性'],
  [/\bMovement Speed\b/gi, '移动速度'],
  [/\bAttack Speed\b/gi, '攻击速度'],
  [/\bSpell Damage\b/gi, '技能伤害'],
  [/\bCast Range\b/gi, '施法距离'],
  [/\bAttack Range\b/gi, '攻击距离'],
  [/\bAll Attributes\b/gi, '全属性'],
  [/\bCooldown Reduction\b/gi, '冷却缩减'],
  [/\bIncoming Damage\b/gi, '承受伤害'],
  [/\bSlow Resistance\b/gi, '减速抗性'],
  [/\bMax Mana Bonus\b/gi, '最大魔法值加成'],
  [/\bHealth\b/gi, '生命值'],
  [/\bDamage\b/gi, '攻击力'],
  [/\bArmor\b/gi, '护甲'],
  [/\bStrength\b/gi, '力量'],
  [/\bAgility\b/gi, '敏捷'],
  [/\bIntelligence\b/gi, '智力'],
  [/\bBarrier\b/gi, '护盾'],
  [/\bdaytime vision\b/gi, '白天视野'],
  [/\bnight vision\b/gi, '夜间视野'],
  [/\btarget point\b/gi, '目标点'],
  [/\btarget unit\b/gi, '目标单位'],
  [/\btarget\b/gi, '目标'],
  [/\benemy heroes\b/gi, '敌方英雄'],
  [/\benemy hero\b/gi, '敌方英雄'],
  [/\benemy damage\b/gi, '敌方伤害'],
  [/\benemy\b/gi, '敌方'],
  [/\ballied\b/gi, '友方'],
  [/\bcurrent and max health\b/gi, '当前生命值和最大生命值'],
  [/\bcurrent health\b/gi, '当前生命值'],
  [/\bmax health\b/gi, '最大生命值'],
  [/\bhealth regeneration\b/gi, '生命恢复'],
  [/\bcounter-attacks\b/gi, '自动反击'],
  [/\bregular attack damage\b/gi, '普通攻击伤害'],
  [/\bwhile standing in water\b/gi, '处于水中时'],
  [/\bblessed unit\b/gi, '目标单位'],
  [/\bwithin\b/gi, '在'],
  [/\bteam's fountain\b/gi, '己方泉水'],
  [/\bdirection of\b/gi, '朝向'],
  [/\bEquipped Hero\b/g, '装备英雄'],
  [/\bEquipped hero\b/g, '装备英雄'],
  [/\bHero\b/g, '英雄'],
  [/\bhero\b/g, '英雄'],
  [/\bseconds\b/gi, '秒'],
  [/\bsecond\b/gi, '秒'],
  [/\bminutes\b/gi, '分钟'],
  [/\bminute\b/gi, '分钟'],
  [/\bbonus\b/gi, '额外'],
  [/\bincreased\b/gi, '提高'],
  [/\breduced\b/gi, '降低'],
  [/\bmovement\b/gi, '移动'],
  [/\bmagic\b/gi, '魔法'],
  [/\bdamage\b/gi, '伤害'],
  [/\bvision\b/gi, '视野'],
  [/\battacking\b/gi, '攻击'],
  [/\battack\b/gi, '攻击'],
  [/\bgrants\b/gi, '提供'],
  [/\bgain\b/gi, '获得'],
  [/\bgains\b/gi, '获得'],
  [/\bhas\b/gi, '拥有'],
  [/\bapply\b/gi, '施加'],
  [/\bdebuff\b/gi, '减益'],
  [/\bpassive\b/gi, '被动'],
  [/\bactive\b/gi, '主动'],
  [/\btoggle\b/gi, '切换'],
  [/\bupgrade\b/gi, '升级'],
  [/\buse\b/gi, '使用'],
];

const ENGLISH_WORD_TO_ZH: Record<string, string> = {
  alert: '警觉',
  ancient: '远古',
  arcane: '奥术',
  audacious: '无畏',
  axe: '斧',
  bar: '杖',
  black: '黑',
  blade: '刃',
  blink: '闪烁',
  boots: '靴',
  boundless: '无垠',
  brawny: '勇武',
  bracelet: '臂环',
  bracer: '护腕',
  bottle: '魔瓶',
  cape: '披风',
  charm: '护符',
  cloak: '斗篷',
  crossbow: '十字弩',
  cup: '酒杯',
  cyclone: '旋风',
  dagger: '匕首',
  damage: '伤害',
  defiant: '不屈',
  dread: '恐惧',
  edge: '锋',
  essence: '精华',
  eye: '眼',
  falcon: '猎鹰',
  fire: '火',
  fleetfooted: '迅足',
  force: '原力',
  gauntlets: '拳套',
  gem: '宝石',
  gloves: '手套',
  greedy: '贪婪',
  greaves: '胫甲',
  guardian: '卫士',
  gunpowder: '火药',
  hammer: '锤',
  headband: '头带',
  king: '皇',
  lace: '纹',
  magic: '魔',
  mana: '法力',
  mystical: '神秘',
  null: '空灵',
  observer: '侦察',
  ogre: '食人魔',
  phase: '相位',
  pipe: '烟斗',
  point: '精气',
  polliwog: '蝌蚪',
  portal: '传送',
  power: '动力',
  psychic: '灵能',
  quickened: '迅捷',
  ring: '戒',
  scroll: '卷轴',
  sentry: '岗哨',
  serrated: '锯齿',
  shell: '之壳',
  shiv: '短刃',
  silver: '白银',
  signet: '印记',
  smoke: '诡雾',
  soul: '灵魂',
  staff: '法杖',
  talisman: '挂件',
  teleport: '传送',
  titan: '泰坦',
  tough: '坚韧',
  tranquil: '静谧',
  travel: '飞行',
  true: '真',
  ultimate: '极限',
  unrelenting: '不屈',
  vampiric: '吸血',
  wand: '杖',
  ward: '守卫',
  whisper: '低语',
  wind: '风灵',
  wise: '贤者',
};

function resolveItemAlias(normalizedName: string): string {
  if (!normalizedName) {
    return '';
  }

  if (ITEM_ALIASES[normalizedName]) {
    return ITEM_ALIASES[normalizedName];
  }

  if (normalizedName.startsWith('recipe_')) {
    return 'recipe';
  }

  return normalizedName;
}

export function normalizeItemName(itemName: string): string {
  const trimmed = itemName.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed
    .replace(/^cdota_item_/i, '')
    .replace(/^item_/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[.'’]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '');

  return resolveItemAlias(normalized);
}

function titleCaseItemKey(normalizedName: string): string {
  return normalizedName
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function containsLatin(text: string): boolean {
  const latinTokens = text.match(/[A-Za-z]{2,}/g) ?? [];
  return latinTokens.some((token) => !['HP', 'MP', 'DPS', 'DOTA'].includes(token.toUpperCase()));
}

function isZeroLikeAttribute(value: string): boolean {
  const parts = value
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return false;
  }

  return parts.every((segment) => /^[-+]?0+(?:\.0+)?%?$/.test(segment));
}

function cleanupTranslation(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+([，。！？：%；])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function translateUiText(text: string): string {
  if (!text.trim()) {
    return '';
  }

  let translated = text
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\{s:[^}]+\}/g, '')
    .replace(/\{[^}]+\}/g, '')
    .trim();

  for (const [pattern, replacement] of EXACT_TEXT_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }

  return cleanupTranslation(translated);
}

function localizeItemName(englishName: string, normalizedName: string): string {
  if (ITEM_ZH_NAME_OVERRIDES[normalizedName]) {
    return ITEM_ZH_NAME_OVERRIDES[normalizedName];
  }

  const english = englishName.trim();
  if (!english) {
    return ITEM_ZH_NAME_OVERRIDES[normalizedName] ?? titleCaseItemKey(normalizedName);
  }

  const translatedWords = english
    .split(/[\s/]+/)
    .filter(Boolean)
    .map((word) => word.replace(/[^A-Za-z]/g, '').toLowerCase())
    .map((word) => ENGLISH_WORD_TO_ZH[word] ?? '')
    .filter(Boolean);

  if (translatedWords.length > 0 && translatedWords.length >= english.split(/[\s/]+/).filter(Boolean).length - 1) {
    return translatedWords.join('');
  }

  return translateUiText(english);
}

function deriveEnglishItemName(normalizedName: string): string {
  if (ITEM_LABEL_OVERRIDES[normalizedName]) {
    return ITEM_LABEL_OVERRIDES[normalizedName];
  }

  const rawName = RAW_ITEM_TOOLTIPS[normalizedName]?.dname;
  if (rawName) {
    return rawName;
  }

  return titleCaseItemKey(normalizedName);
}

function localizeAbilityTitle(title: string, type: string): string {
  const normalizedTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (ABILITY_TITLE_OVERRIDES[normalizedTitle]) {
    return ABILITY_TITLE_OVERRIDES[normalizedTitle];
  }

  const translated = translateUiText(title);
  if (translated && !containsLatin(translated)) {
    return translated;
  }

  return ABILITY_TYPE_LABELS[type] ?? '效果';
}

function extractAbilitySummary(description: string): string | null {
  const firstSentence = description
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstSentence) {
    return null;
  }

  const translated = translateUiText(firstSentence);
  if (!translated || containsLatin(translated)) {
    return null;
  }

  return translated;
}

function formatAttributeValue(value: string, key: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (ATTRIBUTE_TEMPLATE_OVERRIDES[key]) {
    return ATTRIBUTE_TEMPLATE_OVERRIDES[key](trimmed);
  }

  return trimmed;
}

function humanizeAttributeKey(key: string): string {
  if (ATTRIBUTE_LABEL_OVERRIDES[key]) {
    return ATTRIBUTE_LABEL_OVERRIDES[key];
  }

  return translateUiText(
    key
      .split('_')
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  );
}

function formatAttributeLine(attribute: RawTooltipAttrib): string {
  const value = attribute.value.trim();
  if (!value || isZeroLikeAttribute(value)) {
    return '';
  }

  const templateValue = formatAttributeValue(value, attribute.key);
  if (templateValue !== value) {
    return templateValue;
  }

  if (attribute.display) {
    const display = attribute.display.replace(/\{value\}/g, value);
    const translated = translateUiText(display);
    if (translated && !containsLatin(translated)) {
      return translated;
    }
  }

  const label = humanizeAttributeKey(attribute.key);
  if (!label) {
    return value;
  }

  const prefix = value.startsWith('-') || value.startsWith('+') ? value : `+${value}`;
  return cleanupTranslation(`${prefix} ${label}`);
}

function buildLocalizedTooltip(normalizedName: string, enhancementName?: string | null): LocalizedItemTooltip | null {
  const raw = RAW_ITEM_TOOLTIPS[normalizedName];
  const englishName = deriveEnglishItemName(normalizedName);
  const localizedName = localizeItemName(englishName, normalizedName);

  if (!raw) {
    return {
      normalizedName,
      name: localizedName,
      categoryLabel: isEnhancementItem(normalizedName)
        ? '附魔'
        : normalizedName === 'recipe'
          ? '配方'
          : '物品',
      tierLabel: null,
      costLabel: null,
      manaCostLabel: null,
      cooldownLabel: null,
      attributes: [],
      abilities: [],
      notes: [],
      lore: null,
      enhancement: null,
    };
  }

  const fallbackAbility = raw.desc
    ? [{ type: 'text', title: '效果', description: raw.desc }]
    : [];
  const abilityEntries = raw.abilities.length > 0 ? raw.abilities : fallbackAbility;

  const localizedAbilities = abilityEntries.map((ability) => ({
    typeLabel: ABILITY_TYPE_LABELS[ability.type] ?? '效果',
    title: localizeAbilityTitle(ability.title || '效果', ability.type),
    summary: extractAbilitySummary(ability.description),
  }));

  const notes = [...raw.hint, raw.notes].filter((entry): entry is string => Boolean(entry)).map((entry) => translateUiText(entry)).filter((entry) => entry && !containsLatin(entry));
  const lore = raw.lore ? translateUiText(raw.lore) : null;

  return {
    normalizedName,
    name: localizedName,
    categoryLabel: isEnhancementItem(normalizedName)
      ? '附魔'
      : raw.tier !== null
        ? '中立物品'
        : normalizedName === 'recipe'
          ? '配方'
          : '商店物品',
    tierLabel: raw.tier !== null ? `第 ${raw.tier} 级中立物品` : null,
    costLabel: typeof raw.cost === 'number' && raw.cost > 0 ? `${raw.cost} 金` : null,
    manaCostLabel: typeof raw.mc === 'number' && raw.mc > 0 ? `${raw.mc}` : null,
    cooldownLabel: typeof raw.cd === 'number' && raw.cd > 0 ? `${raw.cd} 秒` : null,
    attributes: raw.attrib.map(formatAttributeLine).filter(Boolean),
    abilities: localizedAbilities,
    notes,
    lore: lore && !containsLatin(lore) ? lore : null,
    enhancement:
      enhancementName && normalizeItemName(enhancementName) !== normalizedName
        ? buildLocalizedTooltip(normalizeItemName(enhancementName))
        : null,
  };
}

export function getItemIconUrl(itemName: string): string {
  return getItemIconCandidates(itemName)[0] ?? '';
}

export function getItemIconCandidates(itemName: string): string[] {
  const normalized = normalizeItemName(itemName);
  if (!normalized) {
    return [];
  }

  const basePaths = [
    buildApiUrl(`/api/v1/assets/items/${normalized}.png`),
    `/assets/dota/items/${normalized}.png`,
    `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${normalized}.png`,
    `https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/items/${normalized}.png`,
    `https://steamcdn-a.akamaihd.net/apps/dota2/images/dota_react/items/${normalized}.png`,
  ];

  return Array.from(new Set(basePaths));
}

export function getItemLabel(itemName: string): string {
  const normalized = normalizeItemName(itemName);
  if (!normalized) {
    return '未知物品';
  }

  return deriveEnglishItemName(normalized);
}

export function getItemChineseLabel(itemName: string): string {
  const normalized = normalizeItemName(itemName);
  if (!normalized) {
    return '未知物品';
  }

  return localizeItemName(getItemLabel(itemName), normalized);
}

export function getItemFallbackShortLabel(itemName: string): string {
  const normalized = normalizeItemName(itemName);
  if (!normalized) {
    return '--';
  }

  return normalized
    .split('_')
    .filter(Boolean)
    .slice(0, 3)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3);
}

export function getItemTooltipData(
  itemName: string,
  options?: { enhancementName?: string | null }
): LocalizedItemTooltip | null {
  const normalized = normalizeItemName(itemName);
  if (!normalized) {
    return null;
  }

  return buildLocalizedTooltip(normalized, options?.enhancementName ?? null);
}

export function isEnhancementItem(itemName: string): boolean {
  const normalized = normalizeItemName(itemName);
  return normalized.startsWith('enhancement_');
}

export function isLikelyNeutralItem(itemName: string): boolean {
  const normalized = normalizeItemName(itemName);
  return typeof RAW_ITEM_TOOLTIPS[normalized]?.tier === 'number';
}

export function isHiddenReplayItem(itemName: string): boolean {
  void itemName;
  return false;
}
