#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const BASE_DATA_PATH = path.join(FRONTEND_ROOT, 'src', 'renderer', 'data', 'itemTooltipData.generated.json');
const OUTPUT_PATH = path.join(
  FRONTEND_ROOT,
  'src',
  'renderer',
  'data',
  'itemTooltipLocalization.generated.json'
);
const ABILITIES_ENGLISH_PATH = path.join(
  FRONTEND_ROOT,
  'extracted',
  'dota',
  'source',
  'resource',
  'localization',
  'abilities_english.txt'
);
const ABILITIES_SCHINESE_PATH = path.join(
  FRONTEND_ROOT,
  'extracted',
  'dota',
  'source',
  'resource',
  'localization',
  'abilities_schinese.txt'
);
const NPC_ITEMS_PATH = path.join(
  FRONTEND_ROOT,
  'extracted',
  'dota',
  'source',
  'scripts',
  'npc',
  'items.txt'
);

const EXTRA_LOCALIZED_ITEM_KEYS = ['foragers_kit', 'foragers_health', 'foragers_stats', 'foragers_mana', 'splintmail'];

const ZH_TYPE_TO_KEY = {
  主动: 'active',
  被动: 'passive',
  使用: 'use',
  切换: 'toggle',
  开关: 'toggle',
  升级: 'upgrade',
};

const ATTRIBUTE_TOKEN_LABELS = {
  agi: '敏捷',
  all: '全属性',
  armor: '护甲',
  aoe_bonus: '作用范围',
  attack: '攻击速度',
  damage: '攻击力',
  gpm_bonus: '额外每分钟金钱',
  health: '生命值',
  hp_regen: '生命恢复',
  int: '智力',
  night_vision: '额外夜间视野',
  restoration_amp: '生命恢复和吸血增强',
  magic_res: '魔法抗性',
  mana: '魔法值',
  mana_regen: '魔法恢复',
  move_speed: '移动速度',
  spell_lifesteal: '技能吸血',
  str: '力量',
  vision_bonus: '额外视野',
};

