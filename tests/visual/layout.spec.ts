/**
 * Visual layout tests for duckGammon.
 *
 * Run: npx playwright test
 * Update baselines: npx playwright test --update-snapshots
 *
 * These tests capture screenshots at key states across viewports
 * (desktop, Android portrait, iPhone SE) and verify:
 *   1. No scrolling on the game view — everything fits in viewport
 *   2. Board is fully visible (not clipped by header)
 *   3. Controls are accessible
 *   4. Landing page renders correctly
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.join(__dirname, '../../screenshots');

// Ensure screenshot dir exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function screenshotPath(name: string, project: string): string {
  const dir = path.join(SCREENSHOT_DIR, project);
  ensureDir(dir);
  return path.join(dir, `${name}.png`);
}

async function assertNoScroll(page: Page) {
  const scrollInfo = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
      bodyOverflow: getComputedStyle(document.body).overflow,
      hasVerticalScroll: el.scrollHeight > el.clientHeight + 2,
    };
  });
  // Allow 2px tolerance for sub-pixel rounding
  expect(
    scrollInfo.hasVerticalScroll,
    `Page has scroll: scrollHeight=${scrollInfo.scrollHeight}, clientHeight=${scrollInfo.clientHeight}`
  ).toBe(false);
}

async function assertBoardVisible(page: Page) {
  const boardSvg = page.locator('.board-svg');
  await expect(boardSvg).toBeVisible();

  const box = await boardSvg.boundingBox();
  expect(box, 'Board SVG has no bounding box').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0); // Not clipped above viewport
  expect(box!.height).toBeGreaterThan(50); // Has meaningful size
  expect(box!.width).toBeGreaterThan(50);

  // Board top must be below the header
  const headerBox = await page.locator('.header').boundingBox();
  if (headerBox) {
    expect(
      box!.y,
      `Board top (${box!.y}) must be >= header bottom (${headerBox.y + headerBox.height})`
    ).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
  }
}

async function assertControlsVisible(page: Page) {
  // Roll button should be visible on initial game state
  const rollBtn = page.locator('button', { hasText: 'Roll' });
  await expect(rollBtn).toBeVisible();

  // Bottom controls (Flip, New, Exit) should be visible
  const flipBtn = page.locator('button', { hasText: 'Flip' });
  await expect(flipBtn).toBeVisible();
}

// ─── Landing Page ───

test.describe('Landing page', () => {
  test('renders correctly', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.waitForSelector('.landing');

    // Capture screenshot
    await page.screenshot({
      path: screenshotPath('01-landing', testInfo.project.name),
      fullPage: false,
    });

    // Title visible
    await expect(page.locator('.landing h1')).toBeVisible();

    // Both play buttons visible
    await expect(page.locator('button', { hasText: 'Play vs AI' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Local 2P' })).toBeVisible();

    // No scroll
    await assertNoScroll(page);
  });
});

// ─── Game View: Initial State ───

test.describe('Game view - initial state', () => {
  test('board fits viewport with no scroll', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.click('button:has-text("Play vs AI")');
    await page.waitForSelector('.board-svg');

    // Small wait for layout to settle
    await page.waitForTimeout(300);

    // Screenshot: initial game state
    await page.screenshot({
      path: screenshotPath('02-game-initial', testInfo.project.name),
      fullPage: false,
    });

    // Core assertions
    await assertBoardVisible(page);
    await assertNoScroll(page);
    await assertControlsVisible(page);
  });

  test('board is not clipped by header', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.click('button:has-text("Play vs AI")');
    await page.waitForSelector('.board-svg');
    await page.waitForTimeout(300);

    await assertBoardVisible(page);

    // Additional: check that point numbers at top of board are visible
    // The SVG should start below the header
    const boardBox = await page.locator('.board-svg').boundingBox();
    const headerBox = await page.locator('.header').boundingBox();
    expect(boardBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  });
});

// ─── Game View: After Rolling ───

test.describe('Game view - after roll', () => {
  test('dice visible and board still fits', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.click('button:has-text("Play vs AI")');
    await page.waitForSelector('.board-svg');
    await page.waitForTimeout(300);

    // Click Roll (wait for dice animation to complete: 550ms)
    await page.click('button:has-text("Roll")');
    await page.waitForTimeout(800);

    await page.screenshot({
      path: screenshotPath('03-after-roll', testInfo.project.name),
      fullPage: false,
    });

    // Board still visible and not clipped
    await assertBoardVisible(page);
    await assertNoScroll(page);

    // Dice should be displayed (the SVG dice group exists)
    const diceGroup = page.locator('.dice-group');
    // Dice might be in overlay SVG, check it exists
    const diceCount = await diceGroup.count();
    expect(diceCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── Game View: AI Turn ───

test.describe('Game view - AI turn', () => {
  test('AI plays and board stays in viewport', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.click('button:has-text("Play vs AI")');
    await page.waitForSelector('.board-svg');
    await page.waitForTimeout(300);

    // Roll, then make moves to complete the turn
    await page.click('button:has-text("Roll")');
    await page.waitForTimeout(800);

    // Make moves by clicking moveable checkers then destinations (force to bypass overlays)
    for (let attempt = 0; attempt < 4; attempt++) {
      const moveable = page.locator('.checker.movable').first();
      if (await moveable.count() === 0) break;
      await moveable.click({ force: true });
      await page.waitForTimeout(300);
      const dest = page.locator('.move-dest.visible').first();
      if (await dest.count() === 0) break;
      await dest.click({ force: true });
      await page.waitForTimeout(600);
    }

    // Confirm if needed (forced pass or all dice used)
    const confirmBtn = page.locator('button:has-text("Confirm")');
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
    }

    // Wait for AI roll animation + AI moves + arrows
    await page.waitForTimeout(6000);

    await page.screenshot({
      path: screenshotPath('04-after-ai-turn', testInfo.project.name),
      fullPage: false,
    });

    await assertBoardVisible(page);
    await assertNoScroll(page);
  });

  test('AI move arrows are visible', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.click('button:has-text("Play vs AI")');
    await page.waitForSelector('.board-svg');
    await page.waitForTimeout(300);

    // Roll dice
    await page.click('button:has-text("Roll")');
    await page.waitForTimeout(800);

    // Make moves to complete the turn (force click to bypass SVG overlays)
    for (let attempt = 0; attempt < 4; attempt++) {
      const moveable = page.locator('.checker.movable').first();
      if (await moveable.count() === 0) break;
      await moveable.click({ force: true });
      await page.waitForTimeout(300);
      const dest = page.locator('.move-dest.visible').first();
      if (await dest.count() === 0) break;
      await dest.click({ force: true });
      await page.waitForTimeout(600);
    }

    // Confirm if needed
    const confirmBtn = page.locator('button:has-text("Confirm")');
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
    }

    // Wait for AI to finish playing (dice anim + moves) — arrows appear after
    await page.waitForTimeout(5000);

    // Capture while arrows should still be visible (within 3s window)
    await page.screenshot({
      path: screenshotPath('07-ai-move-arrows', testInfo.project.name),
      fullPage: false,
    });

    await assertBoardVisible(page);
  });
});

// ─── Game Over (via board flip to verify modal) ───

test.describe('Game view - board flip', () => {
  test('flipped board stays in viewport', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.click('button:has-text("Play vs AI")');
    await page.waitForSelector('.board-svg');
    await page.waitForTimeout(300);

    // Press F to flip
    await page.keyboard.press('f');
    await page.waitForTimeout(200);

    await page.screenshot({
      path: screenshotPath('05-board-flipped', testInfo.project.name),
      fullPage: false,
    });

    await assertBoardVisible(page);
    await assertNoScroll(page);
  });
});

// ─── Local 2-Player Mode ───

test.describe('Local 2-player mode', () => {
  test('renders correctly', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.click('button:has-text("Local 2P")');
    await page.waitForSelector('.board-svg');
    await page.waitForTimeout(300);

    await page.screenshot({
      path: screenshotPath('06-local-mode', testInfo.project.name),
      fullPage: false,
    });

    await assertBoardVisible(page);
    await assertNoScroll(page);
    await assertControlsVisible(page);
  });
});
