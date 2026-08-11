import './motion-field.css';
import './research-spine.css';
import './research-navigation';

import type { HandTracker } from './engine/contracts';
import { MotionFieldExperience } from './experience/motion-field';
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

new MotionFieldExperience(
  testTrackerFactory ? testTrackerFactory() : createMediaPipeHandTracker(),
);