const ATTRIBUTE_KEY_TOKEN_ALIASES = {
  bonus_agility: ['agi'],
  bonus_all_stats: ['all'],
  bonus_armor: ['armor'],
  bonus_attack_speed: ['attack'],
  bonus_damage: ['damage'],
  bonus_health: ['health'],
  bonus_hp_regen: ['hp_regen'],
  bonus_int: ['int'],
  bonus_intellect: ['int'],
  bonus_mana: ['mana'],
  bonus_mana_regen: ['mana_regen'],
  bonus_movement_speed: ['move_speed'],
  bonus_mp_regen: ['mana_regen'],
  bonus_strength: ['str'],
  bonus_str: ['str'],
  magic_res: ['magic_res'],
  magic_resist: ['magic_res'],
  spell_lifesteal: ['spell_lifesteal'],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function decodeKvString(value) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function parseLocalizationFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const entries = new Map();
  const lineRegex = /^\s*"((?:\\.|[^"])*)"\s*"((?:\\.|[^"])*)"/gm;

  let match = lineRegex.exec(content);
  while (match) {
    entries.set(decodeKvString(match[1]), decodeKvString(match[2]));
    match = lineRegex.exec(content);
  }

  return entries;
}

function tokenizeKeyValues(content) {
  const tokens = [];
  let index = 0;

  while (index < content.length) {
    const char = content[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '/' && content[index + 1] === '/') {
      index += 2;
      while (index < content.length && content[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (char === '{' || char === '}') {
      tokens.push(char);
      index += 1;
      continue;
    }

    if (char === '"') {
      let value = '';
      index += 1;

      while (index < content.length) {
        const current = content[index];
        if (current === '\\' && index + 1 < content.length) {
          value += current + content[index + 1];
          index += 2;
          continue;
        }

        if (current === '"') {
          index += 1;
          break;
        }

        value += current;
        index += 1;
      }

      tokens.push(decodeKvString(value));
      continue;
    }

    let value = '';
    while (
      index < content.length &&
      !/\s/.test(content[index]) &&
      content[index] !== '{' &&
      content[index] !== '}'
    ) {
      value += content[index];
      index += 1;
    }

    if (value) {
      tokens.push(value);
    }
  }

  return tokens;
}

function parseKeyValuesTokens(tokens) {
  let cursor = 0;

  function parseObject() {
    const result = {};

    while (cursor < tokens.length && tokens[cursor] !== '}') {
      const key = tokens[cursor++];
      if (!key || key === '}') {
        continue;
      }

      let value = null;
      if (tokens[cursor] === '{') {
        cursor += 1;
        value = parseObject();
      } else {
        value = tokens[cursor++] ?? '';
      }

      if (Object.hasOwn(result, key)) {
        result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
      } else {
        result[key] = value;
      }
    }

    if (tokens[cursor] === '}') {
      cursor += 1;
    }

    return result;
  }

  return parseObject();
}

function parseKeyValuesFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseKeyValuesTokens(tokenizeKeyValues(content));
}

function getNameKeyVariants(itemKey) {
  return [
    `DOTA_Tooltip_Ability_item_${itemKey}`,
    `DOTA_Tooltip_Ability_item_${itemKey}:n`,
    `DOTA_Tooltip_ability_item_${itemKey}`,
    `DOTA_Tooltip_ability_item_${itemKey}:n`,
  ];
}

function getDescriptionKeyVariants(itemKey) {
  return [
    `DOTA_Tooltip_Ability_item_${itemKey}_Description`,
    `DOTA_Tooltip_ability_item_${itemKey}_Description`,
    `DOTA_Tooltip_Ability_item_${itemKey}_description`,
    `DOTA_Tooltip_ability_item_${itemKey}_description`,
  ];
}

function getLoreKeyVariants(itemKey) {
  return [
    `DOTA_Tooltip_Ability_item_${itemKey}_Lore`,
    `DOTA_Tooltip_ability_item_${itemKey}_Lore`,
    `DOTA_Tooltip_Ability_item_${itemKey}_lore`,
    `DOTA_Tooltip_ability_item_${itemKey}_lore`,
  ];
}

function getNoteKeyVariants(itemKey, index) {
  return [
    `DOTA_Tooltip_Ability_item_${itemKey}_Note${index}`,
    `DOTA_Tooltip_ability_item_${itemKey}_Note${index}`,
  ];
}

function getAttributeKeyVariants(itemKey, attributeKey) {
  return [
    `DOTA_Tooltip_Ability_item_${itemKey}_${attributeKey}`,
    `DOTA_Tooltip_ability_item_${itemKey}_${attributeKey}`,
  ];
}

function getFirstValue(entries, keys) {
  for (const key of keys) {
    const value = entries.get(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizePlaceholderKey(key) {
  return key.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
}

function normalizeScalarValue(key, value) {
  let normalized = value.trim();
  if (!normalized) {
    return normalized;
  }

  if (/^-\.\d+$/.test(normalized)) {
    normalized = normalized.replace(/^-\./, '-0.');
  } else if (/^\.\d+$/.test(normalized)) {
    normalized = `0${normalized}`;
  }

  if (/^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?)+$/.test(normalized)) {
    normalized = normalized.split(/\s+/).join(' / ');
  }

  if (key === 'spell_lifesteal_while_active' && !normalized.endsWith('%')) {
    normalized = `${normalized}%`;
  }

  return normalized;
}

function isZeroishValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return false;
  }

  const parts = normalized
    .split(/\s*\/\s*|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 && parts.every((part) => /^[-+]?0(?:\.0+)?%?$/.test(part));
}

function registerPlaceholder(values, key, value) {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = normalizeScalarValue(key, value);
  if (!trimmed) {
    return;
  }

  const variants = new Set([key, key.toLowerCase(), normalizePlaceholderKey(key)]);
  if (key.includes('_')) {
    const compact = key.replace(/_/g, '');
    variants.add(compact);
    variants.add(compact.toLowerCase());
  }

  for (const variant of variants) {
    values.set(variant, trimmed);
  }

  for (const alias of ATTRIBUTE_KEY_TOKEN_ALIASES[key] ?? []) {
    if (alias === key || alias === key.toLowerCase() || normalizePlaceholderKey(alias) === normalizePlaceholderKey(key)) {
      continue;
    }
    registerPlaceholder(values, alias, trimmed);
  }
}

function getScalarKvValue(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.value === 'string') {
    return value.value.trim();
  }

  return null;
}

function getNpcItemEntry(itemKey, npcItemsRoot) {
  if (!npcItemsRoot || typeof npcItemsRoot !== 'object') {
    return null;
  }

  const candidates = [`item_${itemKey}`];
  for (const candidate of candidates) {
    const entry = npcItemsRoot[candidate];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return entry;
    }
  }

  return null;
}

function buildPlaceholderMap(baseEntry, npcItemEntry) {
  const values = new Map();

  for (const attribute of baseEntry?.attrib ?? []) {
    if (attribute?.key && typeof attribute.value === 'string' && attribute.value.trim()) {
      registerPlaceholder(values, attribute.key, attribute.value.trim());
    }
  }

  if (typeof baseEntry?.cd === 'number' && baseEntry.cd > 0) {
    registerPlaceholder(values, 'cooldown', String(baseEntry.cd));
    registerPlaceholder(values, 'cooldown_tooltip', String(baseEntry.cd));
  }

  if (typeof baseEntry?.mc === 'number' && baseEntry.mc > 0) {
    registerPlaceholder(values, 'mana_cost_tooltip', String(baseEntry.mc));
    registerPlaceholder(values, 'mana_cost', String(baseEntry.mc));
  }

  if (typeof baseEntry?.cost === 'number' && baseEntry.cost > 0) {
    registerPlaceholder(values, 'gold_cost_tooltip', String(baseEntry.cost));
    registerPlaceholder(values, 'gold_cost', String(baseEntry.cost));
  }

  if (npcItemEntry && typeof npcItemEntry === 'object') {
    for (const [key, rawValue] of Object.entries(npcItemEntry)) {
      if (key === 'AbilityValues' && rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        for (const [valueKey, valueEntry] of Object.entries(rawValue)) {
          const scalar = getScalarKvValue(valueEntry);
          if (scalar) {
            registerPlaceholder(values, valueKey, scalar);
          }
        }
        continue;
      }

      const scalar = getScalarKvValue(rawValue);
      if (scalar) {
        registerPlaceholder(values, key, scalar);
      }
    }

    const enemyArmor = values.get('enemy_armor');
    if (enemyArmor && /^-\d/.test(enemyArmor)) {
      registerPlaceholder(values, 'enemy_armor', enemyArmor.replace(/^-/, ''));
    }
  }

  return values;
}

function substitutePlaceholders(text, baseEntry, npcItemEntry) {
  const placeholders = buildPlaceholderMap(baseEntry, npcItemEntry);
  return text
    .replace(/%([A-Za-z0-9_]+)%/g, (match, key) => {
      const normalizedKey = normalizePlaceholderKey(key);
      return placeholders.get(key) ?? placeholders.get(key.toLowerCase()) ?? placeholders.get(normalizedKey) ?? match;
    })
    .replace(/%%/g, '%');
}

function stripHtmlPreservingBreaks(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h1>/gi, '</h1>\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ');
}

function cleanupDisplayText(text) {
  return stripHtmlPreservingBreaks(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？：；,.!?])/g, '$1')
    .trim();
}

