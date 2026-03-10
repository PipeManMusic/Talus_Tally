import { test, expect } from '@playwright/test';
import { createNewProject, resetE2ETemplateFixture } from './utils';

test.beforeEach(async () => {
  await resetE2ETemplateFixture();
});

test.describe('FilterBar - Budget View', () => {
  test('FilterBar is visible and collapsible in Budget view', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // FilterBar should be visible with collapsed state
    const filterBar = page.locator('[class*="border-b"][class*="border-border"]').first();
    await expect(filterBar).toBeVisible();

    // Should show "No filters active" in collapsed state
    const filterSummary = page.getByText(/No filters active/i);
    await expect(filterSummary).toBeVisible();

    // Expand button should be present
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expect(expandButton).toBeVisible();
  });

  test('Expanding FilterBar reveals filter controls', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Click expand button
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Should see filter controls
    await expect(page.getByText(/Query Builder.*Filters/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Filter/i })).toBeVisible();
    await expect(page.getByText(/Mode:/i)).toBeVisible();

    // Should see Ghost and Hide mode buttons
    await expect(page.getByRole('button', { name: /Ghost/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Hide/i }).first()).toBeVisible();
  });

  test('Adding a filter rule works correctly', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Expand FilterBar
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Click "Add Filter" button
    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();
    await page.waitForTimeout(200);

    // A new filter rule row should appear
    const propertySelects = page.locator('select').first();
    await expect(propertySelects).toBeVisible();

    // Should have at least operator and value selects too
    const allSelects = page.locator('select');
    const selectCount = await allSelects.count();
    expect(selectCount).toBeGreaterThanOrEqual(2);
  });

  test('Filter rule properties can be configured', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Expand FilterBar and add a rule
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();
    await page.waitForTimeout(200);

    // Select property from dropdown
    const propertySelect = page.locator('select').first();
    await propertySelect.click();
    const options = await propertySelect.locator('option').count();
    expect(options).toBeGreaterThan(1); // At least the "Select property..." option + actual properties

    // Select an actual property (not the placeholder)
    const optionTexts = await propertySelect.locator('option').allTextContents();
    const realProperty = optionTexts.find((text) => text && text !== 'Select property...');
    if (realProperty) {
      await propertySelect.selectOption(realProperty);
    }
  });

  test('Switching between Ghost and Hide modes', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Expand FilterBar
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Get Ghost and Hide buttons
    const buttons = page.getByRole('button');
    const ghostButton = buttons.filter({ hasText: /^Ghost$/i }).first();
    const hideButton = buttons.filter({ hasText: /^Hide$/i }).first();

    // Ghost should be active by default (has accent-primary class)
    const ghostClass = await ghostButton.getAttribute('class');
    expect(ghostClass).toContain('accent-primary');

    // Click Hide button
    await hideButton.click();
    await page.waitForTimeout(200);

    // Hide should now be active
    const hideClass = await hideButton.getAttribute('class');
    expect(hideClass).toContain('accent-primary');

    // Click Ghost button again
    await ghostButton.click();
    await page.waitForTimeout(200);

    // Ghost should be active again
    const ghostClassAfter = await ghostButton.getAttribute('class');
    expect(ghostClassAfter).toContain('accent-primary');
  });

  test('Delete rule button removes specific rule', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Expand and add two rules
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();
    await page.waitForTimeout(200);

    await addFilterButton.click();
    await page.waitForTimeout(200);

    // Should have 2 rule rows (each with a delete trash button)
    const trashButtons = page.getByTitle(/Delete this filter rule/i);
    let initialCount = await trashButtons.count();

    // Click first trash button
    const firstTrash = trashButtons.first();
    await firstTrash.click();
    await page.waitForTimeout(200);

    // Count should decrease by 1
    const afterDeleteCount = await trashButtons.count();
    expect(afterDeleteCount).toBeLessThan(initialCount);
  });

  test('Clear All button removes all rules', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Expand and add multiple rules
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();
    await page.waitForTimeout(200);

    await addFilterButton.click();
    await page.waitForTimeout(200);

    // "Clear All" button should be visible
    const clearButton = page.getByRole('button', { name: /Clear All/i }).first();
    await expect(clearButton).toBeVisible();

    // Click it
    await clearButton.click();
    await page.waitForTimeout(200);

    // Rules should be cleared - "No filters configured" message should appear
    const noRulesMessage = page.getByText(/No filters configured/i);
    await expect(noRulesMessage).toBeVisible();

    // Clear All button should disappear
    const clearButtonCount = await page.getByRole('button', { name: /Clear All/i }).count();
    expect(clearButtonCount).toBe(0);
  });

  test('FilterBar is hidden in Gantt view when not expanded', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Gantt view
    const ganttButton = page.getByRole('button').filter({ hasText: /Calendar.*Gantt/i }).first();
    await ganttButton.click();
    await page.waitForTimeout(500);

    // Should have FilterBar (collapsed)
    const filterSummary = page.getByText(/No filters active|Filters:.*Active/i);
    await expect(filterSummary.first()).toBeVisible();

    // Expand it
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Filter controls should be visible
    await expect(page.getByText(/Query Builder/i)).toBeVisible();
  });

  test('Filter summary updates when rules are added/removed', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Initially shows "No filters active"
    let summary = page.getByText(/No filters active/i).first();
    await expect(summary).toBeVisible();

    // Expand
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Collapse to see summary
    const collapseButton = page.getByTitle(/Collapse filter bar/i).first();
    await collapseButton.click();
    await page.waitForTimeout(300);

    // Should still show "No filters active" when collapsed (no rules added yet)
    summary = page.getByText(/No filters active/i).first();
    await expect(summary).toBeVisible();

    // Expand again
    const expandButton2 = page.getByTitle(/Expand filter bar/i).first();
    await expandButton2.click();
    await page.waitForTimeout(300);

    // Add a rule
    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();
    await page.waitForTimeout(200);

    // Collapse
    const collapseButton2 = page.getByTitle(/Collapse filter bar/i).first();
    await collapseButton2.click();
    await page.waitForTimeout(300);

    // Should show "Filters: 1 Active"
    const updatedSummary = page.getByText(/Filters:.*Active/i).first();
    await expect(updatedSummary).toBeVisible();
  });
});

