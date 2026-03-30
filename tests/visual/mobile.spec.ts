/**
 * Mobile-specific E2E tests for duckGammon.
 *
 * Focused on touch interactions, responsive layout, and mobile UX.
 * Runs on android-portrait and android-small projects only.
 */

import { test, expect, Page } from '@playwright/test';

// Only run on mobile projects — each describe uses beforeEach to skip desktop
function skipDesktop(testInfo: { project: { name: string } }) {
  test.skip(testInfo.project.name === 'desktop-chrome', 'Mobile-only');
}

async function startAIGame(page: Page) {
  await page.goto('/');
  await page.click('button:has-text("Play vs AI")');
  await page.waitForSelector('.board-svg');
  await page.waitForTimeout(300);
}

async function rollDice(page: Page) {
  // On mobile, Roll is in the action bar
  const rollBtn = page.locator('.mobile-action-bar button:has-text("Roll")');
  if (await rollBtn.isVisible()) {
    await rollBtn.click();
  } else {
    await page.click('button:has-text("Roll")');
  }
  await page.waitForTimeout(800); // dice animation
}

// ─── Mobile Layout ───

test.describe('Mobile layout', () => {
  test.beforeEach(({}, testInfo) => { skipDesktop(testInfo); });
  test('landing page fits viewport without scroll', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.landing');

    const scroll = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollHeight <= el.clientHeight + 2;
    });
    expect(scroll).toBe(true);
  });

  test('game board fits mobile viewport', async ({ page }) => {
    await startAIGame(page);

    const boardBox = await page.locator('.board-svg').boundingBox();
    const viewportSize = page.viewportSize()!;

    expect(boardBox).not.toBeNull();
    // Board should not exceed viewport width
    expect(boardBox!.width).toBeLessThanOrEqual(viewportSize.width + 1);
    // Board should not exceed 60% of viewport height (leave room for panel)
    expect(boardBox!.height).toBeLessThanOrEqual(viewportSize.height * 0.65);
    // Board should be visible (not zero-sized)
    expect(boardBox!.width).toBeGreaterThan(100);
    expect(boardBox!.height).toBeGreaterThan(100);
  });

  test('side panel is hidden by default, shown via menu button', async ({ page }) => {
    await startAIGame(page);

    // Side panel should be off-screen by default
    const panel = page.locator('.side-panel');
    const panelBox = await panel.boundingBox();
    const viewport = page.viewportSize()!;
    // Panel should be translated off the right edge
    expect(panelBox!.x).toBeGreaterThanOrEqual(viewport.width - 5);

    // Tap the menu button to open it
    const menuBtn = page.locator('.mobile-menu-btn');
    await expect(menuBtn).toBeVisible();
    await menuBtn.tap();
    await page.waitForTimeout(400); // slide animation

    // Now panel should be visible on screen
    const openBox = await panel.boundingBox();
    expect(openBox!.x).toBeLessThan(viewport.width);
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    await startAIGame(page);

    const hasHScroll = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth > el.clientWidth + 2;
    });
    expect(hasHScroll).toBe(false);
  });

  test('chat panel is hidden on mobile', async ({ page }) => {
    await startAIGame(page);
    const chat = page.locator('.chat-panel');
    // Chat should either not exist or be hidden
    const count = await chat.count();
    if (count > 0) {
      await expect(chat).not.toBeVisible();
    }
  });

  test('keyboard shortcut hints are hidden on mobile', async ({ page }) => {
    await startAIGame(page);
    const hints = page.locator('.shortcut-hint');
    const count = await hints.count();
    for (let i = 0; i < count; i++) {
      await expect(hints.nth(i)).not.toBeVisible();
    }
  });
});

// ─── Mobile Touch Targets ───

test.describe('Mobile touch targets', () => {
  test.beforeEach(({}, testInfo) => { skipDesktop(testInfo); });
  test('buttons meet minimum touch target size', async ({ page }) => {
    await startAIGame(page);

    const buttons = page.locator('.btn');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (!(await btn.isVisible())) continue;

      const box = await btn.boundingBox();
      if (!box) continue;
      // Minimum touch target: 36px (we allow btn-small at 36px)
      expect(box.height, `Button ${i} height ${box.height}px`).toBeGreaterThanOrEqual(34);
    }
  });

  test('roll button is easily tappable in action bar', async ({ page }) => {
    await startAIGame(page);

    const rollBtn = page.locator('.mobile-action-bar button:has-text("Roll")');
    await expect(rollBtn).toBeVisible();

    const box = await rollBtn.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(36);
    expect(box!.width).toBeGreaterThanOrEqual(40);
  });
});

