/**
 * 下载 Dota 2 地图元素图标
 * 运行方式: node scripts/download-map-elements.js
 * 
 * 地图元素包括:
 * - Roshan
 * - 传送门 (Portals)
 * - 前哨 (Outposts)
 * - 神符 (Runes)
 * - 防御塔 (Towers)
 * - 兵营 (Barracks)
 * - 基地 (Ancient)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 本地存储路径
const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'dota');
const MAP_ELEMENTS_DIR = path.join(ASSETS_DIR, 'map_elements');

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

    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
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

// Dota 2 Steam CDN 地图元素图标
const MAP_ELEMENT_URLS = {
  // Roshan (从 combat log 图标获取)
  'roshan': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/roshan.png',
  'roshan_minimap': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/roshan_icon.png',
  
  // 神符
  'rune_bounty': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_bounty.png',
  'rune_haste': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_haste.png',
  'rune_illusion': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_illusion.png',
  'rune_invisibility': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_invisibility.png',
  'rune_regeneration': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_regeneration.png',
  'rune_double_damage': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_doubledamage.png',
  'rune_arcane': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_arcane.png',
  'rune_wisdom': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_wisdom.png',
  'rune_shield': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/rune_shield.png',
  
  // 建筑图标 (minimap 样式)
  'tower_radiant': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/tower_good.png',
  'tower_dire': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/tower_bad.png',
  'barracks_radiant': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/barracks_good.png',
  'barracks_dire': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/barracks_bad.png',
  'ancient_radiant': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/ancient_good.png',
  'ancient_dire': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/ancient_bad.png',
  
  // 前哨
  'outpost_radiant': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/outpost_good.png',
  'outpost_dire': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/outpost_bad.png',
  'outpost_neutral': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/outpost_neutral.png',
  
  // 传送门/通道
  'portal': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/portal_icon.png',
  
  // 其他标记
  'ping': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/ping.png',
  'scan': 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/scan_enemy.png',
};

// 备用 URL (从 Liquipedia 获取)
const LIQUIPEDIA_URLS = {
  'roshan_mapicon': 'https://liquipedia.net/commons/images/thumb/4/4d/Roshan_mapicon.png/20px-Roshan_mapicon.png',
  'tower_mapicon': 'https://liquipedia.net/commons/images/thumb/1/1c/Tower_icon.png/20px-Tower_icon.png',
};

async function main() {
  console.log('=== Dota 2 Map Elements Downloader ===\n');

  // 创建目录
  ensureDir(MAP_ELEMENTS_DIR);

  // 下载 Steam CDN 图标
  console.log('\n[1/2] Downloading from Steam CDN...');
  for (const [name, url] of Object.entries(MAP_ELEMENT_URLS)) {
    try {
      await downloadFile(url, path.join(MAP_ELEMENTS_DIR, `${name}.png`));
    } catch (e) {
      console.log(`  [WARN] ${name} download failed`);
    }
  }

  // 尝试从 Liquipedia 下载
  console.log('\n[2/2] Trying Liquipedia fallbacks...');
  for (const [name, url] of Object.entries(LIQUIPEDIA_URLS)) {
    try {
      await downloadFile(url, path.join(MAP_ELEMENTS_DIR, `${name}.png`));
    } catch (e) {
      console.log(`  [WARN] ${name} download failed (Liquipedia may block)`);
    }
  }

  console.log('\n=== Download Complete ===');
  console.log(`Assets saved to: ${MAP_ELEMENTS_DIR}`);
  
  console.log('\n[INFO] For missing icons, you can manually extract from Dota 2 files:');
  console.log('  - Roshan: panorama/images/minimap/roshan_icon.png');
  console.log('  - Towers: panorama/images/minimap/tower_*.png');
  console.log('  - Portal: panorama/images/minimap/portal_icon.png');
}

main().catch(console.error);
