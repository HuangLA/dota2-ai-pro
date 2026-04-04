import { describe, expect, it } from 'vitest';
import {
  getItemChineseLabel,
  getItemIconCandidates,
  isHiddenReplayItem,
  getItemLabel,
  getItemTooltipData,
  isLikelyNeutralItem,
  normalizeItemName,
} from './items';

describe('item helpers', () => {
  it('normalizes parser and alias variants to Steam CDN item ids', () => {
    expect(normalizeItemName('CDOTA_Item_PowerTreadsStr')).toBe('power_treads');
    expect(normalizeItemName('boots_of_travel')).toBe('travel_boots');
    expect(normalizeItemName('battlefury')).toBe('bfury');
    expect(normalizeItemName('assault_cuirass')).toBe('assault');
    expect(normalizeItemName('manta_style')).toBe('manta');
    expect(normalizeItemName('dust_of_appearance')).toBe('dust');
    expect(normalizeItemName('dustof_appearance')).toBe('dust');
    expect(normalizeItemName('observer_ward')).toBe('ward_observer');
    expect(normalizeItemName('sentry_ward')).toBe('ward_sentry');
    expect(normalizeItemName('ironwood_branch')).toBe('branches');
    expect(normalizeItemName('teleport_scroll')).toBe('tpscroll');
    expect(normalizeItemName('blink_dagger')).toBe('blink');
    expect(normalizeItemName('refresher_orb_shard')).toBe('refresher_shard');
    expect(normalizeItemName('forage_health')).toBe('foragers_health');
    expect(normalizeItemName('splint_mail')).toBe('splintmail');
    expect(normalizeItemName('guardian_shell')).toBe('defiant_shell');
    expect(normalizeItemName('greater_critical')).toBe('greater_crit');
    expect(normalizeItemName('lesser_critical')).toBe('lesser_crit');
    expect(normalizeItemName('empty_bottle')).toBe('bottle');
    expect(normalizeItemName('robe_of_magi')).toBe('robe');
    expect(normalizeItemName('robe_of_the_magi')).toBe('robe');
    expect(normalizeItemName('recipe_travel_boots')).toBe('recipe');
  });

  it('returns stable local item icon candidates for replay inventory rendering', () => {
    expect(getItemIconCandidates('Aghanims_Scepter')).toEqual([
      '/assets/dota/items/ultimate_scepter.png',
    ]);
    expect(getItemIconCandidates('battlefury')).toEqual(['/assets/dota/items/bfury.png']);
    expect(getItemIconCandidates('assault_cuirass')).toEqual(['/assets/dota/items/assault.png']);
    expect(getItemIconCandidates('forage_health')).toEqual(['/assets/dota/items/foragers_health.png']);
  });

  it('provides user-facing labels and neutral detection for replay inventory rendering', () => {
    expect(getItemLabel('robe_of_magi')).toBe('Robe of the Magi');
    expect(getItemLabel('guardian_shell')).toBe('Defiant Shell');
    expect(getItemChineseLabel('boots_of_speed')).toBe('速度之靴');
    expect(getItemChineseLabel('circlet')).toBe('圆环');
    expect(getItemChineseLabel('guardian_shell')).toBe('不羁甲壳');
    expect(getItemChineseLabel('battlefury')).toBe('狂战斧');
    expect(getItemChineseLabel('forage_health')).toBe('活力伞菌');
    expect(isLikelyNeutralItem('essence_ring')).toBe(true);
    expect(isLikelyNeutralItem('guardian_shell')).toBe(true);
    expect(isLikelyNeutralItem('teleport_scroll')).toBe(false);
    expect(isHiddenReplayItem('guardian_shell')).toBe(false);
  });

  it('builds localized tooltip data for items and neutral enhancements', () => {
    const blinkTooltip = getItemTooltipData('blink');
    expect(blinkTooltip?.name).toBe('闪烁匕首');
    expect(blinkTooltip?.categoryLabel).toBe('商店物品');
    expect(blinkTooltip?.cooldownLabel).toBe('15 秒');
    expect(blinkTooltip?.attributes).toContain('最远闪烁距离 1200');
    expect(blinkTooltip?.abilities[0]?.title).toBe('闪烁');
    expect(blinkTooltip?.abilities[0]?.summary).toContain('传送到最远1200距离的位置');
    expect(blinkTooltip?.notes).toContain('快速点击两次会将自己往己方泉水方向传送。');

    const robeTooltip = getItemTooltipData('robe_of_magi');
    expect(robeTooltip?.name).toBe('法师长袍');
    expect(robeTooltip?.attributes).toContain('智力 +6');

    const phaseBootsTooltip = getItemTooltipData('phase_boots');
    expect(phaseBootsTooltip?.attributes).toContain('攻击力（近战） +18');
    expect(phaseBootsTooltip?.attributes).toContain('攻击力（远程） +12');

    const powerTreadsTooltip = getItemTooltipData('power_treads');
    expect(powerTreadsTooltip?.attributes).toContain('移动速度（近战英雄） +55');
    expect(powerTreadsTooltip?.attributes).not.toContain('+移动速度（近战英雄）');

    const bladeMailTooltip = getItemTooltipData('blade_mail');
    expect(bladeMailTooltip?.name).toBe('刃甲');
    expect(bladeMailTooltip?.abilities[0]?.title).toBe('伤害反弹');
    expect(bladeMailTooltip?.abilities[0]?.summary).toContain('反弹所有来源的伤害');

    const mantaTooltip = getItemTooltipData('manta_style');
    expect(mantaTooltip?.abilities[0]?.summary).toContain('驱散类型：弱驱散');
    expect(mantaTooltip?.abilities[0]?.summary).not.toMatch(/%[A-Za-z0-9_]+%|<[^>]+>|class=\\/);

    const bkbTooltip = getItemTooltipData('black_king_bar');
    expect(bkbTooltip?.abilities[0]?.summary).toContain('持续时间：9 / 8 / 7秒');
    expect(bkbTooltip?.abilities[0]?.summary).toContain('驱散类型：弱驱散');

    const holyLocketTooltip = getItemTooltipData('holy_locket');
    expect(holyLocketTooltip?.abilities[0]?.summary).toContain('每10秒自动获得一点能量');

    const soulRingTooltip = getItemTooltipData('soul_ring');
    expect(soulRingTooltip?.abilities[0]?.summary).toContain('消耗170点生命值来暂时获取170点魔法值');

    const neutralTooltip = getItemTooltipData('guardian_shell', {
      enhancementName: 'enhancement_brawny',
    });
    expect(neutralTooltip?.name).toBe('不羁甲壳');
    expect(neutralTooltip?.tierLabel).toBe('第 2 级中立物品');
    expect(neutralTooltip?.abilities[0]?.title).toBe('互换');
    expect(neutralTooltip?.abilities[0]?.summary).toContain('伤害为平常攻击伤害的80%');
    expect(neutralTooltip?.enhancement?.name).toBe('壮实');
    expect(neutralTooltip?.enhancement?.attributes.some((line) => line.includes('生命值'))).toBe(true);

    const foragersTooltip = getItemTooltipData('forage_health');
    expect(foragersTooltip?.name).toBe('活力伞菌');
    expect(foragersTooltip?.abilities[0]?.title).toBe('咀嚼');
    expect(foragersTooltip?.abilities[0]?.summary).toContain('1%/秒最大生命值恢复，持续10秒');
    expect(foragersTooltip?.notes).toContain('按住Ctrl键点击附近友方英雄可以对其使用。');

    const foragersKitTooltip = getItemTooltipData('foragers_kit');
    expect(foragersKitTooltip?.abilities[0]?.summary).toContain('站1秒后就能采到植物、蘑菇或包含30金的金袋');

    const foragersStatsTooltip = getItemTooltipData('foragers_stats');
    expect(foragersStatsTooltip?.abilities[0]?.summary).toContain('永久获得1点主属性');
    expect(foragersStatsTooltip?.notes).toContain('全才英雄获得0.4点额外全属性。');

    const foragersManaTooltip = getItemTooltipData('foragers_mana');
    expect(foragersManaTooltip?.abilities[0]?.summary).toContain('立刻回复50 + 5%目标最大魔法值的魔法');

    const tomeTooltip = getItemTooltipData('tome_of_knowledge');
    expect(tomeTooltip?.abilities[0]?.summary).toContain('直接获得750点经验值');
    expect(tomeTooltip?.abilities[0]?.summary).not.toContain('%customval_team_tomes_used%');

    const bloodstoneTooltip = getItemTooltipData('bloodstone');
    expect(bloodstoneTooltip?.abilities[0]?.summary).toContain('技能吸血效果提升至60%');
    expect(bloodstoneTooltip?.attributes).toContain('技能吸血 +20%');

    const kayaTooltip = getItemTooltipData('kaya');
    expect(kayaTooltip?.attributes).toContain('技能增强 +10%');
    expect(kayaTooltip?.attributes).toContain('魔法恢复增强 +40%');

    const kayaAndSangeTooltip = getItemTooltipData('kaya_and_sange');
    expect(kayaAndSangeTooltip?.attributes).toContain('减速抗性 +25%');
    expect(kayaAndSangeTooltip?.attributes).toContain('生命恢复和吸血增强 +20%');

    const moonShardTooltip = getItemTooltipData('moon_shard');
    expect(moonShardTooltip?.attributes).toContain('额外夜间视野 +400');

    const ancientJanggoTooltip = getItemTooltipData('ancient_janggo');
    expect(ancientJanggoTooltip?.attributes).toContain('力量 +8');
    expect(ancientJanggoTooltip?.attributes).not.toContain('智力 +0');
  });
});
