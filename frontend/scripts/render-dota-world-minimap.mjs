#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');

function printUsage() {
  console.log(`Render a high-resolution Dota minimap from an exported world.glb.

Usage:
  node scripts/render-dota-world-minimap.mjs [options]

Options:
  --world-root <path>   Exported world root directory (default: /tmp/dota-world-glb)
  --output <path>       Output PNG path (default: public/assets/dota/minimap/minimap.png)
  --size <number>       Square output size in pixels (default: 3072)
  --padding <number>    Extra camera padding ratio (default: 0.035)
  --preview             Also write a preview copy next to the output
  --help                Show this help text
`);
}

function parseArgs(argv) {
  const options = {
    worldRoot: '/tmp/dota-world-glb',
    output: path.join(frontendRoot, 'public', 'assets', 'dota', 'minimap', 'minimap.png'),
    size: 3072,
    padding: 0.035,
    preview: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    switch (value) {
      case '--world-root':
        options.worldRoot = path.resolve(argv[++i]);
        break;
      case '--output':
        options.output = path.resolve(argv[++i]);
        break;
      case '--size':
        options.size = Number.parseInt(argv[++i] ?? '', 10);
        break;
      case '--padding':
        options.padding = Number.parseFloat(argv[++i] ?? '');
        break;
      case '--preview':
        options.preview = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${value}`);
    }
  }

  if (!Number.isFinite(options.size) || options.size < 512) {
    throw new Error(`Invalid --size value: ${options.size}`);
  }
  if (!Number.isFinite(options.padding) || options.padding < 0 || options.padding > 0.5) {
    throw new Error(`Invalid --padding value: ${options.padding}`);
  }

  return options;
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.glb':
      return 'model/gltf-binary';
    case '.bin':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

async function resolvePlaywrightChromium() {
  const candidatePaths = [
    path.join(repoRoot, 'harness', 'node_modules', 'playwright', 'index.mjs'),
    path.join(frontendRoot, 'node_modules', 'playwright', 'index.mjs'),
  ];

  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const imported = await import(pathToFileURL(candidate).href);
    if (imported.chromium) {
      return imported.chromium;
    }
  }

  throw new Error('Unable to find a local Playwright chromium entrypoint.');
}

async function createRenderServer({ worldRoot, size, padding }) {
  const threeRoot = path.join(frontendRoot, 'node_modules', 'three');
  const threeModulePath = path.join(threeRoot, 'build', 'three.module.js');
  const buildRoot = path.join(threeRoot, 'build');
  const examplesRoot = path.join(threeRoot, 'examples', 'jsm');
  const worldGlbPath = path.join(worldRoot, 'maps', 'dota', 'world.glb');

  await Promise.all([
    fsp.access(threeModulePath),
    fsp.access(examplesRoot),
    fsp.access(worldGlbPath),
  ]);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dota World Minimap Render</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0f172a;
      }
      canvas {
        display: block;
        width: 100vw;
        height: 100vh;
      }
    </style>
    <script type="importmap">
      {
        "imports": {
          "three": "/vendor/build/three.module.js",
          "three/addons/": "/vendor/examples/jsm/"
        }
      }
    </script>
  </head>
  <body>
    <canvas id="render-canvas"></canvas>
    <script type="module">
      import * as THREE from 'three';
      import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

      const canvas = document.getElementById('render-canvas');
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(1);
      renderer.setSize(${size}, ${size}, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.setClearColor(0x0f172a, 1);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);

      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync('/world/maps/dota/world.glb');
      const root = gltf.scene;

      root.traverse((object) => {
        if (!object.isMesh) {
          return;
        }

        object.frustumCulled = false;
        const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
        const materials = sourceMaterials.map((material) => new THREE.MeshBasicMaterial({
          map: material?.map ?? material?.emissiveMap ?? null,
          color: material?.color ? material.color.clone() : new THREE.Color(0xffffff),
          transparent: material?.transparent ?? true,
          opacity: material?.opacity ?? 1,
          alphaTest: material?.alphaTest ?? 0,
          side: THREE.FrontSide,
        }));
        object.material = Array.isArray(object.material) ? materials : materials[0];
      });

      scene.add(root);
      scene.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(root);
      const sizeVector = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const dimensions = [
        { axis: 'x', value: sizeVector.x },
        { axis: 'y', value: sizeVector.y },
        { axis: 'z', value: sizeVector.z },
      ].sort((left, right) => left.value - right.value);

      const upAxis = dimensions[0]?.axis ?? 'y';
      const camera = new THREE.OrthographicCamera();
      const extentByAxis = {
        x: Math.max(sizeVector.y, sizeVector.z),
        y: Math.max(sizeVector.x, sizeVector.z),
        z: Math.max(sizeVector.x, sizeVector.y),
      };
      const extent = extentByAxis[upAxis] * (1 + ${padding});
      const halfExtent = extent / 2;

      camera.left = -halfExtent;
      camera.right = halfExtent;
      camera.top = halfExtent;
      camera.bottom = -halfExtent;
      camera.near = 0.1;
      camera.far = Math.max(sizeVector.x, sizeVector.y, sizeVector.z) * 6;

      if (upAxis === 'x') {
        camera.position.set(box.max.x + 10, center.y, center.z);
        camera.up.set(0, 0, 1);
      } else if (upAxis === 'z') {
        camera.position.set(center.x, center.y, box.max.z + 10);
        camera.up.set(0, 1, 0);
      } else {
        camera.position.set(center.x, box.max.y + 10, center.z);
        camera.up.set(0, 0, -1);
      }

      camera.lookAt(center);
      camera.updateProjectionMatrix();

      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      renderer.render(scene, camera);

      window.renderState = {
        done: true,
        bbox: {
          min: box.min.toArray(),
          max: box.max.toArray(),
          size: sizeVector.toArray(),
          center: center.toArray(),
        },
        upAxis,
        extent,
      };
    </script>
  </body>
</html>`;

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/' || url.pathname === '/render') {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        response.end(html);
        return;
      }

      let filePath;
      if (url.pathname.startsWith('/vendor/build/')) {
        filePath = path.join(
          buildRoot,
          url.pathname.replace('/vendor/build/', ''),
        );
      } else if (url.pathname.startsWith('/vendor/examples/jsm/')) {
        filePath = path.join(
          examplesRoot,
          url.pathname.replace('/vendor/examples/jsm/', ''),
        );
      } else if (url.pathname.startsWith('/world/')) {
        filePath = path.join(worldRoot, url.pathname.replace('/world/', ''));
      }

      if (!filePath) {
        console.error(`[render-server] 404 ${url.pathname}`);
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const normalizedPath = path.normalize(filePath);
      if (
        (!normalizedPath.startsWith(path.normalize(examplesRoot))
          && !normalizedPath.startsWith(path.normalize(buildRoot))
          && !normalizedPath.startsWith(path.normalize(worldRoot))
          && normalizedPath !== path.normalize(threeModulePath))
        || !fs.existsSync(normalizedPath)
        || fs.statSync(normalizedPath).isDirectory()
      ) {
        console.error(`[render-server] 404 ${url.pathname}`);
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'Content-Type': contentTypeFor(normalizedPath),
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(normalizedPath).pipe(response);
    } catch (error) {
      response.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end(error instanceof Error ? error.message : 'Unknown server error');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve local render server address.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/render`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chromium = await resolvePlaywrightChromium();
  const { server, url } = await createRenderServer(options);

  await fsp.mkdir(path.dirname(options.output), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
    ],
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: options.size,
        height: options.size,
      },
      deviceScaleFactor: 1,
    });

    page.on('console', (message) => {
      const text = message.text();
      if (text) {
        console.log(`[render-page] ${text}`);
      }
    });
    page.on('pageerror', (error) => {
      console.error(`[render-page-error] ${error.message}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        console.error(`[render-response] ${response.status()} ${response.url()}`);
      }
    });

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 120_000,
    });

    await page.waitForFunction(() => window.renderState?.done === true, {
      timeout: 120_000,
    });

    const renderState = await page.evaluate(() => window.renderState);
    console.log(`Detected up axis: ${renderState.upAxis}`);
    console.log(`Bounding box size: ${renderState.bbox.size.join(' x ')}`);
    console.log(`Using orthographic extent: ${renderState.extent}`);

    const screenshotBuffer = await page.screenshot({
      type: 'png',
    });

    await sharp(screenshotBuffer)
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toFile(options.output);

    if (options.preview) {
      const previewPath = options.output.replace(/\.png$/i, '.preview.png');
      await fsp.copyFile(options.output, previewPath);
      console.log(`Wrote preview copy: ${previewPath}`);
    }

    console.log(`Wrote rendered minimap: ${options.output}`);
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
