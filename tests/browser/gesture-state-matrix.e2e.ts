import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/004-gesture-state-matrix/';

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

test('initial matrix remains camera-free and marks study 004 current', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__matrixCameraRequests__ =
            (window.__matrixCameraRequests__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('heading', { name: 'State Matrix' }),
  ).toBeVisible();
  await expect(page.locator('.score-matrix meter')).toHaveCount(5);
  const menuToggle = page.getByRole('button', { name: 'Studies' });
  await menuToggle.click();
  await expect(
    page
      .getByRole('navigation', { name: 'Experiment index' })
      .getByRole('link', { name: /004 Gesture State Matrix/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__matrixCameraRequests__ ?? 0))
    .toBe(0);
});

test('method opens from a shareable hash without requesting camera', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__matrixCameraRequests__ =
            (window.__matrixCameraRequests__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(`${EXPERIMENT_PATH}#method`);

  const panel = page.locator('#matrix-method');
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: 'Evidence earns intent.' }),
  ).toBeVisible();
  await expect(panel.getByText('Competition before certainty')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__matrixCameraRequests__ ?? 0))
    .toBe(0);
  await panel.getByRole('button', { name: /close/i }).click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(EXPERIMENT_PATH);
});

test('deterministic sequence confirms one-hand and two-hand gestures', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run gesture sequence' }).click();

  await expect(page.locator('#matrix-phase')).toHaveText('ACTIVE', {
    timeout: 1_500,
  });
  await expect(page.locator('#matrix-winner')).toHaveText('PINCH');
  await expect(page.locator('#matrix-owner')).not.toContainText('+');
  await expect(page.locator('#matrix-winner')).toHaveText('TWO HAND SPAN', {
    timeout: 11_000,
  });
  await expect(page.locator('#matrix-owner')).toContainText('+');
});

test('competitive evidence becomes unknown and never fabricates a label', async ({
  page,
}) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run gesture sequence' }).click();
  await page.locator('#matrix-scenario').selectOption('competitive-evidence');

  await expect(page.locator('#matrix-phase')).toHaveText('UNKNOWN', {
    timeout: 4_000,
  });
  await expect(page.locator('#matrix-reason')).toHaveText('ambiguous');
  await expect(page.locator('#gesture-matrix')).toHaveAttribute(
    'data-gesture',
    'none',
  );
});

test('short holds stay below temporal activation', async ({ page }) => {
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Run gesture sequence' }).click();
  await page.locator('#matrix-scenario').selectOption('short-holds');
  await page.waitForTimeout(1_800);

  await expect(page.locator('#matrix-timeline')).not.toContainText('active');
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
  await page.getByRole('button', { name: 'Run gesture sequence' }).click();
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
  await page.getByRole('button', { name: 'Run gesture sequence' }).click();
  await expect(page.getByRole('status')).toContainText('Fixture playing');
});

test('input switch closes every camera track', async ({ page }) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    window.__matrixStoppedTracks__ = 0;
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
              window.__matrixStoppedTracks__ =
                (window.__matrixStoppedTracks__ ?? 0) + 1;
              nativeStop();
            };
          });
          window.__matrixCameraCanvas__ = canvas;
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
    .poll(() => page.evaluate(() => window.__matrixStoppedTracks__ ?? 0))
    .toBe(1);
});

test('reduced motion preserves scores while suppressing transitions', async ({
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
    __matrixCameraRequests__?: number;
    __matrixStoppedTracks__?: number;
    __matrixCameraCanvas__?: HTMLCanvasElement;
  }
}
