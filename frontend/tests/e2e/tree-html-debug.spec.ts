import { test, expect } from '@playwright/test';
import { createNewProject } from './utils';

test('debug: print tree HTML if "+" button not found', async ({ page }) => {
  await page.goto('/');

  await createNewProject(page, 'Debug Project');

  // Wait for the tree to appear
  const tree = page.locator('[data-testid="tree-item-row"]');
  await expect(tree.first()).toBeVisible({ timeout: 10000 });

  // Try to find the "+" button
  const addChildBtn = page.locator('button[title="Add child node"]');
  if (await addChildBtn.count() === 0) {
    // Print the tree HTML for debugging
    const treeHtml = await tree.first().evaluate(node => node.parentElement?.innerHTML || node.innerHTML);
    console.log('TREE HTML:', treeHtml);
    throw new Error('No "+" button found in tree. See console for tree HTML.');
  }

  // If found, click it
  await addChildBtn.first().click();
  // ...rest of test omitted for debug
});