function removeUnresolvedSegments(text) {
  const prepared = stripHtmlPreservingBreaks(text)
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n');
  const segments = prepared
    .split('\n')
    .flatMap((line) => line.split(/(?<=[。！？!?])\s+|(?<=[.?!])\s+/u))
    .map((segment) => segment.trim())
    .filter(Boolean);

  const kept = segments.filter((segment) => !/%[A-Za-z0-9_]+%/.test(segment));
  if (kept.length > 0) {
    return kept.join('\n');
  }

  return prepared.replace(/%[A-Za-z0-9_]+%/g, '');
}

function cleanupPreparedLocalizedText(text) {
  return cleanupDisplayText(removeUnresolvedSegments(text))
    .replace(/(\d+(?:\.\d+)?)%秒/g, '$1%/秒')
    .trim();
}

function resolvePlaceholderValue(placeholders, key) {
  const normalizedKey = normalizePlaceholderKey(key);
  return placeholders.get(key) ?? placeholders.get(key.toLowerCase()) ?? placeholders.get(normalizedKey) ?? null;
}

function formatLocalizedAttributeTemplate(template, attributeKey, placeholders, fallbackValue) {
  const trimmed = template.trim();
  if (!trimmed) {
    return null;
  }

  const tokenMatches = [...trimmed.matchAll(/\$([A-Za-z0-9_]+)/g)];
  if (tokenMatches.length === 1 && /^%?[+-]?\$[A-Za-z0-9_]+$/.test(trimmed)) {
    const token = tokenMatches[0][1];
    const label = ATTRIBUTE_TOKEN_LABELS[token];
    const value = resolvePlaceholderValue(placeholders, token) ?? fallbackValue;
    if (!label || !value || isZeroishValue(value)) {
      return null;
    }

    const sign = trimmed.includes('-') ? '-' : '+';
    const suffix = trimmed.includes('%') && !String(value).endsWith('%') ? '%' : '';
    return `${label} ${sign}${value}${suffix}`;
  }

  if (!trimmed.includes('$') && /：$/.test(trimmed) && fallbackValue) {
    if (isZeroishValue(fallbackValue)) {
      return null;
    }

    const usesPercent = trimmed.startsWith('%');
    const label = cleanupDisplayText(usesPercent ? trimmed.slice(1) : trimmed);
    const suffix = usesPercent && !String(fallbackValue).endsWith('%') ? '%' : '';
    return `${label}${fallbackValue}${suffix}`;
  }

  if (!trimmed.includes('$') && fallbackValue && /^%?\+/.test(trimmed)) {
    if (isZeroishValue(fallbackValue)) {
      return null;
    }

    const usesPercent = trimmed.startsWith('%+');
    const label = cleanupDisplayText(trimmed.replace(/^%?\+/, ''));
    const suffix = usesPercent && !String(fallbackValue).endsWith('%') ? '%' : '';
    return `${label} +${fallbackValue}${suffix}`;
  }

  const interpolated = cleanupDisplayText(
    trimmed.replace(/\$([A-Za-z0-9_]+)/g, (match, key) => resolvePlaceholderValue(placeholders, key) ?? match)
  );
  if (!interpolated || /[A-Za-z]{3,}/.test(interpolated)) {
    return null;
  }

  return interpolated;
}

