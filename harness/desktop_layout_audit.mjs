import { chromium } from 'playwright';

const baseUrl = 'http://127.0.0.1:4175';
const outputDir = '/tmp/truesight-desktop-audit';

const pageSpecs = [
  { hash: '#/openDotaLive', fileName: 'open-dota-live.png' },
  { hash: '#/replayLibrary', fileName: 'replay-library.png' },
  { hash: '#/matchDatabase', fileName: 'match-database.png' },
  { hash: '#/teamProfile', fileName: 'team-profile.png' },
];

async function ensureOutputDir() {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(outputDir, { recursive: true });
}

async function capture() {
  await ensureOutputDir();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

  try {
    for (const spec of pageSpecs) {
      await page.goto(`${baseUrl}/${spec.hash}`, { waitUntil: 'networkidle' });
      await page.waitForLoadState('networkidle');
      console.log('path:', await page.evaluate(() => window.location.hash));
      await page.screenshot({ path: `${outputDir}/${spec.fileName}` });
    }
  } finally {
    await browser.close();
  }
}

capture().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
