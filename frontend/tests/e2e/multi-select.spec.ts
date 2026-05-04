import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { createNewProject } from './utils';

// ── Fixture helpers ──────────────────────────────────────────────────

const MS_TEMPLATE_ID = 'e2e_multiselect';

function resolveRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, 'data', 'templates'))) {
      return c;
    }
  }
  return process.cwd();
}

const REPO_ROOT = resolveRepoRoot();
const FIXTURE_SRC = path.join(REPO_ROOT, 'frontend', 'tests', 'e2e', 'fixtures', `${MS_TEMPLATE_ID}.yaml`);
const RUNTIME_TEMPLATES_DIR = path.join(REPO_ROOT, 'frontend', 'tests', 'e2e', 'runtime-templates');
const FIXTURE_DEST = path.join(RUNTIME_TEMPLATES_DIR, `${MS_TEMPLATE_ID}.yaml`);

/**
 * Install the multi-select fixture alongside any other runtime templates without
 * wiping the whole directory (unlike resetE2ETemplateFixture which resets to one template).
 */
async function installMultiselectFixture() {
  await fs.mkdir(RUNTIME_TEMPLATES_DIR, { recursive: true });
  await fs.copyFile(FIXTURE_SRC, FIXTURE_DEST);
}

// ── Page helpers ─────────────────────────────────────────────────────

async function addTask(page: Page, taskName: string) {
  const addBtn = page.locator('[data-testid="add-child-btn"]').first();
  await expect(addBtn).toBeVisible({ timeout: 5000 });
  await addBtn.click();

  const flyout = page.locator('[data-testid="add-child-flyout"]');
  await expect(flyout).toBeVisible({ timeout: 5000 });
  const option = flyout.locator('[data-testid="add-child-flyout-option"]', { hasText: /Task/i });
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();

  const nameInput = page.locator('input[placeholder*="name" i]');
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(taskName);

  const confirmBtn = page.locator('.fixed button', { hasText: /^Add\s/i });
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  await confirmBtn.click();

  await expect(nameInput).toBeHidden({ timeout: 5000 });
  await expect(page.locator('[data-testid="tree-item-row"]', { hasText: taskName })).toBeVisible({ timeout: 10000 });
}

async function expandRoot(page: Page) {
  const rootRow = page.locator('[data-testid="tree-item-row"]').first();
  const expandedAttr = await rootRow.getAttribute('data-expanded').catch(() => null);
  const shouldExpand = expandedAttr === 'false';

  if (!shouldExpand) {
    return;
  }

  const expandBtn = page.locator('[data-testid="expand-toggle-btn"]').first();
  if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expandBtn.click();
  }
}

