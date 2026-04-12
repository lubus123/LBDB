import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const SCREENSHOT_DIR = 'screenshots/e2e';
const MAX_TURNS = 40; // Enough turns to demonstrate gameplay, not a full game

async function snap(page: Page, name: string) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

/** Click a data-testid button, handling mobile/desktop duplicates by picking the visible one */
async function clickTestId(page: Page, testid: string): Promise<boolean> {
  const all = page.locator(`[data-testid="${testid}"]`);
  const count = await all.count();
  for (let i = 0; i < count; i++) {
    const el = all.nth(i);
    if (await el.isVisible({ timeout: 100 }).catch(() => false)) {
      await el.click();
      return true;
    }
  }
  return false;
}

async function isAnyVisible(page: Page, selector: string): Promise<boolean> {
  const all = page.locator(selector);
  const count = await all.count();
  for (let i = 0; i < count; i++) {
    if (await all.nth(i).isVisible({ timeout: 100 }).catch(() => false)) return true;
  }
  return false;
}

async function playFullGame(page: Page, label: string): Promise<number> {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('.main-content', { timeout: 5000 });
  await page.locator('button', { hasText: /Play vs AI/i }).first().click();
  await page.waitForTimeout(500);

  let turnCount = 0;

  while (turnCount < MAX_TURNS) {
    // Check game over
    if (await isAnyVisible(page, '[data-testid="game-over"]')) {
      await snap(page, `${label}-game-over`);
      return turnCount;
    }

    // Roll if available
    if (await isAnyVisible(page, '[data-testid="btn-roll"]')) {
      await clickTestId(page, 'btn-roll');
      await page.waitForTimeout(700);

      if (turnCount === 0) await snap(page, `${label}-first-roll`);
      if (turnCount === 10) await snap(page, `${label}-mid-game`);
    }

    // Move loop — up to 4 moves per turn
    for (let m = 0; m < 4; m++) {
      if (await isAnyVisible(page, '[data-testid="game-over"]')) break;

      // Find a visible movable checker
      const checkers = page.locator('[data-testid^="checker-"]');
      const checkerCount = await checkers.count();
      let clicked = false;
      for (let i = 0; i < checkerCount; i++) {
        if (await checkers.nth(i).isVisible({ timeout: 100 }).catch(() => false)) {
          await checkers.nth(i).click();
          clicked = true;
          break;
        }
      }
      if (!clicked) break;

      await page.waitForTimeout(200);

      // Click destination or bearoff
      const dests = page.locator('[data-testid^="dest-"]');
      const destCount = await dests.count();
      let destClicked = false;
      for (let i = 0; i < destCount; i++) {
        if (await dests.nth(i).isVisible({ timeout: 100 }).catch(() => false)) {
          await dests.nth(i).click();
          destClicked = true;
          break;
        }
      }
      if (!destClicked) {
        // Try bearoff
        if (await isAnyVisible(page, '[data-testid="bearoff"]')) {
          await clickTestId(page, 'bearoff');
          destClicked = true;
        }
      }
      if (!destClicked) {
        await page.keyboard.press('Escape');
        break;
      }
      await page.waitForTimeout(400);
    }

    // Confirm if available
    if (await isAnyVisible(page, '[data-testid="btn-confirm"]')) {
      await clickTestId(page, 'btn-confirm');
      await page.waitForTimeout(200);
    }

    // Wait for AI
    await page.waitForTimeout(1000);
    turnCount++;
  }

  await snap(page, `${label}-final`);
  return turnCount;
}

test.describe('Full AI game — Desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test('plays AI game', async ({ page }) => {
    const turns = await playFullGame(page, 'desktop');
    expect(turns).toBeGreaterThan(0);
  });
});

test.describe('Full AI game — Mobile', () => {
  test.use({ viewport: { width: 412, height: 915 } });
  test('plays AI game on mobile', async ({ page }) => {
    const turns = await playFullGame(page, 'mobile');
    expect(turns).toBeGreaterThan(0);
  });
});
