import { test, expect } from '@playwright/test';

test('shows empty state when no project loaded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No project loaded')).toBeVisible();
  await expect(page.getByText('Use File → New Project to get started')).toBeVisible();
});

test('shows status indicator when node status changes', async ({ page }) => {
  await page.goto('/');

  // 1. Create a new project (simulate menu or button click)
  await page.getByRole('button', { name: /^File$/ }).click();
  const newProjectBtn = page.getByRole('button', { name: /New Project/i });
  await newProjectBtn.waitFor({ state: 'visible' });
  await newProjectBtn.click();

  // 2. Add a node (simulate UI action)
  await page.getByRole('button', { name: /Add Node/i }).click();
  await page.getByRole('button', { name: /Task/i }).click(); // or whatever node type

  // 3. Change node status (simulate status dropdown or button)
  await page.getByRole('button', { name: /Status/i }).click();
  await page.getByRole('option', { name: /In Progress/i }).click(); // or another status

  // 4. Assert that the status indicator SVG or text is rendered
  const svgIndicator = page.locator('.status-indicator-svg');
  const textIndicator = page.locator('.status-indicator-text');
  await expect(svgIndicator.or(textIndicator)).toBeVisible();
});
