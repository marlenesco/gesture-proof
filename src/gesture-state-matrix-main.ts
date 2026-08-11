import './gesture-state-matrix.css';
import './research-spine.css';
import './research-navigation';

import type { HandTracker } from './engine/contracts';
import { GestureStateMatrixExperience } from './experience/gesture-state-matrix';
import { createMediaPipeHandTracker } from './tracking/mediapipe-hand-tracker';

declare global {
  interface Window {
    __GSL_TEST_HOOKS__?: {
      readonly createTracker?: () => HandTracker;
    };
  }
}

const testTrackerFactory = import.meta.env.DEV
  ? window.__GSL_TEST_HOOKS__?.createTracker
  : undefined;

new GestureStateMatrixExperience(
  testTrackerFactory ? testTrackerFactory() : createMediaPipeHandTracker(),
);
