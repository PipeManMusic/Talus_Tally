import { test, expect, type Page } from '@playwright/test';
import { createNewProject, resetE2ETemplateFixture } from './utils';

// ── Helpers ──────────────────────────────────────────────────────────

/** Add a child node of a given type to the root project node. */
async function addChildNode(page: Page, typeName: string, childName: string) {
  // Click the "+" (add-child) button on the root node
  const addBtn = page.locator('[data-testid="add-child-btn"]').first();
  await expect(addBtn).toBeVisible({ timeout: 5000 });
  await addBtn.click();

  // Pick the type from the flyout
  const flyout = page.locator('[data-testid="add-child-flyout"]');
  await expect(flyout).toBeVisible({ timeout: 5000 });
  const option = flyout.locator('[data-testid="add-child-flyout-option"]', {
    hasText: new RegExp(typeName, 'i'),
  });
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();

  // Fill the name in the Add Child dialog and confirm
  const nameInput = page.locator('input[placeholder*="name" i]');
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(childName);

  // Click the confirm button (text is "Add Task" / "Add Person" / "Add Child")
  const confirmBtn = page.locator('.fixed button', { hasText: /^Add\s/i });
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  await confirmBtn.click();

  // Wait for the dialog to close and the new node to appear in the tree
  await expect(nameInput).toBeHidden({ timeout: 5000 });
  const newNode = page.locator('[data-testid="tree-item-row"]', { hasText: childName });
  await expect(newNode).toBeVisible({ timeout: 10000 });
}

/** Click a tree node to select it in the Inspector. */
async function selectTreeNode(page: Page, nodeName: string) {
  const row = page.locator('[data-testid="tree-item-row"]', { hasText: nodeName });
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.click();
  // Wait for Inspector to load its properties panel
  await expect(page.locator('[data-testid="inspector-panel"]')).toBeVisible({ timeout: 5000 });
}

// ── Test setup ───────────────────────────────────────────────────────

test.beforeEach(async () => {
  await resetE2ETemplateFixture();
});

// ── Tests ────────────────────────────────────────────────────────────