async function clickRow(page: Page, name: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) {
  const row = page.locator('[data-testid="tree-item-row"]', { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.click({
    modifiers: [
      ...(modifiers.ctrl ? (['Control'] as const) : []),
      ...(modifiers.shift ? (['Shift'] as const) : []),
    ],
  });
}

// ── Test setup ───────────────────────────────────────────────────────

test.beforeEach(async () => {
  await installMultiselectFixture();
});

test.describe('Multi-Select — TreeView', () => {
  test('Ctrl+Click adds a same-type node to the selection', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Multi-Select Test', MS_TEMPLATE_ID);
    await expandRoot(page);

    await addTask(page, 'Task A');
    await addTask(page, 'Task B');
    await expandRoot(page); // ensure both are visible

    // Single-click Task A to anchor it
    await clickRow(page, 'Task A');

    // Ctrl+Click Task B — both should now be in the multi-select banner
    await clickRow(page, 'Task B', { ctrl: true });

    const banner = page.locator('[data-testid="multi-select-banner"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('2 nodes selected');
  });

  test('Shift+Click selects the range between anchor and target', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Multi-Select Test', MS_TEMPLATE_ID);
    await expandRoot(page);

    await addTask(page, 'Task A');
    await addTask(page, 'Task B');
    await addTask(page, 'Task C');
    await expandRoot(page);

    // Anchor on Task A
    await clickRow(page, 'Task A');

    // Shift+Click Task C — should select A, B, C
    await clickRow(page, 'Task C', { shift: true });

    const banner = page.locator('[data-testid="multi-select-banner"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('3 nodes selected');
  });

  test('plain click deselects multi-selection and selects only that node', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Multi-Select Test', MS_TEMPLATE_ID);
    await expandRoot(page);

    await addTask(page, 'Task A');
    await addTask(page, 'Task B');
    await expandRoot(page);

    await clickRow(page, 'Task A');
    await clickRow(page, 'Task B', { ctrl: true });

    // plain click drops multi-select
    await clickRow(page, 'Task A');

    const banner = page.locator('[data-testid="multi-select-banner"]');
    await expect(banner).toBeHidden({ timeout: 5000 });
  });
});

test.describe('Multi-Select — Inspector *Varies*', () => {
  test('shows *Varies* for a field with different values across selected nodes', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Multi-Select Test', MS_TEMPLATE_ID);
    await expandRoot(page);

    // Create two tasks with different priority values
    await addTask(page, 'Task A');
    await addTask(page, 'Task B');
    await expandRoot(page);

    // Set Priority on Task A
    await clickRow(page, 'Task A');
    const priorityA = page.locator('[data-testid="inspector-property-priority"] input');
    await expect(priorityA).toBeVisible({ timeout: 5000 });
    await priorityA.fill('High');
    await priorityA.blur();
    await page.waitForTimeout(500);

    // Set Priority on Task B
    await clickRow(page, 'Task B');
    const priorityB = page.locator('[data-testid="inspector-property-priority"] input');
    await expect(priorityB).toBeVisible({ timeout: 5000 });
    await priorityB.fill('Low');
    await priorityB.blur();
    await page.waitForTimeout(500);

    // Multi-select both
    await clickRow(page, 'Task A');
    await clickRow(page, 'Task B', { ctrl: true });

    // The priority field placeholder should be *Varies*
    const priorityInput = page.locator('[data-testid="inspector-property-priority"] input');
    await expect(priorityInput).toHaveAttribute('placeholder', '*Varies*', { timeout: 5000 });
  });

  test('shows a common value (not *Varies*) when both nodes share the same value', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Multi-Select Test', MS_TEMPLATE_ID);
    await expandRoot(page);

    await addTask(page, 'Task A');
    await addTask(page, 'Task B');
    await expandRoot(page);

    // Set identical Priority on both tasks
    for (const name of ['Task A', 'Task B']) {
      await clickRow(page, name);
      const priorityInput = page.locator('[data-testid="inspector-property-priority"] input');
      await expect(priorityInput).toBeVisible({ timeout: 5000 });
      await priorityInput.fill('High');
      await priorityInput.blur();
      await page.waitForTimeout(500);
    }

    // Multi-select both
    await clickRow(page, 'Task A');
    await clickRow(page, 'Task B', { ctrl: true });

    const priorityInput = page.locator('[data-testid="inspector-property-priority"] input');
    await expect(priorityInput).toHaveValue('High', { timeout: 5000 });
    await expect(priorityInput).not.toHaveAttribute('placeholder', '*Varies*');
  });

  test('edit in multi-select Inspector fans out to all selected nodes', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Multi-Select Test', MS_TEMPLATE_ID);
    await expandRoot(page);

    await addTask(page, 'Task A');
    await addTask(page, 'Task B');
    await expandRoot(page);

    // Multi-select both
    await clickRow(page, 'Task A');
    await clickRow(page, 'Task B', { ctrl: true });

    // Edit Priority in the Inspector
    const priorityInput = page.locator('[data-testid="inspector-property-priority"] input');
    await expect(priorityInput).toBeVisible({ timeout: 5000 });
    await priorityInput.fill('Critical');
    await priorityInput.blur();
    await page.waitForTimeout(1000);

    // Verify Task A has the new value
    await clickRow(page, 'Task A');
    const priorityA = page.locator('[data-testid="inspector-property-priority"] input');
    await expect(priorityA).toHaveValue('Critical', { timeout: 5000 });

    // Verify Task B also has the new value
    await clickRow(page, 'Task B');
    const priorityB = page.locator('[data-testid="inspector-property-priority"] input');
    await expect(priorityB).toHaveValue('Critical', { timeout: 5000 });
  });
});
