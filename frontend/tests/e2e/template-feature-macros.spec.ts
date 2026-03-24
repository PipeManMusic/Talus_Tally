import { test, expect } from '@playwright/test';
import { openTemplateEditor, E2E_TEMPLATE_NAME, resetE2ETemplateFixture } from './utils';

async function waitForTemplateAutosave(page: any) {
  try {
    await page.waitForResponse(
      (response: any) =>
        response.url().includes('/api/v1/templates/editor/') &&
        response.request().method() === 'PUT' &&
        response.ok(),
      { timeout: 10000 }
    );
  } catch {
    // Some UI actions don't always issue a PUT (e.g., no-op state changes).
  }
}

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
    if (!(await page.locator('label:has-text("Enable Scheduling") input[type="checkbox"]').first().isVisible())) {
      await firstNodeHeader.click();
    }

    // Find and check the "Enable Scheduling" checkbox
    const schedulingCheckbox = page.locator('label:has-text("Enable Scheduling") input[type="checkbox"]').first();
    await expect(schedulingCheckbox).toBeVisible({ timeout: 5000 });
    if (!(await schedulingCheckbox.isChecked())) {
      const autosaveScheduling = waitForTemplateAutosave(page);
      await schedulingCheckbox.check();
      await autosaveScheduling;
    }

    // Wait for the save to complete (optimistic update + backend persist)
    // The scheduling properties should appear in the properties list
    await expect(page.getByRole('heading', { name: /Start Date/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /End Date/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /Assigned (Asset|To)/i })).toBeVisible({ timeout: 10000 });

    // Verify persistence from backend source of truth.
    const persistedTemplateResponse = await page.request.get('/api/v1/templates/editor/e2e_smoketest');
    await expect(persistedTemplateResponse.ok()).toBeTruthy();
    const persistedTemplate = await persistedTemplateResponse.json();
    const rootNodeType = (persistedTemplate.node_types || []).find((nt: any) => nt.id === 'e2e_root');
    const rootPropertyIds = (rootNodeType?.properties || []).map((prop: any) => prop.id);
    expect(rootPropertyIds).toContain('start_date');
    expect(rootPropertyIds).toContain('end_date');
    expect(rootPropertyIds).toContain('assigned_to');
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
    if (!(await page.locator('label:has-text("Enable Budgeting") input[type="checkbox"]').first().isVisible())) {
      await firstNodeHeader.click();
    }

    // Enable budgeting
    const budgetingCheckbox = page.locator('label:has-text("Enable Budgeting") input[type="checkbox"]').first();
    await expect(budgetingCheckbox).toBeVisible({ timeout: 5000 });
    await budgetingCheckbox.check();

    // Budget properties should appear
    await expect(page.getByRole('heading', { name: /Estimated Cost/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /Actual Cost/i })).toBeVisible({ timeout: 10000 });
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
    if (!(await page.locator('label:has-text("Enable Scheduling") input[type="checkbox"]').first().isVisible())) {
      await firstNodeHeader.click();
    }

    // Enable scheduling first
    const schedulingCheckbox = page.locator('label:has-text("Enable Scheduling") input[type="checkbox"]').first();
    await expect(schedulingCheckbox).toBeVisible({ timeout: 5000 });
    if (!(await schedulingCheckbox.isChecked())) {
      const autosaveEnableScheduling = waitForTemplateAutosave(page);
      await schedulingCheckbox.check();
      await autosaveEnableScheduling;
    }
    await expect(page.getByRole('heading', { name: /Start Date/i })).toBeVisible({ timeout: 10000 });

    // Disable scheduling
    if (await schedulingCheckbox.isChecked()) {
      const autosaveDisableScheduling = waitForTemplateAutosave(page);
      await schedulingCheckbox.uncheck();
      await autosaveDisableScheduling;
    }

    // Verify after reload
    await page.reload();
    await openTemplateEditor(page);
    await page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });
    await page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Test Project' }).first().click();

    // Wait for the injected properties to be removed
    await expect(page.getByRole('heading', { name: /Start Date/i })).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /End Date/i })).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /Assigned (Asset|To)/i })).toHaveCount(0, { timeout: 10000 });
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
    if (!(await page.locator('label:has-text("Enable Scheduling") input[type="checkbox"]').first().isVisible())) {
      await firstNodeHeader.click();
    }

    // Enable scheduling to inject system-locked properties
    const schedulingCheckbox = page.locator('label:has-text("Enable Scheduling") input[type="checkbox"]').first();
    await expect(schedulingCheckbox).toBeVisible({ timeout: 5000 });
    if (!(await schedulingCheckbox.isChecked())) {
      const autosaveLockedProperties = waitForTemplateAutosave(page);
      await schedulingCheckbox.check();
      await autosaveLockedProperties;
    }

    const startDateHeading = page.locator('h5', { hasText: 'Start Date' }).first();
    await expect(startDateHeading).toBeVisible({ timeout: 10000 });

    // Expand the "Start Date" property
    const startDateProp = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Start Date' }).first();
    await startDateProp.click();

    // System-locked properties should show lock state and not expose delete action.
    const startDateCard = page.locator('div').filter({ has: page.locator('h5:has-text("Start Date")') }).first();
    await expect(startDateCard.locator('svg.lucide-trash-2')).toHaveCount(0);
  });
});
