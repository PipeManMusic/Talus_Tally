import { test, expect } from '@playwright/test';
import { openTemplateEditor, E2E_TEMPLATE_NAME, resetE2ETemplateFixture } from './utils';

// Assumes backend and frontend are running locally

test('Node type deletion persists to backend', async ({ page }) => {
  await resetE2ETemplateFixture();
  await page.goto('/');
  await openTemplateEditor(page);

  const templateCard = page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first();
  await expect(templateCard).toBeVisible({ timeout: 10000 });
  await templateCard.click();

  await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

  const deleteButtons = page.locator('button[title="Delete node type"]');
  const initialCount = await deleteButtons.count();
  if (initialCount <= 1) {
    throw new Error('Expected at least two node types to be present before deletion test.');
  }

  // Delete the last node type to avoid relying on ordering of editor groups.
  const targetButton = deleteButtons.nth(initialCount - 1);

  await targetButton.scrollIntoViewIfNeeded();
  await targetButton.click();

  const confirmModal = page
    .locator('div')
    .filter({ hasText: /Delete Node Type/ })
    .filter({ hasText: /become orphaned/i })
    .first();
  await expect(confirmModal).toBeVisible({ timeout: 10000 });
  await confirmModal.getByRole('button', { name: 'Delete Node Type', exact: true }).click();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/templates/editor/e2e_smoketest') &&
        response.request().method() === 'PUT' &&
        response.ok(),
      { timeout: 15000 },
    ),
    page.locator('button:has-text("Save")').first().click(),
  ]);

  await expect(page.getByText('Saved successfully', { exact: true })).toBeVisible({ timeout: 10000 });

  const persistedTemplateResponse = await page.request.get('/api/v1/templates/editor/e2e_smoketest');
  await expect(persistedTemplateResponse.ok()).toBeTruthy();
  const persistedTemplate = await persistedTemplateResponse.json();
  const persistedCount = Array.isArray(persistedTemplate.node_types) ? persistedTemplate.node_types.length : 0;
  expect(persistedCount).toBe(initialCount - 1);

  await page.reload();
  await openTemplateEditor(page);
  await page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

  await expect(page.locator('button[title="Delete node type"]')).toHaveCount(initialCount - 1);
});
