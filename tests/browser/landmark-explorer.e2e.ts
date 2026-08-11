import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/001-landmark-explorer/';

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

test('initial state never requests camera permission', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__cameraRequestCount__ =
            (window.__cameraRequestCount__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected camera request', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('heading', { name: 'Landmark Explorer' }),
  ).toBeVisible();
  const menuToggle = page.getByRole('button', { name: 'Studies' });
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
  await menuToggle.click();
  const experimentIndex = page.getByRole('navigation', {
    name: 'Experiment index',
  });
  await expect(experimentIndex).toBeVisible();
  await expect(
    experimentIndex.getByRole('link', { name: /001 Landmark Explorer/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(menuToggle).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Start camera' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'Camera permission has not been requested',
  );
  await expect
    .poll(() => page.evaluate(() => window.__cameraRequestCount__ ?? 0))
    .toBe(0);
});

test('fixture path works without camera or model', async ({ page }) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Use no-camera fixture' }).click();

  await expect(page.getByRole('status')).toContainText('Fixture playing');
  await expect(page.locator('#fixture-scenario')).toBeVisible();
  await expect(page.getByLabel('Hand', { exact: true })).toHaveValue(
    'fixture-right',
  );
  await expect(page.locator('#input-size')).toHaveText('1280×720');
});

test('fixtures expose one hand, two hands, dropout, and recovery', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Use no-camera fixture' }).click();
  const hand = page.getByLabel('Hand', { exact: true });
  const scenario = page.locator('#fixture-scenario');

  await expect(hand).toHaveValue('fixture-right');
  await scenario.selectOption('crossing');
  await expect(hand.locator('option')).toHaveCount(2);
  await scenario.selectOption('dropout');
  await expect(hand).toBeDisabled({ timeout: 2_000 });
  await expect(hand).toBeEnabled({ timeout: 2_000 });
});

test('keyboard activation enters fixture mode and keeps useful focus', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  const fixtureAction = page.getByRole('button', {
    name: 'Use no-camera fixture',
  });
  await fixtureAction.focus();
  await fixtureAction.press('Enter');

  await expect(page.getByRole('status')).toContainText('Fixture playing');
  await expect(
    page.getByRole('button', { name: 'Fixture', exact: true }),
  ).toBeFocused();
});

test('local MediaPipe assets initialize for image input', async ({ page }) => {
  await page.goto(EXPERIMENT_PATH);
  await page.locator('#image-input').setInputFiles({
    name: 'blank-fixture.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#111416"/></svg>',
    ),
  });

  await expect(page.getByRole('status')).toContainText('Image ready', {
    timeout: 20_000,
  });
  await expect(page.locator('#input-size')).toHaveText('640×480');
});

test('reduced-motion preference disables recurring animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(EXPERIMENT_PATH);

  await expect
    .poll(() =>
      page.evaluate(() => ({
        matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
        durationSeconds: Number.parseFloat(
          getComputedStyle(document.querySelector<HTMLElement>('.privacy-dot')!)
            .animationDuration,
        ),
        scrollBehavior: getComputedStyle(document.documentElement)
          .scrollBehavior,
      })),
    )
    .toEqual({
      matches: true,
      durationSeconds: 0.00001,
      scrollBehavior: 'auto',
    });
});

test('camera denial remains recoverable', async ({ page }) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(
            new DOMException('Permission denied by test', 'NotAllowedError'),
          ),
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Start camera' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Camera permission denied',
  );
  await expect(
    page.getByRole('button', { name: 'Use no-camera fixture' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Use no-camera fixture' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

test('switching away from camera stops every media track', async ({ page }) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    window.__stoppedTrackCount__ = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const context = canvas.getContext('2d');
          context?.fillRect(0, 0, canvas.width, canvas.height);
          const stream = canvas.captureStream(10);
          for (const track of stream.getTracks()) {
            const nativeStop = track.stop.bind(track);
            track.stop = () => {
              window.__stoppedTrackCount__ =
                (window.__stoppedTrackCount__ ?? 0) + 1;
              nativeStop();
            };
          }
          window.__mockCameraCanvas__ = canvas;
          return Promise.resolve(stream);
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('status')).toContainText('Camera active');

  await page.getByRole('button', { name: 'Fixture', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__stoppedTrackCount__ ?? 0))
    .toBe(1);
});

declare global {
  interface Window {
    __cameraRequestCount__?: number;
    __stoppedTrackCount__?: number;
    __mockCameraCanvas__?: HTMLCanvasElement;
  }
}
