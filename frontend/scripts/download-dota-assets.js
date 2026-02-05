/**
 * 下载 Dota 2 游戏资源到本地
 * 运行方式: node scripts/download-dota-assets.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 英雄列表 (从 heroes.ts 同步)
const HEROES = [
  'antimage', 'axe', 'bane', 'bloodseeker', 'crystal_maiden', 'drow_ranger',
  'earthshaker', 'juggernaut', 'mirana', 'morphling', 'nevermore', 'phantom_lancer',
  'puck', 'pudge', 'razor', 'sand_king', 'storm_spirit', 'sven', 'tiny',
  'vengefulspirit', 'windrunner', 'zuus', 'kunkka', 'lina', 'lion',
  'shadow_shaman', 'slardar', 'tidehunter', 'witch_doctor', 'lich', 'riki',
  'enigma', 'tinker', 'sniper', 'necrolyte', 'warlock', 'beastmaster',
  'queenofpain', 'venomancer', 'faceless_void', 'skeleton_king', 'death_prophet',
  'phantom_assassin', 'pugna', 'templar_assassin', 'viper', 'luna', 'dragon_knight',
  'dazzle', 'rattletrap', 'leshrac', 'furion', 'life_stealer', 'dark_seer',
  'clinkz', 'omniknight', 'enchantress', 'huskar', 'night_stalker', 'broodmother',
  'bounty_hunter', 'weaver', 'jakiro', 'batrider', 'chen', 'spectre',
  'ancient_apparition', 'doom_bringer', 'ursa', 'spirit_breaker', 'gyrocopter',
  'alchemist', 'invoker', 'silencer', 'obsidian_destroyer', 'lycan', 'brewmaster',
  'shadow_demon', 'lone_druid', 'chaos_knight', 'meepo', 'treant', 'ogre_magi',
  'undying', 'rubick', 'disruptor', 'nyx_assassin', 'naga_siren',
  'keeper_of_the_light', 'wisp', 'visage', 'slark', 'medusa', 'troll_warlord',
  'centaur', 'magnataur', 'shredder', 'bristleback', 'tusk', 'skywrath_mage',
  'abaddon', 'elder_titan', 'legion_commander', 'techies', 'ember_spirit',
  'earth_spirit', 'abyssal_underlord', 'terrorblade', 'phoenix', 'oracle',
  'winter_wyvern', 'arc_warden', 'monkey_king', 'dark_willow', 'pangolier',
  'grimstroke', 'hoodwink', 'void_spirit', 'snapfire', 'mars', 'ringmaster',
  'dawnbreaker', 'marci', 'primal_beast', 'muerta', 'kez', 'largo'
];

// Steam CDN 基础 URL
const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';

// 本地存储路径
const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'dota');
const HEROES_DIR = path.join(ASSETS_DIR, 'heroes');
const ICONS_DIR = path.join(HEROES_DIR, 'icons');
const MINIMAP_DIR = path.join(ASSETS_DIR, 'minimap');

// 创建目录
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// 下载文件
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) {
      console.log(`  [SKIP] ${path.basename(destPath)} already exists`);
      resolve(true);
      return;
    }

    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 处理重定向
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        fs.unlinkSync(destPath);
        console.log(`  [FAIL] ${path.basename(destPath)} - HTTP ${response.statusCode}`);
        resolve(false);
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`  [OK] ${path.basename(destPath)}`);
        resolve(true);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      console.log(`  [ERROR] ${path.basename(destPath)} - ${err.message}`);
      reject(err);
    });
  });
}

// 并发下载控制
async function downloadWithConcurrency(tasks, concurrency = 5) {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = task().then(result => {
      executing.splice(executing.indexOf(p), 1);
      return result;
    });
    results.push(p);
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

async function main() {
  console.log('=== Dota 2 Asset Downloader ===\n');

  // 创建目录
  ensureDir(HEROES_DIR);
  ensureDir(ICONS_DIR);
  ensureDir(MINIMAP_DIR);

  // 下载英雄头像
  console.log('\n[1/3] Downloading hero portraits...');
  const portraitTasks = HEROES.map(hero => () => 
    downloadFile(
      `${STEAM_CDN_BASE}/heroes/${hero}.png`,
      path.join(HEROES_DIR, `${hero}.png`)
    )
  );
  await downloadWithConcurrency(portraitTasks, 10);

  // 下载英雄 minimap 图标
  console.log('\n[2/3] Downloading hero minimap icons...');
  const iconTasks = HEROES.map(hero => () => 
    downloadFile(
      `${STEAM_CDN_BASE}/heroes/icons/${hero}.png`,
      path.join(ICONS_DIR, `${hero}.png`)
    )
  );
  await downloadWithConcurrency(iconTasks, 10);

  // 下载 minimap 背景图
  console.log('\n[3/3] Downloading minimap background...');
  
  // Dota 2 官方 minimap 图片 URL (多个备用源)
  const minimapUrls = [
    // Valve 官方 API 图片
    'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/minimap_full.png',
    // 备用: dotabuff 风格
    'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/nav/minimap_preview.png',
  ];

  let minimapDownloaded = false;
  for (const url of minimapUrls) {
    try {
      const filename = url.split('/').pop();
      const result = await downloadFile(url, path.join(MINIMAP_DIR, filename));
      if (result) {
        minimapDownloaded = true;
        break;
      }
    } catch (e) {
      console.log(`  Trying next URL...`);
    }
  }

  if (!minimapDownloaded) {
    console.log('\n[INFO] Minimap image not found on CDN. You may need to:');
    console.log('  1. Extract from Dota 2 VPK files using VPK tools');
    console.log('  2. Or use a community-provided minimap image');
    console.log('  3. Or continue using the grid background (current fallback)');
  }

  console.log('\n=== Download Complete ===');
  console.log(`Assets saved to: ${ASSETS_DIR}`);
}

main().catch(console.error);
