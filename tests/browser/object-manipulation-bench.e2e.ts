import { expect, test, type Page } from '@playwright/test';

const EXPERIMENT_PATH = '/experiments/006-object-manipulation-bench/';

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

async function startScenario(page: Page, scenario: string): Promise<void> {
  await page.goto(EXPERIMENT_PATH);
  await page
    .locator('#object-scenario')
    .selectOption(scenario, { force: true });
  await page.getByRole('button', { name: 'Run manipulation sequence' }).click();
}

test('initial bench stays camera-free and marks study 006 current', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          window.__objectCameraRequests__ =
            (window.__objectCameraRequests__ ?? 0) + 1;
          return Promise.reject(
            new DOMException('Unexpected', 'NotAllowedError'),
          );
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);

  await expect(
    page.getByRole('heading', { name: 'Object Bench' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create cube' })).toHaveCount(
    0,
  );
  await expect(page.locator('#object-trash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Studies' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Experiment index' })
      .getByRole('link', { name: /006 Object Manipulation Bench/ }),
  ).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__objectCameraRequests__ ?? 0))
    .toBe(0);
});

const transformScenarios = [
  ['translate', '#object-position', '0.50, 0.49'],
  ['rotate', '#object-rotation', '-0.32, 0.48'],
  ['scale', '#object-scale', '1.00'],
] as const;

for (const [scenario, selector, initial] of transformScenarios) {
  test(`${scenario} fixture changes only its mapped transform`, async ({
    page,
  }) => {
    await startScenario(page, scenario);
    await expect(page.locator('#object-action')).toHaveText(
      scenario.toUpperCase(),
      { timeout: 3_000 },
    );
    await expect(page.locator(selector)).not.toHaveText(initial, {
      timeout: 3_000,
    });
  });
}

test('mobile keeps one fixed cube without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startScenario(page, 'neutral');
  await expect(page.locator('#object-overlay')).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test('landscape mobile keeps one fixed cube without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await startScenario(page, 'neutral');
  await expect(page.locator('#object-overlay')).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test('pointer move updates selected cube and keyboard can rotate it', async ({
  page,
}) => {
  await startScenario(page, 'neutral');
  const canvas = page.locator('#object-stage');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Object canvas has no bounds.');
  const x = bounds.x + bounds.width * 0.5;
  const y = bounds.y + bounds.height * 0.49;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y - 30, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#object-position')).not.toHaveText('0.50, 0.49');

  await page.getByRole('button', { name: 'Rotate' }).click();
  await canvas.focus();
  const before = await page.locator('#object-rotation').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#object-rotation')).not.toHaveText(before ?? '');
});

test('mobile pointer rotate and scale work through the scene readout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startScenario(page, 'neutral');
  const canvas = page.locator('#object-stage');
  const objectCenter = async () => {
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Object canvas has no bounds.');
    return {
      x: bounds.x + bounds.width * 0.5,
      y: bounds.y + bounds.height * 0.49,
    };
  };

  await page.getByRole('button', { name: 'Rotate' }).click();
  const rotateCenter = await objectCenter();
  const hitTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return target
      ? `${target.tagName.toLowerCase()}#${target.id}.${target.className}`
      : 'none';
  }, rotateCenter);
  expect(hitTarget).toContain('canvas#object-stage');
  const rotationBefore = await page.locator('#object-rotation').textContent();
  await page.mouse.move(rotateCenter.x, rotateCenter.y);
  await page.mouse.down();
  await page.mouse.move(rotateCenter.x + 36, rotateCenter.y + 28, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#object-rotation')).not.toHaveText(
    rotationBefore ?? '',
  );

  await page.getByRole('button', { name: 'Scale' }).click();
  const scaleCenter = await objectCenter();
  const scaleBefore = await page.locator('#object-scale').textContent();
  await page.mouse.move(scaleCenter.x, scaleCenter.y);
  await page.mouse.down();
  await page.mouse.move(scaleCenter.x, scaleCenter.y - 44, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#object-scale')).not.toHaveText(scaleBefore ?? '');
});

test('camera denial keeps fixture recovery', async ({ page }) => {
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
  await expect(page.locator('#object-status')).toContainText(
    'Camera permission denied',
  );
  await page.getByRole('button', { name: 'Run manipulation sequence' }).click();
  await expect(page.locator('#object-status')).toContainText('Fixture playing');
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
  await expect(page.locator('#object-status')).toContainText(
    'Camera API unavailable',
  );
  await page.getByRole('button', { name: 'Run manipulation sequence' }).click();
  await expect(page.locator('#object-status')).toContainText('Fixture playing');
});

test('input switch closes every camera track', async ({ page }) => {
  await installNoopTracker(page);
  await page.addInitScript(() => {
    window.__objectStoppedTracks__ = 0;
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
              window.__objectStoppedTracks__ =
                (window.__objectStoppedTracks__ ?? 0) + 1;
              nativeStop();
            };
          });
          window.__objectCameraCanvas__ = canvas;
          return Promise.resolve(stream);
        },
      },
    });
  });
  await page.goto(EXPERIMENT_PATH);
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.locator('#object-status')).toContainText('Camera active');
  await page.getByRole('button', { name: 'Fixture', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__objectStoppedTracks__ ?? 0))
    .toBe(1);
});

test('reduced motion keeps direct manipulation and removes transitions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startScenario(page, 'translate');
  await expect(page.locator('#object-action')).toHaveText('TRANSLATE', {
    timeout: 1_500,
  });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scroll: getComputedStyle(document.documentElement).scrollBehavior,
      })),
    )
    .toMatchObject({ reduced: true, scroll: 'auto' });
});

declare global {
  interface Window {
    __objectCameraRequests__?: number;
    __objectStoppedTracks__?: number;
    __objectCameraCanvas__?: HTMLCanvasElement;
  }
}
