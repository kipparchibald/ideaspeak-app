import { chromium } from 'playwright';

const url = process.argv[2] || 'https://ideaspeak-app.vercel.app';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const rootText = await page.locator('#root').innerText().catch(() => '');
  const title = await page.title();
  console.log(JSON.stringify({ url, title, rootTextLen: rootText.length, rootPreview: rootText.slice(0, 200), errors }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ url, fatal: String(e), errors }, null, 2));
}
await browser.close();