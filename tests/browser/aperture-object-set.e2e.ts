import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/008-aperture-object-set/';

async function installNoopTracker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__GSL_TEST_HOOKS__ = {
      createTracker: () => ({
        ensureMode: () => Promise.resolve(),
        detectImage: (_source, timestampMs) => ({
          observations: [],
          timestampMs,
          inferenceDurationMs: 1,
          sourceWidth: 640,
          sourceHeight: 480,
        }),
        detectVideo: (_source, timestampMs) => ({
          observations: [],
          timestampMs,
          inferenceDurationMs: 1,
          sourceWidth: 640,
          sourceHeight: 480,
        }),
        close: () => undefined,
      }),
    };
  });
}

test('initial object set stays camera-free and marks study 008 current', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__apertureSetCameraRequests__ =
            (window.__apertureSetCameraRequests__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);
  await expect(
    page.getByRole('heading', { name: 'Aperture Object Set' }),
  ).toBeVisible();
  await expect(page.locator('#aperture-set-count')).toHaveText('3 / 3');
  await page.getByRole('button', { name: 'Studies' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Experiment index' })
      .getByRole('link', { name: /008 Aperture Object Set/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__apertureSetCameraRequests__ ?? 0))
    .toBe(0);
});

test('fixture previews containment, then commits only after aperture release', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run set fixture' }).click();
  await expect(page.locator('#aperture-set-aperture')).toHaveText('ACTIVE', {
    timeout: 2_500,
  });
  await expect(page.locator('#aperture-set-selected')).toHaveText(
    'CUBE-1, CUBE-2',
  );
  await expect(page.locator('#aperture-set-phase')).toHaveText('PREVIEW');
  await expect(
    page.getByText('Delete: one hand, index extended'),
  ).toBeVisible();
  await expect(page.locator('#aperture-set-phase')).toHaveText('READY', {
    timeout: 7_000,
  });
  await expect(page.locator('#aperture-set-selected')).toHaveText(
    'CUBE-1, CUBE-2',
  );
});

test('open-palm span-like evidence cannot replace the selected set', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run set fixture' }).click();
  await page.locator('#aperture-set-scenario').selectOption('open-palm-span');

  await expect(page.locator('#aperture-set-aperture')).not.toHaveText(
    'ACTIVE',
    {
      timeout: 2_000,
    },
  );
  await expect(page.locator('#aperture-set-fixture')).toContainText(
    'span-like evidence rejected',
  );
});

test('span keeps a committed set selected while scaling it', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run set fixture' }).click();
  await page.locator('#aperture-set-scenario').selectOption('span-scale');

  await expect(page.locator('#aperture-set-phase')).toHaveText('READY', {
    timeout: 7_000,
  });
  await expect(page.locator('#aperture-set-selected')).toHaveText(
    'CUBE-1, CUBE-2',
  );
  await expect(page.locator('#aperture-set-action')).toHaveText('SCALE', {
    timeout: 3_000,
  });
  await expect(page.locator('#aperture-set-selected')).toHaveText(
    'CUBE-1, CUBE-2',
  );
});

test('point hold visibly deletes selected set and Undo restores it', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run set fixture' }).click();
  await page.locator('#aperture-set-scenario').selectOption('point-delete');
  await expect(page.locator('#aperture-set-phase')).toHaveText('READY', {
    timeout: 7_000,
  });
  await expect(page.locator('#aperture-set-count')).toHaveText('1 / 3', {
    timeout: 10_000,
  });
  await expect(page.getByRole('button', { name: 'Undo delete' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo delete' }).click();
  await expect(page.locator('#aperture-set-count')).toHaveText('3 / 3');
  await expect(page.locator('#aperture-set-selected')).toHaveText(
    'CUBE-1, CUBE-2',
  );
});

test('open-palm hold clears selection without deleting any cube', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run set fixture' }).click();
  await page.locator('#aperture-set-scenario').selectOption('open-palm-clear');

  await expect(page.locator('#aperture-set-selected')).toHaveText('NONE', {
    timeout: 10_000,
  });
  await expect(page.locator('#aperture-set-count')).toHaveText('3 / 3');
  await expect(page.getByRole('status')).toContainText('cleared selection');
});

test('valid empty aperture returns to selection mode after release', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run set fixture' }).click();
  await page.locator('#aperture-set-scenario').selectOption('empty-field');

  await expect(page.locator('#aperture-set-aperture')).toHaveText('ACTIVE', {
    timeout: 3_000,
  });
  await expect(page.locator('#aperture-set-selected')).toHaveText('NONE');
  await expect(page.locator('#aperture-set-phase')).toHaveText('SELECT', {
    timeout: 7_000,
  });
  await expect(page.locator('#aperture-set-count')).toHaveText('3 / 3');
});

test('compact viewport keeps two cubes and no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(EXPERIMENT_PATH);
  await expect(page.locator('#aperture-set-count')).toHaveText('2 / 2');
  await expect(page.locator('#aperture-set-overlay')).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test('camera denial remains recoverable through fixture', async ({ page }) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Camera permission denied',
  );
  await page.getByRole('button', { name: 'Run set fixture' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

declare global {
  interface Window {
    __apertureSetCameraRequests__?: number;
  }
}
