import { test, expect } from '@playwright/test';
import { createNewProject, resetE2ETemplateFixture } from './utils';

async function openBudgetFilters(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^Tools$/i }).last().click();
  await page.getByRole('button', { name: /^Budget$/i }).click();
  await page.getByRole('button', { name: /^Filters$/i }).last().click();
  await expect(page.getByText(/No filters configured/i)).toBeVisible({ timeout: 10000 });
}

test.beforeEach(async () => {
  await resetE2ETemplateFixture();
});

test.describe('FilterBar - Budget View', () => {
  test('Filter panel is visible in Budget view', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');
    await openBudgetFilters(page);

    await expect(page.getByText(/No filters configured/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Filter/i }).first()).toBeVisible();
    await expect(page.getByText(/Mode:/i)).toBeVisible();
  });

  test('Adding a filter rule works correctly', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');
    await openBudgetFilters(page);

    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();

    const allSelects = page.locator('select');
    await expect(allSelects.first()).toBeVisible();
    const selectCount = await allSelects.count();
    expect(selectCount).toBeGreaterThanOrEqual(2);
    await expect(page.getByPlaceholder(/Value\.\.\./i)).toBeVisible();
  });

  test('Filter rule properties can be configured', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');
    await openBudgetFilters(page);

    await page.getByRole('button', { name: /Add Filter/i }).first().click();

    const propertySelect = page.locator('select').first();
    await expect(propertySelect).toBeVisible();
    const options = await propertySelect.locator('option').count();
    expect(options).toBeGreaterThan(1);

    const optionTexts = await propertySelect.locator('option').allTextContents();
    const realProperty = optionTexts.find((text) => text && text !== 'Select property...');
    if (realProperty) {
      await propertySelect.selectOption({ label: realProperty });
    }
  });

  test('Switching between Ghost and Hide modes', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');
    await openBudgetFilters(page);

    const ghostButton = page.getByRole('button', { name: /^Ghost$/i }).first();
    const hideButton = page.getByRole('button', { name: /^Hide$/i }).first();

    await expect(ghostButton).toBeVisible();
    await expect(hideButton).toBeVisible();

    await hideButton.click();
    await ghostButton.click();
  });

  test('Delete rule button removes a rule', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');
    await openBudgetFilters(page);

    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();
    await addFilterButton.click();

    const trashButtons = page.getByTitle(/Delete this filter rule/i);
    const initialCount = await trashButtons.count();
    expect(initialCount).toBeGreaterThanOrEqual(2);

    await trashButtons.first().click();
    await expect(trashButtons).toHaveCount(initialCount - 1);
  });

  test('Clear All button removes all rules', async ({ page }) => {
    await page.goto('/');
    await createNewProject(page, 'Filter Test Project', 'e2e_smoketest');
    await openBudgetFilters(page);

    const addFilterButton = page.getByRole('button', { name: /Add Filter/i }).first();
    await addFilterButton.click();
    await addFilterButton.click();

    const clearButton = page.getByRole('button', { name: /Clear All/i }).first();
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    await expect(page.getByText(/No filters configured/i)).toBeVisible();
  });
});
