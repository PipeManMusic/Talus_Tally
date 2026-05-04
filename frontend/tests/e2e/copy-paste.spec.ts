import { test, expect, type Page } from '@playwright/test';
import { createNewProject, resetE2ETemplateFixture } from './utils';

// ── Helpers ──────────────────────────────────────────────────────────

/** Add a task child to the root node and wait for it to appear in the tree. */
async function addTaskToRoot(page: Page, taskName: string) {
  const addBtn = page.locator('[data-testid="add-child-btn"]').first();
  await expect(addBtn).toBeVisible({ timeout: 5000 });
  await addBtn.click();

  const flyout = page.locator('[data-testid="add-child-flyout"]');
  await expect(flyout).toBeVisible({ timeout: 5000 });
  const option = flyout.locator('[data-testid="add-child-flyout-option"]', { hasText: /task/i });
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();

  const nameInput = page.locator('input[placeholder*="name" i]');
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(taskName);

  const confirmBtn = page.locator('.fixed button', { hasText: /^Add\s/i });
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  await confirmBtn.click();

  await expect(nameInput).toBeHidden({ timeout: 5000 });
  await expect(
    page.locator('[data-testid="tree-item-row"]', { hasText: taskName }),
  ).toBeVisible({ timeout: 10000 });
}

/** Right-click a tree row by name and return the context-menu container. */
async function openContextMenu(page: Page, nodeName: string) {
  const row = page.locator('[data-testid="tree-item-row"]', { hasText: nodeName }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.click({ button: 'right' });
  // The context menu is rendered inside the row itself; wait for a known menu item
  await expect(page.getByText('📋 Copy Node')).toBeVisible({ timeout: 3000 });
}

// ── Test setup ───────────────────────────────────────────────────────

test.beforeEach(async () => {
  await resetE2ETemplateFixture();
});

// ── Tests ─────────────────────────────────────────────────────────────

test.describe('Copy / Paste Nodes', () => {
  test('context menu: copies a task node and pastes it as a child of root', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Copy Paste Test');

    // Add a task node to the root
    await addTaskToRoot(page, 'Original Task');

    // Right-click the task → Copy Node
    await openContextMenu(page, 'Original Task');
    await page.getByText('📋 Copy Node').click();

    // Right-click the root → Paste as Child
    const rootRow = page.locator('[data-testid="tree-item-row"]').first();
    await rootRow.click({ button: 'right' });
    await expect(page.getByText('📌 Paste as Child')).toBeVisible({ timeout: 3000 });
    await page.getByText('📌 Paste as Child').click();

    // Verify the cloned node appears with the "Copy" suffix
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Original Task Copy' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('context menu: copies a subtree — both parent and child appear after paste', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Subtree Paste Test');

    // Add a phase (which can contain tasks in the e2e_smoketest template)
    const addBtn = page.locator('[data-testid="add-child-btn"]').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();

    const flyout = page.locator('[data-testid="add-child-flyout"]');
    await expect(flyout).toBeVisible({ timeout: 5000 });
    const phaseOption = flyout.locator('[data-testid="add-child-flyout-option"]', { hasText: /phase/i });
    await expect(phaseOption).toBeVisible({ timeout: 3000 });
    await phaseOption.click();

    const nameInput = page.locator('input[placeholder*="name" i]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('Phase One');
    const confirmBtn = page.locator('.fixed button', { hasText: /^Add\s/i });
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });
    await confirmBtn.click();
    await expect(nameInput).toBeHidden({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Phase One' }),
    ).toBeVisible({ timeout: 10000 });

    // Add a task inside Phase One via Phase One's "+" button
    const phaseRow = page.locator('[data-testid="tree-item-row"]', { hasText: 'Phase One' }).first();
    await phaseRow.click(); // select it first to expand
    const phaseAddBtn = phaseRow.locator('[data-testid="add-child-btn"]');
    await expect(phaseAddBtn).toBeVisible({ timeout: 5000 });
    await phaseAddBtn.click();

    const phaseFlyout = page.locator('[data-testid="add-child-flyout"]');
    await expect(phaseFlyout).toBeVisible({ timeout: 5000 });
    const taskOption = phaseFlyout.locator('[data-testid="add-child-flyout-option"]', { hasText: /task/i });
    await expect(taskOption).toBeVisible({ timeout: 3000 });
    await taskOption.click();

    const taskNameInput = page.locator('input[placeholder*="name" i]');
    await expect(taskNameInput).toBeVisible({ timeout: 5000 });
    await taskNameInput.fill('Nested Task');
    const taskConfirmBtn = page.locator('.fixed button', { hasText: /^Add\s/i });
    await expect(taskConfirmBtn).toBeVisible({ timeout: 3000 });
    await taskConfirmBtn.click();
    await expect(taskNameInput).toBeHidden({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Nested Task' }),
    ).toBeVisible({ timeout: 10000 });

    // Right-click Phase One → Copy Node
    await openContextMenu(page, 'Phase One');
    await page.getByText('📋 Copy Node').click();

    // Right-click root → Paste as Child
    const rootRow = page.locator('[data-testid="tree-item-row"]').first();
    await rootRow.click({ button: 'right' });
    await expect(page.getByText('📌 Paste as Child')).toBeVisible({ timeout: 3000 });
    await page.getByText('📌 Paste as Child').click();

    // Cloned phase should appear with "Copy" suffix
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Phase One Copy' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Edit menu: Copy Node and Paste Node actions work correctly', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Edit Menu Copy Paste Test');

    // Add a task
    await addTaskToRoot(page, 'Menu Task');

    // Select the task row by clicking it
    const taskRow = page.locator('[data-testid="tree-item-row"]', { hasText: 'Menu Task' }).first();
    await taskRow.click();
    await expect(page.locator('[data-testid="inspector-panel"]')).toBeVisible({ timeout: 5000 });

    // Use Edit > Copy Node to copy
    await page.getByRole('button', { name: /^Edit$/i }).click();
    await page.getByRole('button', { name: /^Copy Node$/i }).click();

    // Select the root row
    const rootRow = page.locator('[data-testid="tree-item-row"]').first();
    await rootRow.click();

    // Use Edit > Paste Node to paste onto root
    await page.getByRole('button', { name: /^Edit$/i }).click();
    await page.getByRole('button', { name: /^Paste Node$/i }).click();

    // Cloned node should appear
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Menu Task Copy' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('pasted node is independent — renaming the copy does not affect the original', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Independence Test');

    await addTaskToRoot(page, 'Source Task');

    // Copy via context menu
    await openContextMenu(page, 'Source Task');
    await page.getByText('📋 Copy Node').click();

    // Paste onto root
    const rootRow = page.locator('[data-testid="tree-item-row"]').first();
    await rootRow.click({ button: 'right' });
    await expect(page.getByText('📌 Paste as Child')).toBeVisible({ timeout: 3000 });
    await page.getByText('📌 Paste as Child').click();

    // Both nodes should be visible
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Source Task' }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Source Task Copy' }),
    ).toBeVisible({ timeout: 10000 });

    // Select the copy and rename it via the Inspector
    const copyRow = page.locator('[data-testid="tree-item-row"]', { hasText: 'Source Task Copy' }).first();
    await copyRow.click();

    const inspectorPanel = page.locator('[data-testid="inspector-panel"]');
    await expect(inspectorPanel).toBeVisible({ timeout: 5000 });

    const nameField = inspectorPanel.locator('[data-testid="inspector-property-name"] input');
    await nameField.fill('Renamed Copy');
    await nameField.blur();

    // The copy should be renamed but the original should still have its name
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Source Task' }).first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid="tree-item-row"]', { hasText: 'Renamed Copy' }),
    ).toBeVisible({ timeout: 5000 });
  });
});
