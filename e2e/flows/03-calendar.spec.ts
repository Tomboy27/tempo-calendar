import { test, expect } from '@playwright/test';

test.describe('Calendar workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-onboarding="calendar"]', { timeout: 15_000 });
  });

  test('calendar workspace is visible by default', async ({ page }) => {
    const workspace = page.locator('[data-onboarding="calendar"]');
    await expect(workspace).toBeVisible();
  });

  test('view-switcher buttons are present (day / week / month)', async ({ page }) => {
    const viewButtons = page.locator('button').filter({ hasText: /^(day|week|month)$/i });
    const count = await viewButtons.count();
    expect(count, 'at least one view-switcher button').toBeGreaterThanOrEqual(1);
  });

  test('time gutter shows hours (e.g. "9 AM", "10 AM")', async ({ page }) => {
    const timeGutterText = page.locator('text=/^\\d{1,2}\\s?[ap]m$/i').first();
    await expect(timeGutterText).toBeVisible({ timeout: 5_000 });
  });

  test('clicking an empty time slot opens the new-task dialog', async ({ page }) => {
    // The calendar renders time slots as divs with a data-hour attribute.
    const slots = page.locator('[data-hour]');
    const count = await slots.count();
    expect(count, 'time slots rendered').toBeGreaterThan(0);

    let clicked = false;
    for (let i = count - 1; i >= 0; i--) {
      const slot = slots.nth(i);
      const eventsOnSlot = await slot.locator('[data-event-id]').count();
      if (eventsOnSlot === 0) {
        await slot.click();
        clicked = true;
        break;
      }
    }
    if (clicked) {
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 3_000 });
    } else {
      test.skip(true, 'No empty time slots available in the visible range');
    }
  });
});
