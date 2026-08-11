import './styles.css';

import type { HandTracker } from './engine/contracts';
import { LandmarkExplorer } from './experience/landmark-explorer';
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
const tracker = testTrackerFactory
  ? testTrackerFactory()
  : createMediaPipeHandTracker();

new LandmarkExplorer(tracker);
