import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const DIR = 'screenshots/landscape-strips';
fs.mkdirSync(DIR, { recursive: true });

const LANDSCAPE = {
  'pixel7':   { width: 915, height: 412 },
  'iphone-se': { width: 667, height: 375 },
  'galaxy-s5': { width: 640, height: 360 },
};

for (const [name, viewport] of Object.entries(LANDSCAPE)) {
  test.describe(`Landscape strips: ${name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test('header fixed-left strip, action bar fixed-right strip', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content', { timeout: 5000 });
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);

      const headerBox = await page.locator('.header').boundingBox();
      expect(headerBox).not.toBeNull();
      expect(headerBox!.x).toBe(0);
      expect(headerBox!.y).toBe(0);
      expect(headerBox!.width).toBeLessThanOrEqual(56);
      expect(headerBox!.width).toBeGreaterThanOrEqual(40);
      expect(headerBox!.height).toBeGreaterThanOrEqual(viewport.height - 10);

      const barBox = await page.locator('.mobile-action-bar').boundingBox();
      expect(barBox).not.toBeNull();
      expect(barBox!.width).toBeLessThanOrEqual(70);
      expect(barBox!.width).toBeGreaterThanOrEqual(50);
      expect(barBox!.x + barBox!.width).toBeGreaterThanOrEqual(viewport.width - 2);

      await page.screenshot({ path: `${DIR}/${name}-game.png` });
    });

    test('roll icon visible, label hidden', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content', { timeout: 5000 });
      await page.locator('button', { hasText: /Play vs AI/i }).first().click();
      await page.waitForTimeout(500);

      const icon = page.locator('.mobile-action-bar .roll-icon svg').first();
      await expect(icon).toBeVisible();

      const label = page.locator('.mobile-action-bar .roll-label').first();
      await expect(label).toBeHidden();
    });

    test('login icon visible, text hidden', async ({ page }) => {
      await page.goto('http://localhost:8080');
      await page.waitForSelector('.main-content', { timeout: 5000 });
      await page.waitForTimeout(300);

      const icon = page.locator('.auth-icon').first();
      await expect(icon).toBeVisible();

      const label = page.locator('.auth-label').first();
      await expect(label).toBeHidden();
    });
  });
}

test.describe('Portrait regression (Pixel 7 412x915)', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('header horizontal, action bar bottom, Login text visible', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('.main-content', { timeout: 5000 });
    await page.locator('button', { hasText: /Play vs AI/i }).first().click();
    await page.waitForTimeout(500);

    const headerBox = await page.locator('.header').boundingBox();
    expect(headerBox!.width).toBeGreaterThanOrEqual(400);
    expect(headerBox!.height).toBeLessThanOrEqual(80);

    const barBox = await page.locator('.mobile-action-bar').boundingBox();
    expect(barBox!.width).toBeGreaterThanOrEqual(400);
    expect(barBox!.y + barBox!.height).toBeGreaterThanOrEqual(900);

    const label = page.locator('.auth-label').first();
    await expect(label).toBeVisible();
  });
});
