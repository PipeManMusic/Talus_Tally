import { test, expect } from '@playwright/test';
import { createNewProject, openNewProjectDialog } from './utils';

test('File menu New Project opens the dialog', async ({ page }) => {
  await page.goto('/');
  await openNewProjectDialog(page);
  const dialogHeading = page.getByRole('heading', { name: /New Project/i });
  await expect(dialogHeading).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /^Create$/i })).toBeVisible();
});

test('creates a new project via the dialog', async ({ page }) => {
  await page.goto('/');
  await createNewProject(page, 'App Spec Project');
});