test.describe('Inspector', () => {
  test('shows empty state when no node is selected', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Inspector Test');

    const emptyState = page.locator('[data-testid="inspector-empty"]');
    await expect(emptyState).toBeVisible({ timeout: 5000 });
    await expect(emptyState).toContainText('Select a node to view properties');
  });

  test('displays node type and properties when root node is selected', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Inspector Test');

    // Click the root node
    await selectTreeNode(page, 'Inspector Test');

    // Verify Inspector panel shows node type
    const nodeType = page.locator('[data-testid="inspector-node-type"]');
    await expect(nodeType).toBeVisible({ timeout: 5000 });

    // Verify node ID appears
    const nodeId = page.locator('[data-testid="inspector-node-id"]');
    await expect(nodeId).toBeVisible();
    // The ID should be a non-empty UUID-like string
    const idText = await nodeId.textContent();
    expect(idText?.trim().length).toBeGreaterThan(0);

    // Verify the "Project Name" property is present
    const nameField = page.locator('[data-testid="inspector-property-name"]');
    await expect(nameField).toBeVisible();
  });

  test('can edit a text property', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Inspector Test');
    await selectTreeNode(page, 'Inspector Test');

    // Find the Objective field and edit it
    const objectiveField = page.locator('[data-testid="inspector-property-objective"]');
    await expect(objectiveField).toBeVisible({ timeout: 5000 });

    const input = objectiveField.locator('input');
    await input.fill('Test the inspector');
    // Trigger blur to commit the change
    await input.blur();

    // Wait briefly for the API round-trip
    await page.waitForTimeout(1000);

    // Re-read the value — it should have persisted
    await expect(input).toHaveValue('Test the inspector');
  });

  test('updates Inspector when switching between nodes', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Inspector Test');

    // Expand root so child becomes visible after add
    const expandBtn = page.locator('[data-testid="expand-toggle-btn"]').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }

    // Add two children
    await addChildNode(page, 'Task', 'Alpha Task');
    await addChildNode(page, 'Task', 'Beta Task');

    // Select Alpha Task
    await selectTreeNode(page, 'Alpha Task');
    const nodeType = page.locator('[data-testid="inspector-node-type"]');
    await expect(nodeType).toContainText(/task/i);

    // Verify the name property matches
    const nameInput = page
      .locator('[data-testid="inspector-property-name"]')
      .locator('input');
    await expect(nameInput).toHaveValue('Alpha Task');

    // Switch to Beta Task
    await selectTreeNode(page, 'Beta Task');
    await expect(nameInput).toHaveValue('Beta Task');
  });

  test('shows select (dropdown) properties on a task', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Inspector Test');
    await addChildNode(page, 'Task', 'Dropdown Task');
    await selectTreeNode(page, 'Dropdown Task');

    // The status field should be a select dropdown
    const statusField = page.locator('[data-testid="inspector-property-status"]');
    await expect(statusField).toBeVisible({ timeout: 5000 });

    const select = statusField.locator('select');
    await expect(select).toBeVisible();

    // Scheduling feature injects status with labels: "To Do", "In Progress", "Done"
    // Option values are UUIDs, so select by label
    await select.selectOption({ label: 'In Progress' });
    await page.waitForTimeout(500);

    // The dropdown should reflect the selected option (a UUID value)
    const selectedValue = await select.inputValue();
    expect(selectedValue.length).toBeGreaterThan(0);
    // Verify it changed from the default "To Do"
    const toDoOption = select.locator('option', { hasText: 'To Do' });
    const toDoValue = await toDoOption.getAttribute('value');
    expect(selectedValue).not.toBe(toDoValue);
  });

  test('shows scheduling properties on a task', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Inspector Test');
    await addChildNode(page, 'Task', 'Scheduled Task');
    await selectTreeNode(page, 'Scheduled Task');

    // Verify scheduling properties are present
    const startDate = page.locator('[data-testid="inspector-property-start_date"]');
    const endDate = page.locator('[data-testid="inspector-property-end_date"]');
    const assignedTo = page.locator('[data-testid="inspector-property-assigned_to"]');

    await expect(startDate).toBeVisible({ timeout: 5000 });
    await expect(endDate).toBeVisible();
    await expect(assignedTo).toBeVisible();
  });

  test('can set date properties on a task', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Inspector Test');
    await addChildNode(page, 'Task', 'Date Task');
    await selectTreeNode(page, 'Date Task');

    const startDate = page.locator('[data-testid="inspector-property-start_date"]');
    await expect(startDate).toBeVisible({ timeout: 5000 });
    // DatePicker renders as input[type="text"] with MM/DD/YYYY format
    const dateInput = startDate.locator('input[type="text"]');
    await dateInput.fill('04/01/2026');
    // Press Escape to close the calendar popup, then blur to commit
    await page.keyboard.press('Escape');
    await dateInput.blur();
    await page.waitForTimeout(1000);

    // Verify the value persisted (displayed as MM/DD/YYYY)
    await expect(dateInput).toHaveValue('04/01/2026');
  });

  test('does not freeze when interacting with properties', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Freeze Test');
    await addChildNode(page, 'Task', 'No Freeze Task');
    await selectTreeNode(page, 'No Freeze Task');

    // Rapidly interact with multiple properties to stress-test for freezes
    const nameInput = page
      .locator('[data-testid="inspector-property-name"]')
      .locator('input');
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // Type multiple characters rapidly
    await nameInput.fill('Quick Edit 1');
    await nameInput.blur();
    await page.waitForTimeout(300);

    await nameInput.fill('Quick Edit 2');
    await nameInput.blur();
    await page.waitForTimeout(300);

    await nameInput.fill('Quick Edit 3');
    await nameInput.blur();
    await page.waitForTimeout(300);

    // If the UI froze, this assertion would time out
    await expect(nameInput).toHaveValue('Quick Edit 3', { timeout: 5000 });

    // Also verify the Inspector is still responsive
    const statusField = page.locator('[data-testid="inspector-property-status"]');
    await expect(statusField).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Inspector - Manual Allocations', () => {
  /**
   * Create a project with a person and a task, assign the person to the task,
   * and set date range so the "Edit Allocations" button becomes available.
   */
  async function setupTaskWithAssignee(page: Page) {
    await page.goto('/');
    await createNewProject(page, 'Alloc Test');

    // Expand root
    const expandBtn = page.locator('[data-testid="expand-toggle-btn"]').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }

    // Add a Person and a Task
    await addChildNode(page, 'Person', 'Casey');
    await addChildNode(page, 'Task', 'Paint Prep');

    // Select the task
    await selectTreeNode(page, 'Paint Prep');

    // Set start and end dates (DatePicker uses input[type="text"] with MM/DD/YYYY)
    const startDate = page.locator('[data-testid="inspector-property-start_date"]');
    await expect(startDate).toBeVisible({ timeout: 5000 });
    const startInput = startDate.locator('input[type="text"]');
    await startInput.fill('04/01/2026');
    // Press Escape to close the calendar popup before moving to the next field
    await page.keyboard.press('Escape');
    await startInput.blur();
    await page.waitForTimeout(1000);

    const endDate = page.locator('[data-testid="inspector-property-end_date"]');
    const endInput = endDate.locator('input[type="text"]');
    await endInput.fill('04/03/2026');
    await page.keyboard.press('Escape');
    await endInput.blur();
    await page.waitForTimeout(1000);

    // Assign Casey to the task
    const assignField = page.locator('[data-testid="inspector-property-assigned_to"]');
    await expect(assignField).toBeVisible({ timeout: 5000 });
    const personSelect = assignField.locator('select');
    await expect(personSelect).toBeVisible({ timeout: 5000 });

    // Pick the first available person option
    const options = await personSelect.locator('option').allTextContents();
    const caseyOption = options.find((o) => /casey/i.test(o));
    if (caseyOption) {
      await personSelect.selectOption({ label: caseyOption });
    } else {
      // Fall back to first non-placeholder option
      await personSelect.selectOption({ index: 1 });
    }

    // Click "Add" to assign
    const addBtn = assignField.locator('button', { hasText: /Add/i });
    await expect(addBtn).toBeVisible({ timeout: 3000 });
    await addBtn.click();
    await page.waitForTimeout(1000);
  }

  test('Edit Allocations button appears when task has assignee and dates', async ({ page }) => {
    await setupTaskWithAssignee(page);

    // Scheduling feature uses 'allocations' as the effective prop id
    const allocField = page.locator('[data-testid="inspector-property-allocations"]').first();
    await expect(allocField).toBeVisible({ timeout: 5000 });

    const editBtn = page.locator('[data-testid="edit-allocations-btn"]').first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
  });

  test('opens and closes the allocations modal without freezing', async ({ page }) => {
    await setupTaskWithAssignee(page);

    const editBtn = page.locator('[data-testid="edit-allocations-btn"]').first();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // Modal should open
    const modal = page.locator('[data-testid="allocations-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify the modal has a table with headers
    await expect(modal.locator('th', { hasText: 'Assignee' })).toBeVisible();
    await expect(modal.locator('th', { hasText: '2026-04-01' })).toBeVisible();

    // Close modal via the header Close button
    await modal.getByRole('button', { name: /Close/i }).click();
    await expect(modal).toBeHidden({ timeout: 3000 });

    // Inspector should still be responsive after modal close
    const nameInput = page
      .locator('[data-testid="inspector-property-name"]')
      .locator('input');
    await expect(nameInput).toHaveValue('Paint Prep', { timeout: 3000 });
  });

  test('can enter allocation values and save', async ({ page }) => {
    await setupTaskWithAssignee(page);

    // Open the modal
    const editBtn = page.locator('[data-testid="edit-allocations-btn"]').first();
    await editBtn.click();

    const modal = page.locator('[data-testid="allocations-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Find all input cells in the allocations table (type="text" with inputMode="decimal")
    const cells = modal.locator('tbody input[type="text"]');
    const cellCount = await cells.count();
    expect(cellCount).toBeGreaterThan(0);

    // Fill the first cell with a value
    await cells.first().fill('4');

    // Save
    const saveBtn = page.locator('[data-testid="allocations-save-btn"]');
    await saveBtn.click();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 5000 });

    // Re-open the modal and verify the value persisted
    await editBtn.click();
    await expect(modal).toBeVisible({ timeout: 5000 });

    const firstCell = modal.locator('tbody input[type="text"]').first();
    await expect(firstCell).toHaveValue('4', { timeout: 5000 });

    // Close
    await modal.getByRole('button', { name: /Close/i }).click();
  });

  test('Inspector remains responsive after rapid modal open/close cycles', async ({ page }) => {
    await setupTaskWithAssignee(page);

    const editBtn = page.locator('[data-testid="edit-allocations-btn"]').first();
    const modal = page.locator('[data-testid="allocations-modal"]');

    // Rapid open/close 3 times
    for (let i = 0; i < 3; i++) {
      await editBtn.click();
      await expect(modal).toBeVisible({ timeout: 3000 });
      await modal.getByRole('button', { name: /Close/i }).click();
      await expect(modal).toBeHidden({ timeout: 3000 });
    }

    // Inspector should still be alive and responsive
    const nameInput = page
      .locator('[data-testid="inspector-property-name"]')
      .locator('input');
    await expect(nameInput).toHaveValue('Paint Prep', { timeout: 3000 });
    await nameInput.fill('Renamed after cycles');
    await nameInput.blur();
    await page.waitForTimeout(500);
    await expect(nameInput).toHaveValue('Renamed after cycles', { timeout: 5000 });
  });
});
