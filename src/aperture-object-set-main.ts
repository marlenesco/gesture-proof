import './aperture-object-set.css';
import './method-panel.css';
import './research-spine.css';
import './research-navigation';
import { initMethodPanel } from './method-panel';
import { mountMethodPanel } from './method-content';

import type { HandTracker } from './engine/contracts';
import { ApertureObjectSetExperience } from './experience/aperture-object-set';
import { createMediaPipeHandTracker } from './tracking/mediapipe-hand-tracker';

declare global {
  interface Window {
    __GSL_TEST_HOOKS__?: { readonly createTracker?: () => HandTracker };
  }
}

const testTrackerFactory = import.meta.env.DEV
  ? window.__GSL_TEST_HOOKS__?.createTracker
  : undefined;

new ApertureObjectSetExperience(
  testTrackerFactory ? testTrackerFactory() : createMediaPipeHandTracker(),
);
mountMethodPanel();
initMethodPanel();
