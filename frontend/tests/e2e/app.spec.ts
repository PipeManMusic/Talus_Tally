import { test, expect } from '@playwright/test';
import { createNewProject } from './utils';

test('toolbar New button opens the New Project dialog', async ({ page }) => {
  await page.goto('/');
  const newProjectButton = page.locator('button[title="New"]');
  await expect(newProjectButton).toBeVisible({ timeout: 10000 });
  await newProjectButton.click();
  const dialogHeading = page.getByRole('heading', { name: /New Project/i });
  await expect(dialogHeading).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /^Create$/i })).toBeVisible();
});

test('creates a new project via the dialog', async ({ page }) => {
  await page.goto('/');
  await createNewProject(page, 'App Spec Project');
});
