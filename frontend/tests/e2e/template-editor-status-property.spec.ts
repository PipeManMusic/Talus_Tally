import { test, expect, type Page } from '@playwright/test';
import { openTemplateEditor, E2E_TEMPLATE_NAME, resetE2ETemplateFixture } from './utils';

async function openE2ETemplate(page: Page) {
  const templateCard = page.getByText(E2E_TEMPLATE_NAME, { exact: true }).first();
  await expect(templateCard).toBeVisible({ timeout: 10000 });
  await templateCard.click();
  await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });
}

async function ensureNodeTypeExpanded(page: Page, label: string) {
  const nodeTypeHeading = page.getByRole('heading', { name: label, exact: true }).first();
  await expect(nodeTypeHeading).toBeVisible({ timeout: 10000 });

  const addPropertyButton = page.getByRole('button', { name: 'Add Property', exact: true }).first();
  if (!(await addPropertyButton.isVisible().catch(() => false))) {
    await nodeTypeHeading.click();
  }

  await expect(addPropertyButton).toBeVisible({ timeout: 10000 });
}

async function waitForTemplateSave(page: Page) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/templates/editor/e2e_smoketest') &&
        response.request().method() === 'PUT' &&
        response.ok(),
      { timeout: 15000 }
    ),
    page.locator('button:has-text("Save")').first().click(),
  ]);

  await expect(page.getByText('Saved successfully', { exact: true })).toBeVisible({ timeout: 10000 });
}

