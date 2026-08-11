import { defineConfig } from 'vite';
import { resolve } from 'node:path';

function normalizeBasePath(value: string | undefined): string {
  const base = value?.trim() || '/';
  const withLeadingSlash = base.startsWith('/') ? base : `/${base}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        landmarkExplorer: resolve(
          import.meta.dirname,
          'experiments/001-landmark-explorer/index.html',
        ),
        intentGate: resolve(
          import.meta.dirname,
          'experiments/002-intent-gate/index.html',
        ),
        calibrationBench: resolve(
          import.meta.dirname,
          'experiments/003-gesture-calibration-bench/index.html',
        ),
        gestureStateMatrix: resolve(
          import.meta.dirname,
          'experiments/004-gesture-state-matrix/index.html',
        ),
        motionField: resolve(
          import.meta.dirname,
          'experiments/005-motion-field/index.html',
        ),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
