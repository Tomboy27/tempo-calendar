#!/usr/bin/env node
/**
 * One-off UI/UX visual review for FlowSavvy.
 * Auto-detects sign-in (no manual Enter required). Robust to the user
 * accidentally closing the Chrome window: detects it and exits cleanly.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { exit } from 'node:process';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = 'http://localhost:5175/?dev_bypass=1';
const OUT_DIR = path.join(os.tmpdir(), 'flowsavvy-review');
const SUPABASE_AUTH_KEY = 'sb-zpmhsckclybdhcltfxbnp-auth-token';
const AUTH_TIMEOUT_MS = 10 * 60_000;
const AUTH_POLL_MS = 1_500;

await mkdir(OUT_DIR, { recursive: true });
console.log(`[review] Output dir: ${OUT_DIR}`);

const consoleErrors = [];
const consoleWarnings = [];
const failedRequests = [];

let browser;
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    slowMo: 30,
  });
} catch (e) {
  console.error(`[review] Failed to launch Chrome: ${e.message}`);
  console.error('  Hint: open Chrome once manually so the user-data-dir is created, then re-run.');
  exit(1);
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error') consoleErrors.push(text);
  if (msg.type() === 'warning') consoleWarnings.push(text);
});
page.on('pageerror', (err) => { consoleErrors.push(`PAGE ERROR: ${err.message}`); });
page.on('requestfailed', (req) => {
  failedRequests.push({ url: req.url(), error: req.failure()?.errorText ?? 'unknown' });
});

const isBrowserAlive = async () => {
  try {
    return browser.isConnected() && !page.isClosed();
  } catch { return false; }
};

const safeClose = async () => {
  try { await browser.close(); } catch { /* already closed */ }
};

console.log(`\n[review] Opening ${BASE_URL} ...\n`);
try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-onboarding]', { timeout: 30_000 })
    .catch(() => console.log('[review] No [data-onboarding] element appeared in 30s (expected on auth screen).'));
} catch (e) {
  console.error(`[review] Initial navigation failed: ${e.message}`);
  await safeClose();
  exit(1);
}

console.log('---' + '-'.repeat(54));
console.log('>>> READY <<<');
console.log('A Chrome window just opened with the dev auth bypass active (?dev_bypass=1).');
console.log('The script auto-detects the calendar shell and starts capturing within seconds.');
console.log('DO NOT close the Chrome window. Timeout: 10 min.');
console.log('Press Ctrl-C in this terminal to abort.\n');

const calendarDeadline = Date.now() + AUTH_TIMEOUT_MS;
let signedIn = false;
let browserDied = false;

while (Date.now() < calendarDeadline) {
  if (!(await isBrowserAlive())) { browserDied = true; break; }
  try {
    signedIn = await page.locator('[data-onboarding="calendar"]').isVisible({ timeout: 500 }).catch(() => false);
  } catch { /* swallow */ }
  if (signedIn) break;
  process.stdout.write('[review] waiting for calendar shell...\n');
  try { await page.waitForTimeout(AUTH_POLL_MS); } catch { browserDied = true; break; }
}

if (browserDied) {
  console.error('\n[review] The Chrome window was closed before the calendar appeared.');
  console.error('  Re-run the script and KEEP the Chrome window open.');
  await safeClose();
  exit(2);
}

if (!signedIn) {
  console.error('\n[review] Calendar shell did not appear in 10min.');
  await safeClose();
  exit(1);
}

console.log('\n[review] Calendar shell detected. Starting visual review...\n');

const shot = async (name, opts = {}) => {
  if (!(await isBrowserAlive())) { console.log(`  [skipped] ${name}.png (browser closed)`); return null; }
  try {
    const path = `${OUT_DIR}/${name}.png`;
    await page.screenshot({ path, fullPage: opts.fullPage ?? true });
    console.log(`  ${name}.png`);
    return path;
  } catch (e) {
    console.log(`  [error] ${name}.png: ${e.message}`);
    return null;
  }
};

const tryClick = async (selectorOrLocator, timeoutMs = 2_000) => {
  try {
    const loc = typeof selectorOrLocator === 'string' ? page.locator(selectorOrLocator) : selectorOrLocator;
    if (await loc.first().isVisible({ timeout: timeoutMs })) {
      await loc.first().click();
      return true;
    }
  } catch { /* swallow */ }
  return false;
};

const tryClickByText = async (regex, timeoutMs = 2_000) => {
  return tryClick(page.locator('button, a, [role="button"]').filter({ hasText: regex }), timeoutMs);
};

try {
  await page.waitForSelector('[data-onboarding="calendar"]', { timeout: 15_000 });
} catch {
  console.log('[review] Calendar shell did not appear in 15s. Proceeding anyway.');
}
await page.waitForTimeout(500);
await shot('01-week-view');

if (await tryClickByText(/^day$/i)) { await page.waitForTimeout(700); await shot('02-day-view'); }
if (await tryClickByText(/^month$/i)) { await page.waitForTimeout(700); await shot('03-month-view'); }
if (await tryClickByText(/^agenda$/i)) { await page.waitForTimeout(700); await shot('04-agenda-view'); }
if (await tryClickByText(/^week$/i)) { await page.waitForTimeout(500); }

if (await tryClickByText(/^tasks$/i, 3_000)) { await page.waitForTimeout(900); await shot('05-task-list'); }

const dialogOpened =
  (await tryClickByText(/add task|new task|\+ task/i, 2_000)) ||
  (await tryClick(page.locator('[aria-label="New task"], [aria-label="Add task"]').first(), 2_000)) ||
  (await tryClick(page.locator('button:has(svg.lucide-plus), button:has(.lucide-plus)').first(), 1_000));

if (dialogOpened) {
  await page.waitForTimeout(700);
  await shot('06-task-dialog');
  if (await tryClickByText(/advanced|expert|more options|show more/i, 1_500)) {
    await page.waitForTimeout(500);
    await shot('07-task-dialog-advanced');
    await tryClickByText(/hide|less|collapse/i, 1_000);
  }
  await tryClick(page.locator('button[aria-label="Close"]').first(), 1_500);
  await page.waitForTimeout(400);
}

await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(700);
await shot('08-mobile-375');

await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(700);
await shot('09-tablet-768');

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);
await shot('10-desktop-final');

if (await tryClick(page.locator('button:has(svg.lucide-user), [aria-label*="user" i], [aria-label*="menu" i]').first(), 2_000)) {
  await page.waitForTimeout(400);
  await shot('11-header-menu');
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(10, 10).catch(() => {});
  await page.waitForTimeout(300);
}

await writeFile(
  `${OUT_DIR}/console.json`,
  JSON.stringify({ errors: consoleErrors, warnings: consoleWarnings, failedRequests }, null, 2),
);

console.log('\n---' + '-'.repeat(54));
console.log(`Console errors:   ${consoleErrors.length}`);
consoleErrors.forEach((e, i) => console.log(`  [${i + 1}] ${e}`));
console.log(`Console warnings: ${consoleWarnings.length}`);
consoleWarnings.slice(0, 15).forEach((w, i) => console.log(`  [${i + 1}] ${w}`));
console.log(`Failed requests:  ${failedRequests.length}`);
failedRequests.slice(0, 10).forEach((f, i) => console.log(`  [${i + 1}] ${f.url} - ${f.error}`));
console.log(`\nDone. ${OUT_DIR}/ is ready for review.`);
await safeClose();

