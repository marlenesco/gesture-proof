import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/007-aperture-field/';

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

test('initial aperture field remains camera-free and appears in collection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__apertureCameraRequests__ =
            (window.__apertureCameraRequests__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('heading', { name: 'Aperture Field' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Studies' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Experiment index' })
      .getByRole('link', { name: /007 Aperture Field/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__apertureCameraRequests__ ?? 0))
    .toBe(0);
});

test('homepage foregrounds Aperture Field while keeping it in the research index', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: /Explore Aperture Field/ }),
  ).toHaveAttribute('href', /experiments\/007-aperture-field\/$/);
  await expect(
    page
      .locator('#experiments')
      .getByRole('link', { name: /007 Aperture Field/ }),
  ).toHaveAttribute('href', /experiments\/007-aperture-field\/$/);
});

test('method explains aperture topology through a shareable hash', async ({
  page,
}) => {
  await page.goto(`${EXPERIMENT_PATH}#method`);

  const panel = page.locator('#aperture-method');
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: 'A field keeps its anatomy.' }),
  ).toBeVisible();
  await expect(panel.getByText('Anatomical corner order')).toBeVisible();
  await expect(panel.getByText('Contact without snap')).toBeVisible();
  await panel.getByRole('button', { name: /close/i }).click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(EXPERIMENT_PATH);
});

test('steady fixture confirms an aperture and switches local optics', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run aperture fixture' }).click();

  await expect(page.locator('#aperture-phase')).toHaveText('ACTIVE', {
    timeout: 2_500,
  });
  await expect(page.locator('#aperture-area')).not.toHaveText('0.00');
  await page.locator('#aperture-effect-select').selectOption('pixelate');
  await expect(page.locator('#aperture-effect-select')).toHaveValue('pixelate');
  await page.locator('#aperture-effect-select').selectOption('blur');
  await expect(page.locator('#aperture-effect-select')).toHaveValue('blur');
});

test('small aperture stays inactive', async ({ page }) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run aperture fixture' }).click();
  await page.locator('#aperture-scenario').selectOption('small-aperture');

  await expect(page.locator('#aperture-phase')).not.toHaveText('ACTIVE', {
    timeout: 900,
  });
  await expect(page.locator('#aperture-reason')).toHaveText('geometry invalid');
});

test('crossed and pinched fixtures preserve their valid topology', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run aperture fixture' }).click();

  await page.locator('#aperture-scenario').selectOption('crossing');
  await expect(page.locator('#aperture-phase')).toHaveText('ACTIVE', {
    timeout: 2_500,
  });
  await expect(page.locator('#aperture-fixture-label')).toContainText(
    'bow-tie',
  );

  await page.locator('#aperture-scenario').selectOption('pinch-corner');
  await expect(page.locator('#aperture-phase')).toHaveText('ACTIVE', {
    timeout: 2_500,
  });
  await expect(page.locator('#aperture-fixture-label')).toContainText(
    'triangular',
  );
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
  await page.getByRole('button', { name: 'Run aperture fixture' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

test('reduced motion preserves fixture evidence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run aperture fixture' }).click();

  await expect(page.locator('#aperture-phase')).toHaveText('ACTIVE', {
    timeout: 2_500,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number.parseFloat(
          getComputedStyle(document.querySelector<HTMLElement>('.hero-copy')!)
            .transitionDuration,
        ),
      ),
    )
    .toBe(0.00001);
});

declare global {
  interface Window {
    __apertureCameraRequests__?: number;
  }
}
