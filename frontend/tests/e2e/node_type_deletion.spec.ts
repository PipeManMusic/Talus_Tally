import { test, expect } from '@playwright/test';

// Assumes backend and frontend are running locally

test('Node type deletion persists to backend', async ({ page }) => {
  // Go to template editor
  await page.goto('http://localhost:5173/templates/editor');

  // Select template (e.g., Project Talus)
  await page.click('text=Project Talus');

  // Wait for node types to load
  await expect(page.locator('text=Node Types')).toBeVisible();

  // Find node type to delete (e.g., Camera Gear Inventory)
  const nodeTypeSelector = 'text=Camera Gear Inventory';
  await expect(page.locator(nodeTypeSelector)).toBeVisible();

  // Click delete button for node type
  await page.click(`${nodeTypeSelector} >> xpath=../..//button[@title="Delete node type"]`);

  // Confirm deletion in dialog
  await page.once('dialog', dialog => dialog.accept());

  // Wait for node type to disappear
  await expect(page.locator(nodeTypeSelector)).toHaveCount(0);

  // Save template
  await page.click('button:has-text("Save")');

  // Reload template
  await page.reload();
  await page.click('text=Project Talus');

  // Verify node type is still deleted
  await expect(page.locator(nodeTypeSelector)).toHaveCount(0);
});
