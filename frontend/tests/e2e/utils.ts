import { expect, type Page } from '@playwright/test';

export async function createNewProject(page: Page, projectName = 'E2E Project') {
  const newProjectButton = page.locator('button[title="New"]');
  await expect(newProjectButton).toBeVisible({ timeout: 10000 });
  await newProjectButton.click();

  const dialogHeading = page.getByRole('heading', { name: /New Project/i });
  await expect(dialogHeading).toBeVisible({ timeout: 5000 });

  const projectNameInput = page.getByPlaceholder('Enter project name');
  await expect(projectNameInput).toBeVisible();
  await projectNameInput.fill(projectName);

  const createButton = page.getByRole('button', { name: /^Create$/i });
  await expect(createButton).toBeVisible({ timeout: 5000 });
  await createButton.click();

  await expect(dialogHeading).toBeHidden({ timeout: 10000 });
  await expect(createButton).toBeHidden({ timeout: 10000 });

  const treeNode = page.locator('[data-testid="tree-item-row"]').first();
  await expect(treeNode).toBeVisible({ timeout: 10000 });
}