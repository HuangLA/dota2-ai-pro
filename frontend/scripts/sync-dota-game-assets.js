#!/usr/bin/env node

/**
 * 手动从本地 Dota 2 安装目录提取项目资源。
 *
 * 设计目标:
 * - 资源跟随当前 parser / patch 分支手动更新
 * - 输出直接落盘到仓库，用 git 管理
 * - 允许先用 --inspect 检查本地 VPK 资源清单，再决定是否提取
 * - 真实解包/纹理解码依赖外部 Source2Viewer-CLI (ValveResourceFormat)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sharp = require('sharp');

const { parseVpkDirectory } = require('./lib/vpkDirectory');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const PUBLIC_DOTA_ASSETS_DIR = path.join(FRONTEND_ROOT, 'public', 'assets', 'dota');
const EXTRACTED_DOTA_DIR = path.join(FRONTEND_ROOT, 'extracted', 'dota');
const HEROES_TS_PATH = path.join(FRONTEND_ROOT, 'src', 'renderer', 'data', 'heroes.ts');
const DEFAULT_HD_MINIMAP_SIZE = 3072;
const DEFAULT_STEAM_APPMANIFEST = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Steam',
  'steamapps',
  'appmanifest_570.acf'
);

const EXTRACTION_FILTERS = {
  heroes: ['panorama/images/heroes/'],
  items: ['panorama/images/items/'],
  minimap: [
    'panorama/images/minimap/',
    'panorama/images/textures/minimap_game_png.vtex_c',
    'panorama/images/textures/dotamap683_psd.vtex_c',
    'materials/overviews/dota.vmat_c',
    'materials/overviews/dota_minimal',
    'materials/vgui/hud/minimap_',
  ],
  texts: [
    'resource/localization/dota_english.txt',
    'resource/localization/dota_schinese.txt',
    'resource/localization/abilities_english.txt',
    'resource/localization/abilities_schinese.txt',
    'scripts/items/items_game.txt',
    'scripts/npc/items.txt',
    'scripts/npc/neutral_items.txt',
  ],
};

function printUsage() {
  console.log(`
Usage:
  node scripts/sync-dota-game-assets.js [options]

Options:
  --inspect                 只检查本地 VPK 资源，不执行真实提取
  --patch <version>         记录到 manifest 的 Dota 版本号，例如 7.41
  --language <lang>         提取语言，默认 schinese
  --dota-root <path>        本地 Dota 2 安装目录
  --pak <path>              指定 pak01_dir.vpk
  --appmanifest <path>      指定 appmanifest_570.acf
  --vrf-cli <path>          Source2Viewer-CLI 可执行文件路径
  --temp-dir <path>         提取临时目录

Examples:
  node scripts/sync-dota-game-assets.js --inspect --patch 7.41
  SOURCE2VIEWER_CLI=/path/to/Source2Viewer-CLI node scripts/sync-dota-game-assets.js --patch 7.41
`.trim());
}

function parseArgs(argv) {
  const options = {
    inspect: false,
    patch: null,
    language: 'schinese',
    dotaRoot: null,
    pakPath: null,
    appmanifestPath: DEFAULT_STEAM_APPMANIFEST,
    vrfCli: process.env.SOURCE2VIEWER_CLI || process.env.VRF_CLI || null,
    tempDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--inspect':
        options.inspect = true;
        break;
      case '--patch':
        options.patch = argv[++index] || null;
        break;
      case '--language':
        options.language = argv[++index] || options.language;
        break;
      case '--dota-root':
        options.dotaRoot = argv[++index] || null;
        break;
      case '--pak':
        options.pakPath = argv[++index] || null;
        break;
      case '--appmanifest':
        options.appmanifestPath = argv[++index] || null;
        break;
      case '--vrf-cli':
        options.vrfCli = argv[++index] || null;
        break;
      case '--temp-dir':
        options.tempDir = argv[++index] || null;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(targetPath) {
  return Boolean(targetPath) && fs.existsSync(targetPath);
}

function parseAcf(content) {
  const values = {};
  const regex = /"([^"]+)"\s+"([^"]*)"/g;
  let match = regex.exec(content);

  while (match) {
    values[match[1]] = match[2];
    match = regex.exec(content);
  }

  return values;
}

function resolveDotaRoot(options) {
  if (options.dotaRoot) {
    return path.resolve(options.dotaRoot);
  }

  if (!fileExists(options.appmanifestPath)) {
    throw new Error(`Steam appmanifest not found: ${options.appmanifestPath}`);
  }

  const appManifest = parseAcf(fs.readFileSync(options.appmanifestPath, 'utf8'));
  const installDir = appManifest.installdir;

  if (!installDir) {
    throw new Error(`Unable to read "installdir" from ${options.appmanifestPath}`);
  }

  return path.resolve(path.dirname(options.appmanifestPath), 'common', installDir);
}

function resolvePakPath(options, dotaRoot) {
  if (options.pakPath) {
    return path.resolve(options.pakPath);
  }

  return path.join(dotaRoot, 'game', 'dota', 'pak01_dir.vpk');
}

function readBuildMetadata(appmanifestPath) {
  if (!fileExists(appmanifestPath)) {
    return {
      buildId: null,
      installDir: null,
    };
  }

  const values = parseAcf(fs.readFileSync(appmanifestPath, 'utf8'));
  return {
    buildId: values.buildid || null,
    installDir: values.installdir || null,
  };
}

function detectVrfCli(cliPath) {
  const candidates = [
    cliPath,
    'Source2Viewer-CLI',
    path.join(os.homedir(), '.local', 'bin', 'Source2Viewer-CLI'),
    path.join(os.homedir(), '.dotnet', 'tools', 'Source2Viewer-CLI'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      timeout: 10000,
    });

    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  return null;
}

function loadHeroNames() {
  const content = fs.readFileSync(HEROES_TS_PATH, 'utf8');
  const names = new Set();
  const regex = /name:\s*'([^']+)'/g;
  let match = regex.exec(content);

  while (match) {
    names.add(match[1]);
    match = regex.exec(content);
  }

  names.add('default');
  return Array.from(names).sort();
}

function listRelativeFiles(rootDir) {
  const results = [];

  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      results.push(path.relative(rootDir, absolutePath));
    }
  }

  if (fileExists(rootDir)) {
    visit(rootDir);
  }

  return results.sort();
}

function listAbsoluteFiles(rootDir) {
  return listRelativeFiles(rootDir).map((relativePath) => path.join(rootDir, relativePath));
}

function findFileByBaseName(files, baseName, predicate = () => true) {
  return files.find((filePath) => {
    const parsed = path.parse(filePath);
    return parsed.name === baseName && predicate(filePath);
  }) || null;
}

function findFirstFileByBaseNames(files, baseNames, predicate = () => true) {
  for (const baseName of baseNames) {
    const match = findFileByBaseName(files, baseName, predicate);
    if (match) {
      return match;
    }
  }

  return null;
}

function copyFile(sourcePath, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

async function copyTrimmedImage(sourcePath, destinationPath, padding = 0) {
  ensureDir(path.dirname(destinationPath));

  let pipeline = sharp(sourcePath).trim();
  if (padding > 0) {
    pipeline = pipeline.extend({
      top: padding,
      right: padding,
      bottom: padding,
      left: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  await pipeline
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      effort: 10,
    })
    .toFile(destinationPath);
}

async function generateHdMinimap(minimapDir) {
  const sourceCandidates = [
    path.join(minimapDir, 'minimap_source.png'),
    path.join(minimapDir, 'minimap_game.png'),
  ];
  const sourcePath = sourceCandidates.find((candidate) => fileExists(candidate)) || null;

  if (!sourcePath) {
    return null;
  }

  const outputPath = path.join(minimapDir, 'minimap.png');
  await sharp(sourcePath)
    .resize(DEFAULT_HD_MINIMAP_SIZE, DEFAULT_HD_MINIMAP_SIZE, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      effort: 10,
    })
    .toFile(outputPath);

  return {
    fileName: path.basename(outputPath),
    sourceFile: path.basename(sourcePath),
    size: DEFAULT_HD_MINIMAP_SIZE,
  };
}

function runVrfExtract(vrfCli, pakPath, filter, outputDir) {
  ensureDir(outputDir);

  const result = spawnSync(
    vrfCli,
    ['-i', pakPath, '-o', outputDir, '-d', '-f', filter],
    {
      encoding: 'utf8',
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024 * 32,
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(
      [
        `Source2Viewer-CLI failed for filter "${filter}"`,
        stdout ? `stdout:\n${stdout}` : null,
        stderr ? `stderr:\n${stderr}` : null,
      ].filter(Boolean).join('\n\n')
    );
  }
}

function syncHeroAssets(extractedRoot) {
  const heroNames = loadHeroNames();
  const files = listAbsoluteFiles(extractedRoot).filter((filePath) => filePath.endsWith('.png'));
  const portraitsDir = path.join(PUBLIC_DOTA_ASSETS_DIR, 'heroes');
  const iconsDir = path.join(portraitsDir, 'icons');

  ensureDir(portraitsDir);
  ensureDir(iconsDir);

  let portraitCount = 0;
  let iconCount = 0;

  for (const heroName of heroNames) {
    const baseName = heroName === 'default'
      ? 'npc_dota_hero_default_png'
      : `npc_dota_hero_${heroName}_png`;

    const portraitSource = findFileByBaseName(
      files,
      baseName,
      (filePath) => !filePath.includes(`${path.sep}icons${path.sep}`) && !filePath.includes(`${path.sep}selection${path.sep}`)
    );

    if (portraitSource) {
      copyFile(portraitSource, path.join(portraitsDir, `${heroName}.png`));
      portraitCount += 1;
    }

    const iconSource = findFileByBaseName(
      files,
      baseName,
      (filePath) => filePath.includes(`${path.sep}icons${path.sep}`)
    );

    if (iconSource) {
      copyFile(iconSource, path.join(iconsDir, `${heroName}.png`));
      iconCount += 1;
    }
  }

  return {
    portraitCount,
    iconCount,
  };
}

function syncItemAssets(extractedRoot) {
  const files = listAbsoluteFiles(extractedRoot).filter((filePath) => filePath.endsWith('.png'));
  const itemsDir = path.join(PUBLIC_DOTA_ASSETS_DIR, 'items');
  ensureDir(itemsDir);

  let itemCount = 0;

  for (const filePath of files) {
    const { name } = path.parse(filePath);
    if (!name.endsWith('_png')) {
      continue;
    }

    const normalizedName = name.slice(0, -4);
    copyFile(filePath, path.join(itemsDir, `${normalizedName}.png`));
    itemCount += 1;
  }

  return { itemCount };
}

async function syncMinimapAssets(extractedRoot) {
  const files = listAbsoluteFiles(extractedRoot).filter((filePath) => filePath.endsWith('.png'));
  const minimapDir = path.join(PUBLIC_DOTA_ASSETS_DIR, 'minimap');
  const iconsDir = path.join(minimapDir, 'icons');
  const referenceDir = path.join(minimapDir, 'reference');
  ensureDir(minimapDir);
  ensureDir(iconsDir);
  ensureDir(referenceDir);

  const mappings = [
    [['dota', 'dota_tga_d8178876'], 'minimap_source.png'],
    [['minimap_game_png', 'background_png'], 'minimap_game.png'],
    [['background_png'], 'background.png'],
    [['dotamap683_psd', 'dotamap_psd'], 'minimap_simple.png'],
    [['dota_minimal', 'dota_minimal_psd_f4e53729'], 'minimap_minimal.png'],
    [['dotamap_psd'], 'dotamap.png'],
    [['dotamap_radiant_buildings_psd'], 'dotamap_radiant_buildings.png'],
    [['dotamap_dire_buildings_psd'], 'dotamap_dire_buildings.png'],
  ];

  const iconMappings = [
    [['minimap_tower'], path.join(iconsDir, 'tower.png')],
    [['minimap_tower90'], path.join(iconsDir, 'tower_90.png')],
    [['minimap_racks45'], path.join(iconsDir, 'racks_45.png')],
    [['minimap_racks90'], path.join(iconsDir, 'racks_90.png')],
    [['minimap_ancient'], path.join(iconsDir, 'ancient.png')],
    [['minimap_miscbuilding'], path.join(iconsDir, 'miscbuilding.png')],
  ];

  const copied = [];

  for (const [baseNames, fileName] of mappings) {
    const source = findFirstFileByBaseNames(files, baseNames);
    if (!source) {
      continue;
    }

    copyFile(source, path.join(minimapDir, fileName));
    copied.push(fileName);
  }

  for (const [baseNames, destination] of iconMappings) {
    const source = findFirstFileByBaseNames(files, baseNames);
    if (!source) {
      continue;
    }

    copyFile(source, destination);
    copied.push(path.relative(minimapDir, destination));
  }

  const trimmedTowerRingSource = findFirstFileByBaseNames(files, ['radiant_mid_tier1_png', 'dire_mid_tier1_png']);
  if (trimmedTowerRingSource) {
    const destination = path.join(iconsDir, 'tower_outer.png');
    await copyTrimmedImage(trimmedTowerRingSource, destination, 2);
    copied.push(path.relative(minimapDir, destination));
  }

  const baseReferenceSource = findFirstFileByBaseNames(files, ['radiant_mid_base_png', 'dire_mid_base_png']);
  if (baseReferenceSource) {
    const destination = path.join(referenceDir, 'base_group.png');
    await copyTrimmedImage(baseReferenceSource, destination, 2);
    copied.push(path.relative(minimapDir, destination));
  }

  const generatedHdMinimap = await generateHdMinimap(minimapDir);
  if (generatedHdMinimap) {
    copied.push(generatedHdMinimap.fileName);
  }

  return {
    copied,
    generated: generatedHdMinimap,
  };
}

function syncTextAssets(extractedRoot) {
  const files = listAbsoluteFiles(extractedRoot);
  const outputRoot = path.join(EXTRACTED_DOTA_DIR, 'source');
  ensureDir(outputRoot);

  const mappings = [
    ['dota_english.txt', path.join(outputRoot, 'resource', 'localization', 'dota_english.txt')],
    ['dota_schinese.txt', path.join(outputRoot, 'resource', 'localization', 'dota_schinese.txt')],
    ['abilities_english.txt', path.join(outputRoot, 'resource', 'localization', 'abilities_english.txt')],
    ['abilities_schinese.txt', path.join(outputRoot, 'resource', 'localization', 'abilities_schinese.txt')],
    ['items_game.txt', path.join(outputRoot, 'scripts', 'items', 'items_game.txt')],
    ['items.txt', path.join(outputRoot, 'scripts', 'npc', 'items.txt')],
    ['neutral_items.txt', path.join(outputRoot, 'scripts', 'npc', 'neutral_items.txt')],
  ];

  const copied = [];

  for (const [fileName, destination] of mappings) {
    const source = files.find((filePath) => path.basename(filePath) === fileName);
    if (!source) {
      continue;
    }

    copyFile(source, destination);
    copied.push(path.relative(EXTRACTED_DOTA_DIR, destination));
  }

  return { copied };
}

function writeManifest(metadata) {
  ensureDir(EXTRACTED_DOTA_DIR);
  const manifestPath = path.join(EXTRACTED_DOTA_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return manifestPath;
}

function inspect(entries, options, metadata) {
  const byPrefix = (prefix) => entries.filter((entry) => entry.path.startsWith(prefix)).length;
  const currentHeroNames = loadHeroNames();

  const summary = {
    patch: options.patch,
    language: options.language,
    buildId: metadata.buildId,
    installDir: metadata.installDir,
    heroPortraitEntries: byPrefix('panorama/images/heroes/'),
    heroIconEntries: byPrefix('panorama/images/heroes/icons/'),
    itemEntries: byPrefix('panorama/images/items/'),
    minimapEntries: byPrefix('panorama/images/minimap/'),
    overviewEntries: byPrefix('materials/overviews/'),
    localizationEntries: byPrefix('resource/localization/'),
    itemsGameExists: entries.some((entry) => entry.path === 'scripts/items/items_game.txt'),
    npcItemsExists: entries.some((entry) => entry.path === 'scripts/npc/items.txt'),
    neutralItemsExists: entries.some((entry) => entry.path === 'scripts/npc/neutral_items.txt'),
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log('\nCanonical resources:');

  const canonicalPaths = [
    'panorama/images/minimap/background_png.vtex_c',
    'panorama/images/minimap/dotamap_psd.vtex_c',
    'panorama/images/textures/minimap_game_png.vtex_c',
    'panorama/images/textures/dotamap683_psd.vtex_c',
    'materials/overviews/dota.vmat_c',
    'resource/localization/dota_schinese.txt',
    'resource/localization/abilities_schinese.txt',
    'scripts/items/items_game.txt',
    'scripts/npc/items.txt',
    'scripts/npc/neutral_items.txt',
    'panorama/images/items/blink_png.vtex_c',
    'panorama/images/items/ultimate_scepter_png.vtex_c',
  ];

  const heroSamples = currentHeroNames
    .filter((heroName) => heroName !== 'default')
    .slice(0, 4)
    .map((heroName) => `panorama/images/heroes/npc_dota_hero_${heroName}_png.vtex_c`)
    .concat(
      currentHeroNames
        .filter((heroName) => heroName !== 'default')
        .slice(0, 4)
        .map((heroName) => `panorama/images/heroes/icons/npc_dota_hero_${heroName}_png.vtex_c`)
    );

  for (const candidate of canonicalPaths.concat(heroSamples)) {
    const exists = entries.some((entry) => entry.path === candidate);
    console.log(`  ${exists ? '[OK]' : '[MISS]'} ${candidate}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dotaRoot = resolveDotaRoot(options);
  const pakPath = resolvePakPath(options, dotaRoot);
  const metadata = readBuildMetadata(options.appmanifestPath);

  if (!fileExists(pakPath)) {
    throw new Error(`pak01_dir.vpk not found: ${pakPath}`);
  }

  console.log(`Dota root: ${dotaRoot}`);
  console.log(`VPK: ${pakPath}`);

  const directory = parseVpkDirectory(pakPath);
  console.log(`Parsed ${directory.entries.length} VPK entries`);

  if (options.inspect) {
    inspect(directory.entries, options, metadata);
    return;
  }

  const vrfCli = detectVrfCli(options.vrfCli);
  if (!vrfCli) {
    throw new Error(
      'Source2Viewer-CLI not found. Please pass --vrf-cli or set SOURCE2VIEWER_CLI to a working executable.'
    );
  }

  console.log(`Using Source2Viewer-CLI: ${vrfCli}`);

  const tempRoot = options.tempDir
    ? path.resolve(options.tempDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'truesight-dota-assets-'));

  console.log(`Temporary extraction dir: ${tempRoot}`);

  const categoryOutputs = {
    heroes: path.join(tempRoot, 'heroes'),
    items: path.join(tempRoot, 'items'),
    minimap: path.join(tempRoot, 'minimap'),
    texts: path.join(tempRoot, 'texts'),
  };

  for (const [category, filters] of Object.entries(EXTRACTION_FILTERS)) {
    for (const filter of filters) {
      console.log(`Extracting ${category}: ${filter}`);
      runVrfExtract(vrfCli, pakPath, filter, categoryOutputs[category]);
    }
  }

  const heroSync = syncHeroAssets(categoryOutputs.heroes);
  const itemSync = syncItemAssets(categoryOutputs.items);
  const minimapSync = await syncMinimapAssets(categoryOutputs.minimap);
  const textSync = syncTextAssets(categoryOutputs.texts);

  const manifestPath = writeManifest({
    source: 'local-dota-installation',
    patch: options.patch,
    language: options.language,
    buildId: metadata.buildId,
    installDir: metadata.installDir,
    extractedAt: new Date().toISOString(),
    vpkVersion: directory.version,
    outputs: {
      heroPortraits: heroSync.portraitCount,
      heroIcons: heroSync.iconCount,
      items: itemSync.itemCount,
      minimapFiles: minimapSync.copied,
      minimapDefaultSource: minimapSync.generated?.sourceFile || null,
      sourceTexts: textSync.copied,
    },
  });

  console.log('\nExtraction complete');
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Hero portraits synced: ${heroSync.portraitCount}`);
  console.log(`Hero icons synced: ${heroSync.iconCount}`);
  console.log(`Item icons synced: ${itemSync.itemCount}`);
  console.log(`Minimap files synced: ${minimapSync.copied.join(', ') || '(none)'}`);
  console.log(`Default minimap source: ${minimapSync.generated?.sourceFile || '(none)'}`);
  console.log(`Source texts synced: ${textSync.copied.join(', ') || '(none)'}`);
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error(`[sync-dota-game-assets] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();
