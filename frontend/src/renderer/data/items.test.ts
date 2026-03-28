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
    expect(normalizeItemName('dust_of_appearance')).toBe('dust');
    expect(normalizeItemName('dustof_appearance')).toBe('dust');
    expect(normalizeItemName('observer_ward')).toBe('ward_observer');
    expect(normalizeItemName('sentry_ward')).toBe('ward_sentry');
    expect(normalizeItemName('ironwood_branch')).toBe('branches');
    expect(normalizeItemName('teleport_scroll')).toBe('tpscroll');
    expect(normalizeItemName('blink_dagger')).toBe('blink');
    expect(normalizeItemName('guardian_shell')).toBe('defiant_shell');
    expect(normalizeItemName('greater_critical')).toBe('greater_crit');
    expect(normalizeItemName('lesser_critical')).toBe('lesser_crit');
    expect(normalizeItemName('empty_bottle')).toBe('bottle');
    expect(normalizeItemName('robe_of_magi')).toBe('robe');
    expect(normalizeItemName('robe_of_the_magi')).toBe('robe');
    expect(normalizeItemName('recipe_travel_boots')).toBe('recipe');
  });

  it('returns stable icon candidates with local-first fallback order', () => {
    expect(getItemIconCandidates('Aghanims_Scepter')).toEqual([
      '/assets/dota/items/ultimate_scepter.png',
      'http://127.0.0.1:8000/api/v1/assets/items/ultimate_scepter.png',
      'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png',
      'https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png',
      'https://steamcdn-a.akamaihd.net/apps/dota2/images/dota_react/items/ultimate_scepter.png',
    ]);
  });

  it('provides user-facing labels and neutral detection for replay inventory rendering', () => {
    expect(getItemLabel('robe_of_magi')).toBe('Robe of the Magi');
    expect(getItemLabel('guardian_shell')).toBe('Defiant Shell');
    expect(getItemChineseLabel('boots_of_speed')).toBe('速度之靴');
    expect(getItemChineseLabel('circlet')).toBe('圆环');
    expect(getItemChineseLabel('guardian_shell')).toBe('不屈之壳');
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
    expect(blinkTooltip?.abilities[0]?.summary).toContain('闪烁到最远 1200 距离外的目标点');
    expect(blinkTooltip?.notes).toContain('对自身施放时，会朝己方泉水方向闪烁。');

    const robeTooltip = getItemTooltipData('robe_of_magi');
    expect(robeTooltip?.name).toBe('法师长袍');
    expect(robeTooltip?.attributes).toContain('智力 +6');

    const bladeMailTooltip = getItemTooltipData('blade_mail');
    expect(bladeMailTooltip?.name).toBe('刃甲');
    expect(bladeMailTooltip?.abilities[0]?.title).toBe('伤害反弹');
    expect(bladeMailTooltip?.abilities[0]?.summary).toContain('反弹所受的全部伤害');

    const neutralTooltip = getItemTooltipData('guardian_shell', {
      enhancementName: 'enhancement_brawny',
    });
    expect(neutralTooltip?.name).toBe('不屈之壳');
    expect(neutralTooltip?.tierLabel).toBe('第 2 级中立物品');
    expect(neutralTooltip?.abilities[0]?.title).toBe('反击');
    expect(neutralTooltip?.abilities[0]?.summary).toContain('自动反击攻击距离内的一名目标');
    expect(neutralTooltip?.enhancement?.name).toBe('勇武');
    expect(neutralTooltip?.enhancement?.attributes.some((line) => line.includes('生命值'))).toBe(true);
  });
});
