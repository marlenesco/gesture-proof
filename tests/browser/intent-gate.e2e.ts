import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/002-intent-gate/';

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

test('index keeps all experiments separate and reachable', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Gesture Proof' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Landmark Explorer/ }),
  ).toHaveAttribute('href', '/experiments/001-landmark-explorer/');
  await expect(page.getByRole('link', { name: /Intent Gate/ })).toHaveAttribute(
    'href',
    EXPERIMENT_PATH,
  );
  await expect(
    page.getByRole('link', { name: /Gesture Calibration Bench/ }),
  ).toHaveAttribute('href', '/experiments/003-gesture-calibration-bench/');
});

test('initial gate does not request camera permission', async ({ page }) => {
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
    page.getByRole('heading', { name: 'Intent Gate' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'Camera permission has not been requested',
  );
  await expect
    .poll(() => page.evaluate(() => window.__cameraRequestCount__ ?? 0))
    .toBe(0);
});

test('clean fixture crosses temporal gate without camera or model', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run deterministic pinch' }).click();

  await expect(page.getByRole('status')).toContainText('Fixture playing');
  await expect(page.locator('#gate-phase')).toHaveText('ACTIVE', {
    timeout: 2_500,
  });
  await expect(page.locator('#gate-hand')).toHaveText('fixture-right');
  await expect(page.locator('#gate-activation-value')).toHaveText('100%');
});

test('keyboard activation enters fixture mode with useful focus', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  const action = page.getByRole('button', { name: 'Run deterministic pinch' });
  await action.focus();
  await action.press('Enter');

  await expect(page.getByRole('status')).toContainText('Fixture playing');
  await expect(
    page.getByRole('button', { name: 'Fixture', exact: true }),
  ).toBeFocused();
});

test('camera denial is visible and fixture recovery remains available', async ({
  page,
}) => {
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
  await page.getByRole('button', { name: 'Run deterministic pinch' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

test('camera-unavailable state keeps fixture enabled', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('button', { name: 'Start camera' }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(
    'Camera API unavailable',
  );
  await expect(
    page.getByRole('button', { name: 'Run deterministic pinch' }),
  ).toBeEnabled();
});

test('switching from camera to fixture stops every media track', async ({
  page,
}) => {
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
          canvas.getContext('2d')?.fillRect(0, 0, canvas.width, canvas.height);
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

test('reduced motion removes transitions and recurring motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(EXPERIMENT_PATH);

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
    __cameraRequestCount__?: number;
    __stoppedTrackCount__?: number;
    __mockCameraCanvas__?: HTMLCanvasElement;
  }
}