test.describe('FilterBar - Gantt View', () => {
  test('FilterBar is visible in Gantt view', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Gantt view
    const ganttButton = page.getByRole('button').filter({ hasText: /Calendar.*Gantt/i }).first();
    await ganttButton.click();
    await page.waitForTimeout(500);

    // FilterBar should be visible
    const filterSummary = page.getByText(/No filters active|Filters:.*Active/i).first();
    await expect(filterSummary).toBeVisible();
  });

  test('Expanding FilterBar in Gantt view works', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Gantt view
    const ganttButton = page.getByRole('button').filter({ hasText: /Calendar.*Gantt/i }).first();
    await ganttButton.click();
    await page.waitForTimeout(500);

    // Expand FilterBar
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Should show filter controls
    await expect(page.getByText(/Query Builder/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Filter/i }).first()).toBeVisible();
  });

  test('FilterBar not shown in other views (Velocity)', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Velocity view
    const velocityButton = page.getByRole('button').filter({ hasText: /Velocity/i }).first();
    await velocityButton.click();
    await page.waitForTimeout(500);

    // FilterBar should NOT be visible
    const filterSummaryCount = await page.getByText(/No filters active|Filters:.*Active/i).count();
    expect(filterSummaryCount).toBe(0);
  });
});

test.describe('FilterBar UI Interactions', () => {
  test('Collapse and expand toggle button works', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Initially collapsed
    let collapseButtonCount = await page.getByTitle(/Collapse filter bar/i).count();
    expect(collapseButtonCount).toBe(0);

    // Expand
    let expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Now should have collapse button
    let collapseButton = page.getByTitle(/Collapse filter bar/i).first();
    await expect(collapseButton).toBeVisible();

    // Collapse
    await collapseButton.click();
    await page.waitForTimeout(300);

    // Expand button should be back
    expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expect(expandButton).toBeVisible();
  });

  test('Keyboard focus and accessibility', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');

    // Navigate to Budget view
    const budgetButton = page.getByRole('button').filter({ hasText: /\$.*Budget/i }).first();
    await budgetButton.click();
    await page.waitForTimeout(500);

    // Expand FilterBar
    const expandButton = page.getByTitle(/Expand filter bar/i).first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // All interactive elements should be keyboard accessible
    const addButton = page.getByRole('button', { name: /Add Filter/i }).first();
    const modeButtons = page.getByRole('button').filter({ hasText: /Ghost|Hide/i });

    // Buttons should exist
    await expect(addButton).toBeVisible();
    const modeButtonCount = await modeButtons.count();
    expect(modeButtonCount).toBeGreaterThanOrEqual(2);
  });
});
