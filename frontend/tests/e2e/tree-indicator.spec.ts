import { test, expect } from '@playwright/test';
import { createNewProject, resetE2ETemplateFixture } from './utils';

test('tree view displays node labels and status indicators', async ({ page }) => {
  await resetE2ETemplateFixture();
      // Log all network requests for debugging
      // Log all network requests for debugging (project and add-child)
      page.on('request', request => {
        if (request.url().includes('/api/v1/projects') || request.url().includes('/api/v1/commands/execute')) {
          console.log('API REQUEST:', request.method(), request.url(), request.postData());
        }
      });
      page.on('response', async response => {
        if (response.url().includes('/api/v1/projects') || response.url().includes('/api/v1/commands/execute')) {
          const body = await response.text();
          console.log('API RESPONSE:', response.status(), response.url(), body);
        }
      });
      // Utility: log SVG/text indicator data for all nodes in the tree
      async function logTreeIndicators() {
        const nodes = await page.locator('[data-testid="tree-item-row"]').all();
        for (const node of nodes) {
          const label = await node.locator('.text-sm').textContent();
          const svg = await node.locator('.status-indicator-svg').count() > 0 ? 'SVG' : '';
          const text = await node.locator('.status-indicator-text').textContent();
          console.log('TREE NODE:', label, '| SVG:', svg, '| Text:', text);
        }
      }
    // Check backend health before proceeding
    const res = await page.request.get('http://localhost:5000/api/v1/sessions');
    if (!res.ok()) {
      throw new Error('Backend health check failed: ' + res.status() + ' ' + res.statusText());
    }
  await page.goto('/');


  await createNewProject(page, 'Indicator Project');

  // Add a child node via the "+" button in the tree (using testid)
  const addChildBtn = page.locator('[data-testid="add-child-btn"]');
  await expect(addChildBtn.first()).toBeVisible({ timeout: 5000 });
  await addChildBtn.first().click();
  await page.screenshot({ path: 'after-add-child-btn.png', fullPage: true });

  // Wait for the flyout and log all visible child type options
  const flyout = page.locator('[data-testid="add-child-flyout"]');
  await expect(flyout).toBeVisible({ timeout: 5000 });
  const flyoutOptions = flyout.locator('[data-testid="add-child-flyout-option"]');
  await expect(flyoutOptions.first()).toBeVisible({ timeout: 5000 });
  const flyoutCount = await flyoutOptions.count();
  const flyoutLabels = [];
  for (let i = 0; i < flyoutCount; i++) {
    flyoutLabels.push(await flyoutOptions.nth(i).textContent());
  }
  console.log('FLYOUT OPTIONS:', flyoutLabels);
  await page.screenshot({ path: 'after-flyout.png', fullPage: true });

  // Assert that "Add Phase" is present (root node allowed child)
  const addPhaseOption = flyoutOptions.filter({ hasText: /Add\s+Phase/i }).first();
  if (await addPhaseOption.count() === 0) {
    throw new Error('"Add Phase" option not found in flyout. Options: ' + JSON.stringify(flyoutLabels));
  }
  await addPhaseOption.click();
  await page.screenshot({ path: 'after-add-phase-flyout.png', fullPage: true });

  // Wait up to 10s for Add Child dialog to appear, robust to placeholder variations
  // Try to match any input whose placeholder contains 'name' (case-insensitive)
  let childNameInput = page.locator('input[placeholder*="name" i]');
  let dialogVisible = false;
  for (let i = 0; i < 20; i++) { // 20 x 500ms = 10s
    if (await childNameInput.isVisible().catch(() => false)) {
      dialogVisible = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  // Log all input placeholders in the dialog for diagnosis
  const dialogInputs = page.locator('div[role="dialog"] input, .fixed input');
  const inputCount = await dialogInputs.count();
  const inputPlaceholders = [];
  for (let i = 0; i < inputCount; i++) {
    inputPlaceholders.push(await dialogInputs.nth(i).getAttribute('placeholder'));
  }
  console.log('DIALOG INPUT PLACEHOLDERS:', inputPlaceholders);
  await page.screenshot({ path: 'after-add-child-dialog-wait.png', fullPage: true });

  // Log tree indicators after attempting to add child
  await logTreeIndicators();

  // Fill in the child node name if dialog appears
  if (dialogVisible) {
    await childNameInput.fill('Phase 1');
    await page.screenshot({ path: 'before-add-child-click.png', fullPage: true });
    // Log all visible buttons in the dialog
    const dialogButtons = page.locator('div[role="dialog"] button, .fixed button');
    const btnCount = await dialogButtons.count();
    const btnLabels = [];
    for (let i = 0; i < btnCount; i++) {
      btnLabels.push(await dialogButtons.nth(i).textContent());
    }
    console.log('DIALOG BUTTONS:', btnLabels);
    // Log dialog HTML
    const dialogHtml = await page.locator('div[role="dialog"], .fixed').first().evaluate(el => el.outerHTML).catch(() => '');
    console.log('DIALOG HTML:', dialogHtml);
    // Only search for Add button inside the dialog/modal
    let clicked = false;
    const dialogAddButtons = page.locator('div[role="dialog"] button, .fixed button');
    const dialogBtnCount = await dialogAddButtons.count();
    for (let i = 0; i < dialogBtnCount; i++) {
      const label = (await dialogAddButtons.nth(i).textContent())?.trim() || '';
      if (/^Add/i.test(label)) {
        await dialogAddButtons.nth(i).click();
        clicked = true;
        console.log('Clicked Add button in dialog:', label);
        break;
      }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'after-add-child-click.png', fullPage: true });
    // Wait for dialog to disappear
    try {
      await expect(childNameInput).toBeHidden({ timeout: 5000 });
      console.log('Add Child dialog closed after click.');
    } catch {
      console.log('Add Child dialog did NOT close after click.');
    }
    if (!clicked) {
      console.log('Add Child confirm button was not found or not clicked.');
    }
    // Print any visible error messages in the dialog
    const errorMsg = await page.locator('.text-status-danger, .text-red-500, .text-error').allTextContents();
    if (errorMsg.length > 0) {
      console.log('VISIBLE ERROR MESSAGES (Add Child):', errorMsg);
    }
  } else {
    console.log('Add Child dialog did not appear after selecting "Add Phase".');
    await page.screenshot({ path: 'add-child-dialog-missing.png', fullPage: true });
  }

  // Wait up to 5s for the new child node to appear in the tree (using testid)
  let childTreeItem = page.locator('[data-testid="tree-item-row"]', { hasText: 'Phase 1' });
  let found = false;
  for (let i = 0; i < 10; i++) { // 10 x 500ms = 5s
    if (await childTreeItem.count().catch(() => 0) > 0 && await childTreeItem.isVisible().catch(() => false)) {
      found = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: 'after-child-node-wait.png', fullPage: true });
  if (!found) {
    // Print the tree state for debugging
    const treeItems = await page.locator('[data-testid="tree-item-row"]').all();
    for (const item of treeItems) {
      const id = await item.getAttribute('data-node-id');
      const allowed = await item.getAttribute('data-allowed-children');
      const expanded = await item.getAttribute('data-expanded');
      const label = await item.locator('.text-sm').textContent();
      console.log('TREE ITEM:', { id, label, allowed, expanded });
    }
    await logTreeIndicators();
    throw new Error('Child Node not found in tree after waiting. See TREE ITEM log above.');
  }
  // Change the status of the child node (simulate inspector interaction)
  // Open the child node in the inspector
  try {
    await childTreeItem.click({ timeout: 5000 });
  } catch (e) {
    // Print the tree HTML for debugging
    const treeHtml = await page.locator('[data-testid="tree-item-row"]').first().evaluate(node => node.parentElement?.innerHTML || node.innerHTML);
    console.log('TREE HTML:', treeHtml);
    await logTreeIndicators();
    throw new Error('Child Node found but not clickable. See TREE HTML and indicator log above.');
  }
  // Find the status property dropdown (label + select pairing)
  const statusFieldContainer = page.locator('label', { hasText: /Status/i }).first().locator('..');
  const statusDropdown = statusFieldContainer.locator('select').first();
  await expect(statusDropdown).toBeVisible({ timeout: 5000 });
  // Select a non-default status option
  const options = await statusDropdown.locator('option').all();
  if (options.length < 2) {
    throw new Error('Expected at least two status options to be present.');
  }
  await statusDropdown.selectOption({ index: 1 });

  // Assert that the status indicator SVG or text is rendered in the tree
  const svgIndicator = childTreeItem.locator('.status-indicator-svg');
  const textIndicator = childTreeItem.locator('.status-indicator-text');
  await expect(svgIndicator.or(textIndicator)).toBeVisible();

  // Assert that the node label is visible
  await expect(childTreeItem).toBeVisible();
});
