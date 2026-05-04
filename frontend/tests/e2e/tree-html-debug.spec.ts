import { test, expect } from '@playwright/test';
import { createNewProject, resetE2ETemplateFixture } from './utils';

test('tree shows add-child controls for root nodes that allow children', async ({ page }) => {
  await resetE2ETemplateFixture();
  await page.goto('/');

  await createNewProject(page, 'Debug Project');

  const tree = page.locator('[data-testid="tree-item-row"]');
  await expect(tree.first()).toBeVisible({ timeout: 10000 });

  const addChildBtn = page.locator('[data-testid="add-child-btn"]').first();
  await expect(addChildBtn).toBeVisible({ timeout: 5000 });

  await addChildBtn.click();

  const flyout = page.locator('[data-testid="add-child-flyout"]');
  await expect(flyout).toBeVisible({ timeout: 5000 });

  // e2e_smoketest fixture allows phase/task/person under root.
  await expect(flyout.locator('[data-testid="add-child-flyout-option"]', { hasText: /Add\s+Phase/i }).first()).toBeVisible({ timeout: 5000 });
  await expect(flyout.locator('[data-testid="add-child-flyout-option"]', { hasText: /Add\s+Task/i }).first()).toBeVisible({ timeout: 5000 });
  await expect(flyout.locator('[data-testid="add-child-flyout-option"]', { hasText: /Add\s+Person/i }).first()).toBeVisible({ timeout: 5000 });

  // Dismiss flyout and verify tree remains interactive.
  await page.keyboard.press('Escape');
  await expect(tree.first()).toBeVisible({ timeout: 5000 });
});
