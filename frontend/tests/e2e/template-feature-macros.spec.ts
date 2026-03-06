import { test, expect } from '@playwright/test';
import { openTemplateEditor, E2E_TEMPLATE_NAME, resetE2ETemplateFixture } from './utils';

/**
 * E2E: Template Feature Macros (Scheduling & Budgeting)
 *
 * These tests verify the full round-trip:
 * 1. Enable a feature checkbox in the Template Editor → backend injects properties
 * 2. Disable a feature checkbox → backend removes the system-locked properties
 * 3. System-locked properties cannot be deleted via the UI
 */

test.describe('Template Feature Macros', () => {
  test.beforeEach(async () => {
    await resetE2ETemplateFixture();
  });

  test('enabling Scheduling injects schedule properties', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);

    // Select the e2e template
    const templateCard = page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first();
    await expect(templateCard).toBeVisible({ timeout: 10000 });
    await templateCard.click();

    // Wait for the node type list to load
    await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

    // Expand the first node type (Test Project)
    const firstNodeHeader = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Test Project' }).first();
    await firstNodeHeader.click();

    // Find and check the "Enable Scheduling" checkbox
    const schedulingCheckbox = page.getByLabel(/Enable Scheduling/i);
    await expect(schedulingCheckbox).toBeVisible({ timeout: 5000 });
    await schedulingCheckbox.check();

    // Wait for the save to complete (optimistic update + backend persist)
    // The scheduling properties should appear in the properties list
    await expect(page.getByText('Start Date')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('End Date')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Assigned Asset')).toBeVisible({ timeout: 10000 });

    // Reload and verify persistence
    await page.reload();
    await openTemplateEditor(page);
    await page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

    // Expand the node type again
    await page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Test Project' }).first().click();

    // Verify scheduling checkbox is still checked
    const schedulingCheckboxAfterReload = page.getByLabel(/Enable Scheduling/i);
    await expect(schedulingCheckboxAfterReload).toBeChecked({ timeout: 5000 });

    // Verify the injected properties are still visible
    await expect(page.getByText('Start Date')).toBeVisible({ timeout: 5000 });
  });

  test('enabling Budgeting injects cost property', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);

    const templateCard = page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first();
    await expect(templateCard).toBeVisible({ timeout: 10000 });
    await templateCard.click();

    await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

    // Expand the first node type
    const firstNodeHeader = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Test Project' }).first();
    await firstNodeHeader.click();

    // Enable budgeting
    const budgetingCheckbox = page.getByLabel(/Enable Budgeting/i);
    await expect(budgetingCheckbox).toBeVisible({ timeout: 5000 });
    await budgetingCheckbox.check();

    // The cost property should appear
    await expect(page.getByText('Estimated Cost ($)')).toBeVisible({ timeout: 10000 });
  });

  test('disabling a feature removes its properties', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);

    const templateCard = page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first();
    await expect(templateCard).toBeVisible({ timeout: 10000 });
    await templateCard.click();

    await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

    // Expand the first node type
    const firstNodeHeader = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Test Project' }).first();
    await firstNodeHeader.click();

    // Enable scheduling first
    const schedulingCheckbox = page.getByLabel(/Enable Scheduling/i);
    await expect(schedulingCheckbox).toBeVisible({ timeout: 5000 });
    await schedulingCheckbox.check();
    await expect(page.getByText('Start Date')).toBeVisible({ timeout: 10000 });

    // Disable scheduling
    await schedulingCheckbox.uncheck();

    // Wait for the injected properties to be removed
    await expect(page.getByText('Start Date')).toBeHidden({ timeout: 10000 });
    await expect(page.getByText('End Date')).toBeHidden({ timeout: 10000 });
    await expect(page.getByText('Assigned Asset')).toBeHidden({ timeout: 10000 });
  });

  test('system-locked properties hide the delete button', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);

    const templateCard = page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first();
    await expect(templateCard).toBeVisible({ timeout: 10000 });
    await templateCard.click();

    await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

    // Expand the first node type
    const firstNodeHeader = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Test Project' }).first();
    await firstNodeHeader.click();

    // Enable scheduling to inject system-locked properties
    const schedulingCheckbox = page.getByLabel(/Enable Scheduling/i);
    await expect(schedulingCheckbox).toBeVisible({ timeout: 5000 });
    await schedulingCheckbox.check();
    await expect(page.getByText('Start Date')).toBeVisible({ timeout: 10000 });

    // Expand the "Start Date" property
    const startDateProp = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Start Date' }).first();
    await startDateProp.click();

    // The delete button (Trash2 icon) should NOT be present for system-locked properties
    // System-locked properties have a lock icon instead
    const lockIcon = page.locator('svg.lucide-lock').first();
    await expect(lockIcon).toBeVisible({ timeout: 5000 });

    // The property row for "Start Date" should not have a trash button
    const startDateRow = page.locator('[class*="rounded"]').filter({ hasText: 'Start Date' }).first();
    const trashButtons = startDateRow.locator('svg.lucide-trash2, svg.lucide-trash-2');
    await expect(trashButtons).toHaveCount(0);
  });
});
