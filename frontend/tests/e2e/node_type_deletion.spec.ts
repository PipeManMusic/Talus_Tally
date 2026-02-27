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
  const buttonCount = await deleteButtons.count();
  if (buttonCount <= 1) {
    throw new Error('Expected at least two node types to be present before deletion test.');
  }

  const targetButton = deleteButtons.nth(buttonCount - 1);
  const nodeTypeLabel = (await targetButton.evaluate((btn) => {
    const heading = btn.parentElement?.querySelector('h3');
    return heading?.textContent?.trim() || '';
  })) || '';
  if (!nodeTypeLabel) {
    throw new Error('Unable to determine node type label for deletion target.');
  }

  await targetButton.scrollIntoViewIfNeeded();
  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept()),
    targetButton.click(),
  ]);

  await page.locator('button:has-text("Save")').first().click();

  await page.reload();
  await openTemplateEditor(page);
  await page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });

  await expect(page.getByRole('heading', { name: nodeTypeLabel, exact: true })).toHaveCount(0);
});
