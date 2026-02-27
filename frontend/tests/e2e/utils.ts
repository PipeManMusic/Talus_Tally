import { expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

export const E2E_TEMPLATE_ID = 'e2e_smoketest';
export const E2E_TEMPLATE_NAME = 'E2E Test Template';

const DEFAULT_E2E_TEMPLATE_ID = E2E_TEMPLATE_ID;

const REPO_ROOT = path.resolve(process.cwd(), '..');
const TEMPLATE_SRC = path.join(REPO_ROOT, 'data', 'templates', `${E2E_TEMPLATE_ID}.yaml`);
const TEMPLATE_DEST = path.join(os.homedir(), '.local', 'share', 'talus_tally', 'templates', `${E2E_TEMPLATE_ID}.yaml`);

export async function resetE2ETemplateFixture() {
  await fs.mkdir(path.dirname(TEMPLATE_DEST), { recursive: true });
  await fs.copyFile(TEMPLATE_SRC, TEMPLATE_DEST);
}

export async function openNewProjectDialog(page: Page) {
  const menuBar = page.getByRole('navigation').first();
  const fileMenuButton = menuBar.getByRole('button', { name: /^File$/i });
  await expect(fileMenuButton).toBeVisible({ timeout: 10000 });
  await fileMenuButton.click();

  const newProjectMenuItem = page.locator('nav button', { hasText: /^New Project$/i }).first();
  await expect(newProjectMenuItem).toBeVisible({ timeout: 5000 });
  await newProjectMenuItem.click();
}

export async function openTemplateEditor(page: Page) {
  const menuBar = page.getByRole('navigation').first();
  const toolsMenuButton = menuBar.getByRole('button', { name: /^Tools$/i });
  await expect(toolsMenuButton).toBeVisible({ timeout: 10000 });
  await toolsMenuButton.click();

  const templateEditorMenuItem = page.locator('nav button', { hasText: /^Template Editor$/i }).first();
  await expect(templateEditorMenuItem).toBeVisible({ timeout: 5000 });
  await templateEditorMenuItem.click();

  const templateEditorHeading = page.getByRole('heading', { name: /Template Editor/i });
  await expect(templateEditorHeading).toBeVisible({ timeout: 10000 });
}

export async function createNewProject(
  page: Page,
  projectName = 'E2E Project',
  templateId = DEFAULT_E2E_TEMPLATE_ID,
) {
  await openNewProjectDialog(page);

  const newProjectDialog = page.getByRole('dialog', { name: /New Project/i }).first();
  await expect(newProjectDialog).toBeVisible({ timeout: 5000 });

  if (templateId) {
    const templateSelect = newProjectDialog.locator('select');
    await expect(templateSelect).toBeVisible({ timeout: 5000 });
    await templateSelect.selectOption(templateId);
  }

  const projectNameInput = newProjectDialog.getByPlaceholder('Enter project name');
  await expect(projectNameInput).toBeVisible();
  await projectNameInput.fill(projectName);

  const createButton = newProjectDialog.getByRole('button', { name: /^Create$/i });
  await expect(createButton).toBeVisible({ timeout: 5000 });
  await createButton.click();

  await expect(newProjectDialog).toBeHidden({ timeout: 10000 });

  const treeNode = page.locator('[data-testid="tree-item-row"]').first();
  await expect(treeNode).toBeVisible({ timeout: 10000 });
}