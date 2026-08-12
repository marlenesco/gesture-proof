import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/003-gesture-calibration-bench/';

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

test('initial bench remains camera-free and exposes both gestures', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__benchCameraRequests__ =
            (window.__benchCameraRequests__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('heading', { name: 'Calibration Bench' }),
  ).toBeVisible();
  const menuToggle = page.getByRole('button', { name: 'Studies' });
  await menuToggle.click();
  await expect(
    page
      .getByRole('navigation', { name: 'Experiment index' })
      .getByRole('link', { name: /003 Gesture Calibration Bench/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(page.locator('#bench-gesture')).toHaveValue('pinch');
  await expect(page.locator('#bench-gesture option')).toHaveText([
    'Pinch',
    'Fist',
  ]);
  await expect
    .poll(() => page.evaluate(() => window.__benchCameraRequests__ ?? 0))
    .toBe(0);
});

test('personal fixture builds a profile that activates beyond fixed gate', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run calibrated fixture' }).click();
  await page.locator('#bench-scenario').selectOption('personal-range');

  await expect(page.locator('#bench-calibration-prompt')).toHaveText(
    'Profile ready',
    { timeout: 4_500 },
  );
  await expect(page.locator('#bench-calibrated-phase')).toHaveText('ACTIVE', {
    timeout: 2_500,
  });
  await expect(page.locator('#bench-fixed-phase')).not.toHaveText('ACTIVE');
  await expect(page.locator('#bench-calibrated-threshold')).toContainText(
    '0.470',
  );
});

test('keyboard can launch deterministic fixture', async ({ page }) => {
  await page.goto(EXPERIMENT_PATH);
  const action = page.getByRole('button', { name: 'Run calibrated fixture' });
  await action.focus();
  await action.press('Enter');

  await expect(page.getByRole('status')).toContainText('Fixture playing');
  await expect(
    page.getByRole('button', { name: 'Fixture', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('camera denial is recoverable through fixture', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Run calibrated fixture' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

test('input switch closes every camera track', async ({ page }) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    window.__benchStoppedTracks__ = 0;
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
              window.__benchStoppedTracks__ =
                (window.__benchStoppedTracks__ ?? 0) + 1;
              nativeStop();
            };
          });
          window.__benchCameraCanvas__ = canvas;
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
    .poll(() => page.evaluate(() => window.__benchStoppedTracks__ ?? 0))
    .toBe(1);
});

test('inactivity closes camera and discards calibration state', async ({
  page,
}) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    window.__benchStoppedTracks__ = 0;
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
              window.__benchStoppedTracks__ =
                (window.__benchStoppedTracks__ ?? 0) + 1;
              nativeStop();
            };
          });
          window.__benchCameraCanvas__ = canvas;
          return Promise.resolve(stream);
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('status')).toContainText('Camera active');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.getByRole('status')).toContainText('page became inactive');
  await expect(page.locator('#calibration-bench')).toHaveAttribute(
    'data-calibration',
    'empty',
  );
  await expect
    .poll(() => page.evaluate(() => window.__benchStoppedTracks__ ?? 0))
    .toBe(1);
});

test('reset discards the in-memory profile', async ({ page }) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run calibrated fixture' }).click();
  await expect(page.locator('#bench-calibration-prompt')).toHaveText(
    'Profile ready',
    { timeout: 4_500 },
  );
  await page.getByRole('button', { name: 'Reset experiment' }).click();

  await expect(page.locator('#calibration-bench')).toHaveAttribute(
    'data-calibration',
    'empty',
  );
  await expect(page.locator('#bench-calibration-prompt')).toHaveText(
    'Not started',
  );
});

test('reduced motion keeps evidence while suppressing transitions', async ({
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
    __benchCameraRequests__?: number;
    __benchStoppedTracks__?: number;
    __benchCameraCanvas__?: HTMLCanvasElement;
  }
}