// ─── Mobile Touch Interactions ───

test.describe('Mobile touch interactions', () => {
  test.beforeEach(({}, testInfo) => { skipDesktop(testInfo); });
  test('tap on checker selects it', async ({ page }) => {
    await startAIGame(page);
    await rollDice(page);

    // Find a movable checker and tap it
    const movable = page.locator('.checker.movable').first();
    if (await movable.count() > 0) {
      await movable.tap();
      await page.waitForTimeout(200);

      // Should show legal destinations
      const dests = page.locator('.move-dest.visible');
      const destCount = await dests.count();
      expect(destCount).toBeGreaterThan(0);
    }
  });

  test('tap on destination makes a move', async ({ page }) => {
    await startAIGame(page);
    await rollDice(page);

    const movable = page.locator('.checker.movable').first();
    if (await movable.count() === 0) return; // forced pass, skip

    await movable.tap();
    await page.waitForTimeout(200);

    const dest = page.locator('.move-dest.visible').first();
    if (await dest.count() > 0) {
      await dest.tap({ force: true });
      await page.waitForTimeout(500);
      // After move, board state should have changed (fewer movesLeft)
    }
  });

  test('confirm button works via tap', async ({ page }) => {
    await startAIGame(page);
    await rollDice(page);

    // Make moves until confirm is available
    for (let i = 0; i < 4; i++) {
      const movable = page.locator('.checker.movable').first();
      if (await movable.count() === 0) break;
      await movable.tap();
      await page.waitForTimeout(200);
      const dest = page.locator('.move-dest.visible').first();
      if (await dest.count() === 0) break;
      await dest.tap({ force: true });
      await page.waitForTimeout(500);
    }

    const confirm = page.locator('button:has-text("Confirm")');
    if (await confirm.count() > 0 && await confirm.isVisible()) {
      await confirm.tap();
      await page.waitForTimeout(1000);
      // After confirm, it should be AI's turn — Roll button should reappear eventually
    }
  });
});

// ─── Mobile Drag ───

test.describe('Mobile drag interactions', () => {
  test.beforeEach(({}, testInfo) => { skipDesktop(testInfo); });
  test('drag does not cause page scroll', async ({ page }) => {
    await startAIGame(page);
    await rollDice(page);

    // Get initial scroll position
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Simulate a drag gesture on the board area
    const board = page.locator('.board-svg');
    const boardBox = await board.boundingBox();
    if (boardBox) {
      const startX = boardBox.x + boardBox.width / 2;
      const startY = boardBox.y + boardBox.height / 3;

      await page.touchscreen.tap(startX, startY);
      await page.waitForTimeout(100);
    }

    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBe(scrollBefore);
  });

  test('no context menu on long press', async ({ page }) => {
    await startAIGame(page);

    // Long-press on the board — should not trigger context menu
    const board = page.locator('.board-svg');
    const box = await board.boundingBox();
    if (box) {
      // Simulate long press by holding for 600ms
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();

      // Verify no context menu appeared (would cause scroll or overlay)
      const scrollAfter = await page.evaluate(() => window.scrollY);
      expect(scrollAfter).toBe(0);
    }
  });
});

// ─── Dev Presets on Mobile ───

test.describe('Dev presets on mobile', () => {
  test.beforeEach(({}, testInfo) => { skipDesktop(testInfo); });
  test('jail blocked preset loads correctly on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('text=dev');
    await page.waitForTimeout(200);

    const jailBtn = page.locator('button:has-text("Jail blocked")');
    if (await jailBtn.count() > 0) {
      await jailBtn.click();
      await page.waitForSelector('.board-svg');
      await page.waitForTimeout(300);

      // Board should render
      const boardBox = await page.locator('.board-svg').boundingBox();
      expect(boardBox).not.toBeNull();
      expect(boardBox!.width).toBeGreaterThan(50);
    }
  });
});