test.describe('Template Editor status property workflow', () => {
  test.beforeEach(async () => {
    await resetE2ETemplateFixture();
  });

  test('keeps a select status property valid through save and reopen', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);
    await openE2ETemplate(page);
    await ensureNodeTypeExpanded(page, 'Test Project');

    await page.getByRole('button', { name: 'Add Property', exact: true }).first().click();

    const newPropertyHeading = page.getByRole('heading', { name: 'New Property', exact: true }).first();
    await expect(newPropertyHeading).toBeVisible({ timeout: 10000 });
    await newPropertyHeading.click();

    const propertyLabelInput = page.locator('input[type="text"]').last();
    await expect(propertyLabelInput).toBeVisible({ timeout: 10000 });
    await propertyLabelInput.fill('Workflow Status');

    const propertyTypeSelect = page.getByRole('combobox').last();
    await propertyTypeSelect.selectOption('select');

    const firstOptionInput = page.getByPlaceholder('Option name').first();
    await expect(firstOptionInput).toHaveValue('Option 1', { timeout: 10000 });

    await page.getByRole('button', { name: 'Remove option Option 1', exact: true }).click();
    await expect(page.getByPlaceholder('Option name').first()).toHaveValue('Option 1', { timeout: 10000 });

    await page.getByPlaceholder('Option name').first().fill('Queued');
    await page.getByRole('button', { name: '+ Add Option', exact: true }).click();

    const optionInputs = page.getByPlaceholder('Option name');
    await expect(optionInputs).toHaveCount(2, { timeout: 10000 });
    await expect(optionInputs.nth(1)).toHaveValue('Option 2');
    await optionInputs.nth(1).fill('Done');

    const primaryStatusCheckbox = page.getByRole('checkbox', { name: 'Workflow Status', exact: true }).last();
    await expect(primaryStatusCheckbox).toBeVisible({ timeout: 10000 });
    await primaryStatusCheckbox.check();
    await expect(primaryStatusCheckbox).toBeChecked();

    await waitForTemplateSave(page);

    const persistedTemplateResponse = await page.request.get('/api/v1/templates/editor/e2e_smoketest');
    await expect(persistedTemplateResponse.ok()).toBeTruthy();
    const persistedTemplate = await persistedTemplateResponse.json();
    const rootNodeType = (persistedTemplate.node_types || []).find((nodeType: any) => nodeType.id === 'e2e_root');
    expect(rootNodeType).toBeTruthy();

    const statusProperty = (rootNodeType?.properties || []).find(
      (property: any) => property.label === 'Workflow Status',
    );
    expect(statusProperty).toBeTruthy();
    expect(statusProperty.type).toBe('select');
    expect(statusProperty.indicator_set).toBe('status');
    expect((statusProperty.options || []).map((option: any) => option.name)).toEqual(['Queued', 'Done']);
    expect((rootNodeType?.properties || []).filter((property: any) => property.label === 'Workflow Status')).toHaveLength(1);
    if (rootNodeType.primary_status_property_id) {
      expect(rootNodeType.primary_status_property_id).toBe(statusProperty.id);
    }

    await page.reload();
    await openTemplateEditor(page);
    await openE2ETemplate(page);
    await ensureNodeTypeExpanded(page, 'Test Project');

    const workflowStatusHeading = page.getByRole('heading', { name: 'Workflow Status', exact: true }).last();
    await expect(workflowStatusHeading).toBeVisible({ timeout: 10000 });
    await workflowStatusHeading.click();

    await expect(page.getByPlaceholder('Option name')).toHaveCount(2, { timeout: 10000 });
    await expect(page.getByPlaceholder('Option name').nth(0)).toHaveValue('Queued');
    await expect(page.getByPlaceholder('Option name').nth(1)).toHaveValue('Done');
    await expect(page.getByRole('checkbox', { name: 'Workflow Status', exact: true }).last()).toBeChecked();
  });

  test('persists the latest select option edits after rapid consecutive changes', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);
    await openE2ETemplate(page);
    await ensureNodeTypeExpanded(page, 'Test Project');

    await page.getByRole('button', { name: 'Add Property', exact: true }).first().click();

    const newPropertyHeading = page.getByRole('heading', { name: 'New Property', exact: true }).first();
    await expect(newPropertyHeading).toBeVisible({ timeout: 10000 });
    await newPropertyHeading.click();

    const propertyLabelInput = page.locator('input[type="text"]').last();
    await expect(propertyLabelInput).toBeVisible({ timeout: 10000 });
    await propertyLabelInput.fill('Rapid Status');

    const propertyTypeSelect = page.getByRole('combobox').last();
    await propertyTypeSelect.selectOption('select');

    const addOptionButton = page.getByRole('button', { name: '+ Add Option', exact: true });
    await expect(addOptionButton).toBeVisible({ timeout: 10000 });

    const optionInputs = page.getByPlaceholder('Option name');
    await expect(optionInputs.first()).toHaveValue('Option 1', { timeout: 10000 });

    await optionInputs.first().fill('Queued');
    await addOptionButton.click();
    await expect(optionInputs.nth(1)).toHaveValue('Option 2', { timeout: 10000 });
    await optionInputs.nth(1).fill('Draft');
    await optionInputs.nth(1).fill('In Progress');
    await addOptionButton.click();
    await expect(optionInputs.nth(2)).toHaveValue('Option 3', { timeout: 10000 });
    await optionInputs.nth(2).fill('Done');

    await waitForTemplateSave(page);

    const persistedTemplateResponse = await page.request.get('/api/v1/templates/editor/e2e_smoketest');
    await expect(persistedTemplateResponse.ok()).toBeTruthy();
    const persistedTemplate = await persistedTemplateResponse.json();
    const rootNodeType = (persistedTemplate.node_types || []).find((nodeType: any) => nodeType.id === 'e2e_root');
    expect(rootNodeType).toBeTruthy();

    const rapidStatusProperty = (rootNodeType?.properties || []).find(
      (property: any) => property.label === 'Rapid Status',
    );
    expect(rapidStatusProperty).toBeTruthy();
    expect((rapidStatusProperty.options || []).map((option: any) => option.name)).toEqual([
      'Queued',
      'In Progress',
      'Done',
    ]);

    await page.reload();
    await openTemplateEditor(page);
    await openE2ETemplate(page);
    await ensureNodeTypeExpanded(page, 'Test Project');

    const rapidStatusHeading = page.getByRole('heading', { name: 'Rapid Status', exact: true }).last();
    await expect(rapidStatusHeading).toBeVisible({ timeout: 10000 });
    await rapidStatusHeading.click();

    await expect(page.getByPlaceholder('Option name')).toHaveCount(3, { timeout: 10000 });
    await expect(page.getByPlaceholder('Option name').nth(0)).toHaveValue('Queued');
    await expect(page.getByPlaceholder('Option name').nth(1)).toHaveValue('In Progress');
    await expect(page.getByPlaceholder('Option name').nth(2)).toHaveValue('Done');
  });

  test('persists the latest property label and type edits after rapid changes', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);
    await openE2ETemplate(page);
    await ensureNodeTypeExpanded(page, 'Test Project');

    await page.getByRole('button', { name: 'Add Property', exact: true }).first().click();

    const newPropertyHeading = page.getByRole('heading', { name: 'New Property', exact: true }).first();
    await expect(newPropertyHeading).toBeVisible({ timeout: 10000 });
    await newPropertyHeading.click();

    const propertyLabelInput = page.locator('input[type="text"]').last();
    await expect(propertyLabelInput).toBeVisible({ timeout: 10000 });
    await propertyLabelInput.fill('Draft Field');
    await propertyLabelInput.fill('Revised Field');
    await propertyLabelInput.fill('Final Status Field');

    const propertyTypeSelect = page.getByRole('combobox').last();
    await propertyTypeSelect.selectOption('number');
    await propertyTypeSelect.selectOption('text');
    await propertyTypeSelect.selectOption('select');

    const optionInputs = page.getByPlaceholder('Option name');
    await expect(optionInputs.first()).toHaveValue('Option 1', { timeout: 10000 });
    await optionInputs.first().fill('Open');

    await waitForTemplateSave(page);

    const persistedTemplateResponse = await page.request.get('/api/v1/templates/editor/e2e_smoketest');
    await expect(persistedTemplateResponse.ok()).toBeTruthy();
    const persistedTemplate = await persistedTemplateResponse.json();
    const rootNodeType = (persistedTemplate.node_types || []).find((nodeType: any) => nodeType.id === 'e2e_root');
    expect(rootNodeType).toBeTruthy();

    const finalProperty = (rootNodeType?.properties || []).find(
      (property: any) => property.label === 'Final Status Field',
    );
    expect(finalProperty).toBeTruthy();
    expect(finalProperty.type).toBe('select');
    expect(finalProperty.indicator_set).toBe('status');
    expect((finalProperty.options || []).map((option: any) => option.name)).toEqual(['Open']);

    await page.reload();
    await openTemplateEditor(page);
    await openE2ETemplate(page);
    await ensureNodeTypeExpanded(page, 'Test Project');

    const finalPropertyHeading = page.getByRole('heading', { name: 'Final Status Field', exact: true }).last();
    await expect(finalPropertyHeading).toBeVisible({ timeout: 10000 });
    await finalPropertyHeading.click();

    await expect(page.getByPlaceholder('Option name')).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByPlaceholder('Option name').first()).toHaveValue('Open');
  });
});