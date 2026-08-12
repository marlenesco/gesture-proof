import { expect, test } from '@playwright/test';

const methods = [
  ['/experiments/001-landmark-explorer/', 'Measurements before meaning.'],
  ['/experiments/002-intent-gate/', 'Distance becomes intent over time.'],
  [
    '/experiments/003-gesture-calibration-bench/',
    'Compare evidence, not claims.',
  ],
  ['/experiments/004-gesture-state-matrix/', 'Evidence earns intent.'],
  ['/experiments/005-motion-field/', 'Motion becomes a bounded field.'],
  [
    '/experiments/006-object-manipulation-bench/',
    'Confirm first. Transform once.',
  ],
  ['/experiments/007-aperture-field/', 'A field keeps its anatomy.'],
] as const;

test.describe('shareable Method panels', () => {
  for (const [path, title] of methods) {
    test(`${path} opens Method from its hash`, async ({ page }) => {
      await page.goto(`${path}#method`);

      const panel = page.locator('[data-method-panel]');
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('heading', { name: title })).toBeVisible();
      await expect(panel.getByText('Implementation map')).toBeVisible();
      await panel.getByRole('button', { name: /close/i }).click();
      await expect(panel).toBeHidden();
      await expect(page).toHaveURL(path);
    });
  }
});