function collectLocalizedAttributes(entries, itemKey, baseEntry, npcItemEntry) {
  const placeholders = buildPlaceholderMap(baseEntry, npcItemEntry);
  const attributes = [];

  for (const attribute of baseEntry?.attrib ?? []) {
    const template = getFirstValue(entries, getAttributeKeyVariants(itemKey, attribute.key));
    if (!template) {
      continue;
    }

    const line = formatLocalizedAttributeTemplate(
      template,
      attribute.key,
      placeholders,
      normalizeScalarValue(attribute.key, attribute.value)
    );
    if (line) {
      attributes.push(line);
    }
  }

  return attributes;
}

function parseLocalizedAbilities(localizedDescription, baseEntry, npcItemEntry) {
  if (!localizedDescription) {
    return [];
  }

  const substituted = substitutePlaceholders(localizedDescription, baseEntry, npcItemEntry).replace(/\r/g, '');
  const headerRegex = /<h1>\s*([^<]+?)\s*<\/h1>/gi;
  const headers = Array.from(substituted.matchAll(headerRegex));

  if (headers.length === 0) {
    return [];
  }

  return headers
    .map((headerMatch, index) => {
      const headerText = cleanupDisplayText(headerMatch[1]);
      const bodyStart = (headerMatch.index ?? 0) + headerMatch[0].length;
      const bodyEnd = headers[index + 1]?.index ?? substituted.length;
      const description = cleanupPreparedLocalizedText(substituted.slice(bodyStart, bodyEnd));
      const splitMatch = headerText.match(/^([^：:]+)\s*[：:]\s*(.+)$/);
      const typeLabel = splitMatch?.[1]?.trim() ?? '效果';
      const title = splitMatch?.[2]?.trim() ?? headerText;

      return {
        type: ZH_TYPE_TO_KEY[typeLabel] ?? 'text',
        type_label: typeLabel,
        title,
        description,
      };
    })
    .filter((ability) => ability.title || ability.description);
}

