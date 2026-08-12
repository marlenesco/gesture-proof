import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/005-motion-field/';

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

test('initial field remains camera-free and marks study 005 current', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__motionCameraRequests__ =
            (window.__motionCameraRequests__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('heading', { name: 'Motion Field' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Studies' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Experiment index' })
      .getByRole('link', { name: /005 Motion Field/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__motionCameraRequests__ ?? 0))
    .toBe(0);
});

test('deterministic sweep emits a bounded field from motion signals', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run horizontal sweep' }).click();

  await expect(page.locator('#motion-phase')).toHaveText('ACTIVE', {
    timeout: 1_500,
  });
  await expect(page.locator('#motion-field-mode')).toHaveText('EMIT', {
    timeout: 1_500,
  });
  await expect
    .poll(() =>
      page
        .locator('#motion-particles')
        .evaluate((node) => Number.parseInt(node.textContent ?? '0', 10)),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page
        .locator('#motion-particles')
        .evaluate((node) => Number.parseInt(node.textContent ?? '0', 10)),
    )
    .toBeLessThanOrEqual(320);
});

test('sub-threshold stillness does not sustain particle emission', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run horizontal sweep' }).click();
  await page.locator('#motion-scenario').selectOption('stillness');
  await page.waitForTimeout(700);

  await expect(page.locator('#motion-phase')).toHaveText('IDLE');
  await expect(page.locator('#motion-particles')).toHaveText('0');
});

test('two-hand fixture keeps one stable motion owner', async ({ page }) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run horizontal sweep' }).click();
  await page.locator('#motion-scenario').selectOption('two-hand-owner');

  await expect(page.locator('#motion-owner')).toHaveText('fixture-right', {
    timeout: 1_000,
  });
  await expect(page.locator('#motion-fixture-label')).toHaveText(
    'Stable primary with second hand',
  );
});

test('long fixture dropout expires motion instead of teleporting field', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run horizontal sweep' }).click();
  await page.locator('#motion-scenario').selectOption('dropout');

  await expect(page.locator('#motion-fixture-label')).toHaveText(
    'Long dropout',
    {
      timeout: 6_500,
    },
  );
  await expect(page.locator('#motion-phase')).toHaveText('UNKNOWN');
  await expect(page.locator('#motion-speed')).toHaveText('0.000');
});

test('camera denial remains recoverable', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Run horizontal sweep' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

test('unavailable camera keeps deterministic fixture enabled', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {},
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('button', { name: 'Start camera' }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(
    'Camera API unavailable',
  );
  await page.getByRole('button', { name: 'Run horizontal sweep' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

test('input switch closes every camera track', async ({ page }) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    window.__motionStoppedTracks__ = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          canvas.getContext('2d')?.fillRect(0, 0, canvas.width, canvas.height);
          const stream = canvas.captureStream(10);
          stream.getTracks().forEach((track) => {
            const nativeStop = track.stop.bind(track);
            track.stop = () => {
              window.__motionStoppedTracks__ =
                (window.__motionStoppedTracks__ ?? 0) + 1;
              nativeStop();
            };
          });
          window.__motionCameraCanvas__ = canvas;
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
    .poll(() => page.evaluate(() => window.__motionStoppedTracks__ ?? 0))
    .toBe(1);
});

test('reduced motion preserves evidence without recurring particles', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run horizontal sweep' }).click();
  await expect(page.locator('#motion-phase')).toHaveText('ACTIVE', {
    timeout: 1_500,
  });

  await expect(page.locator('#motion-particles')).toHaveText('0');
  await expect
    .poll(() =>
      page.evaluate(() => ({
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transition: Number.parseFloat(
          getComputedStyle(document.querySelector<HTMLElement>('.hero-copy')!)
            .transitionDuration,
        ),
        scroll: getComputedStyle(document.documentElement).scrollBehavior,
      })),
    )
    .toEqual({ reduced: true, transition: 0.00001, scroll: 'auto' });
});

declare global {
  interface Window {
    __motionCameraRequests__?: number;
    __motionStoppedTracks__?: number;
    __motionCameraCanvas__?: HTMLCanvasElement;
  }
}
