import { test, expect } from '@playwright/test';
import { openTemplateEditor, resetE2ETemplateFixture } from './utils';

async function saveTemplate(page: Parameters<typeof test>[0]['page']) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/templates/editor') &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 15000 },
    ),
    page.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);

  await expect(page.getByText('Saved successfully', { exact: true })).toBeVisible({ timeout: 10000 });
}

test.describe('Template Editor create workflow', () => {
  test.beforeEach(async () => {
    await resetE2ETemplateFixture();
  });

  test('creates a new template and reopens it from the list', async ({ page }) => {
    await page.goto('/');
    await openTemplateEditor(page);

    await page.getByRole('button', { name: 'New Template', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New Template', exact: true })).toBeVisible({ timeout: 10000 });

    const textInputs = page.locator('input[type="text"]');
    await expect(textInputs.nth(1)).toBeVisible({ timeout: 10000 });
    await textInputs.nth(1).fill('Created In Browser');

    await saveTemplate(page);

    const createdTemplateResponse = await page.request.get('/api/v1/templates/editor/new_template');
    await expect(createdTemplateResponse.ok()).toBeTruthy();
    const createdTemplate = await createdTemplateResponse.json();
    expect(createdTemplate.name).toBe('Created In Browser');
    expect(Array.isArray(createdTemplate.node_types)).toBeTruthy();
    expect(createdTemplate.node_types).toHaveLength(1);
    expect(createdTemplate.node_types[0].id).toBe('root');

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Template Editor', exact: true })).toBeVisible({ timeout: 10000 });

    const templateCard = page.getByText('new_template', { exact: true }).first();
    await expect(templateCard).toBeVisible({ timeout: 10000 });
    await templateCard.click();

    await expect(page.getByRole('heading', { name: 'Created In Browser', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Node Types', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Root', exact: true })).toBeVisible({ timeout: 10000 });
  });
});