function collectLocalizedNotes(entries, itemKey, baseEntry, npcItemEntry) {
  const notes = [];

  for (let index = 0; index < 10; index += 1) {
    const value = getFirstValue(entries, getNoteKeyVariants(itemKey, index));
    if (!value) {
      continue;
    }

    const note = cleanupPreparedLocalizedText(substitutePlaceholders(value, baseEntry, npcItemEntry));
    if (note) {
      notes.push(note);
    }
  }

  return notes;
}

function createLocalizationEntry(itemKey, baseEntry, npcItemsRoot, englishEntries, chineseEntries) {
  const npcItemEntry = getNpcItemEntry(itemKey, npcItemsRoot);
  const englishName = getFirstValue(englishEntries, getNameKeyVariants(itemKey)) ?? baseEntry?.dname ?? null;
  const localizedName = getFirstValue(chineseEntries, getNameKeyVariants(itemKey)) ?? null;
  const localizedDescription = getFirstValue(chineseEntries, getDescriptionKeyVariants(itemKey));
  const localizedAttributes = collectLocalizedAttributes(chineseEntries, itemKey, baseEntry, npcItemEntry);
  const localizedAbilities = parseLocalizedAbilities(localizedDescription, baseEntry, npcItemEntry);
  const localizedDesc =
    localizedAbilities.length === 0 && localizedDescription
      ? cleanupPreparedLocalizedText(substitutePlaceholders(localizedDescription, baseEntry, npcItemEntry))
      : null;
  const localizedLore = (() => {
    const lore = getFirstValue(chineseEntries, getLoreKeyVariants(itemKey));
    return lore ? cleanupPreparedLocalizedText(substitutePlaceholders(lore, baseEntry, npcItemEntry)) : null;
  })();
  const localizedNotes = collectLocalizedNotes(chineseEntries, itemKey, baseEntry, npcItemEntry);

  if (
    !englishName &&
    !localizedName &&
    !localizedDesc &&
    !localizedLore &&
    localizedNotes.length === 0 &&
    localizedAbilities.length === 0 &&
    localizedAttributes.length === 0
  ) {
    return null;
  }

  return {
    english_name: englishName,
    localized_name: localizedName,
    localized_attributes: localizedAttributes,
    localized_abilities: localizedAbilities,
    localized_desc: localizedDesc,
    localized_notes: localizedNotes,
    localized_lore: localizedLore,
  };
}

function main() {
  const baseData = readJson(BASE_DATA_PATH);
  const englishEntries = parseLocalizationFile(ABILITIES_ENGLISH_PATH);
  const chineseEntries = parseLocalizationFile(ABILITIES_SCHINESE_PATH);
  const npcItemsRoot = parseKeyValuesFile(NPC_ITEMS_PATH).DOTAAbilities ?? {};
  const orderedKeys = [...Object.keys(baseData), ...EXTRA_LOCALIZED_ITEM_KEYS.filter((key) => !(key in baseData))];
  const output = {};

  for (const itemKey of orderedKeys) {
    const entry = createLocalizationEntry(itemKey, baseData[itemKey] ?? null, npcItemsRoot, englishEntries, chineseEntries);
    if (entry) {
      output[itemKey] = entry;
    }
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${Object.keys(output).length} localized item tooltip entries to ${OUTPUT_PATH}`);
}

main();
