type MethodContent = {
  readonly title: string;
  readonly intro: string;
  readonly flow: readonly [string, string, string];
  readonly detailTitle: string;
  readonly detail: string;
  readonly code: string;
  readonly guards: readonly string[];
  readonly map: readonly [string, string][];
};

const METHODS: Readonly<Record<string, MethodContent>> = {
  '001': {
    title: 'Measurements before meaning.',
    intro:
      'Landmark Explorer keeps tracking separate from gesture intent. It preserves the normalized 21-point observation, then derives inspectable geometry and display coordinates.',
    flow: ['MediaPipe hand', 'Normalized points', 'Inspectable measures'],
    detailTitle: 'Coordinate boundary',
    detail:
      'Normalized model coordinates never change for display mirroring. The renderer applies a mirror transform only at the canvas boundary, keeping geometry stable for later experiments.',
    code: `const pinch = distance(thumbTip, indexTip) / palmScale(landmarks);\nconst angle = jointAngle(indexMcp, indexPip, indexDip);\nconst display = normalizedToDisplay(point, transform);`,
    guards: [
      'Missing joints, non-finite points, and tiny palm scale produce no derived value.',
      'Hand identity combines handedness and nearest wrist; uncertain matching stays inconclusive.',
      'Display refresh and model inference run on separate schedules.',
    ],
    map: [
      [
        'src/tracking/mediapipe-hand-tracker.ts',
        'Runs local Hand Landmarker and normalizes observations.',
      ],
      [
        'src/engine/geometry.ts',
        'Computes palm-relative distance, angles, and explicit display transforms.',
      ],
      [
        'src/render/landmark-renderer.ts',
        'Draws source and landmarks without mutating model data.',
      ],
    ],
  },
  '002': {
    title: 'Distance becomes intent over time.',
    intro:
      'Intent Gate turns a palm-normalized thumb-index distance into a timestamp-driven state machine. One close frame is evidence, never activation.',
    flow: ['Thumb + index', 'Pinch ratio', 'Timed gate'],
    detailTitle: 'Hysteresis keeps release calm',
    detail:
      'Activation needs ratio ≤ 0.34 for 120 ms. Active continuation allows ≤ 0.46; release then needs 100 ms outside that wider boundary before cooldown.',
    code: `const ratio = distance(thumbTip, indexTip) / palmScale(landmarks);\nconst enters = ratio <= 0.34;\nconst continues = ratio <= 0.46;`,
    guards: [
      'Palm scale below 0.02, missing landmarks, non-finite ratio, or ratio above 4 → unknown.',
      'A second hand cannot silently replace the selected owner.',
      'Short dropout decays active confidence; long dropout returns unknown.',
    ],
    map: [
      [
        'src/gesture/pinch-recognizer.ts',
        'Measures ratio, stable ownership, and the temporal pinch state machine.',
      ],
      [
        'src/engine/pinch-fixtures.ts',
        'Replays clean, near-miss, jitter, tap, release, and dropout evidence.',
      ],
      [
        'src/effects/intent-gate-effect.ts',
        'Consumes gesture signal only to draw the aperture response.',
      ],
    ],
  },
  '003': {
    title: 'Compare evidence, not claims.',
    intro:
      'Calibration Bench sends one scalar gesture measure through fixed, filtered, and session-calibrated lanes. The three lanes stay visible so tuning cannot hide disagreement.',
    flow: ['Raw metric', 'One Euro filter', 'Three timed gates'],
    detailTitle: 'Private thresholds from separated medians',
    detail:
      'Open, deliberate-pinch, and deliberate-fist samples produce per-session medians. Calibration becomes inconclusive when reference ranges overlap or evidence is insufficient.',
    code: `activation = gestureMedian + 0.15 * (openMedian - gestureMedian);\ncontinuation = gestureMedian + 0.30 * (openMedian - gestureMedian);\nfilter = new OneEuroFilter({ minimumCutoff: 1, beta: 1.2 });`,
    guards: [
      'At least 15 valid samples per reference over 700 ms are required.',
      'Pinch/open separation below 0.16 or fist/open below 0.22 → inconclusive.',
      'Filtering never bypasses the same 120 ms confirmation and release rules.',
    ],
    map: [
      [
        'src/gesture/calibration-profile.ts',
        'Collects ephemeral references and derives safe session thresholds.',
      ],
      [
        'src/gesture/one-euro-filter.ts',
        'Applies timestamp-aware smoothing without fixed-frame assumptions.',
      ],
      [
        'src/gesture/calibration-comparison.ts',
        'Runs fixed, filtered, and calibrated state lanes side by side.',
      ],
    ],
  },
  '005': {
    title: 'Motion becomes a bounded field.',
    intro:
      'Motion Field derives velocity from a stable palm owner, rejects impossible jumps and gaps, then sends a clean motion signal to a fixed-size particle renderer.',
    flow: ['Stable palm owner', 'Velocity vector', 'Bounded particles'],
    detailTitle: 'Signal rate is not display rate',
    detail:
      'Velocity uses elapsed timestamps between valid palm samples. Inference can run slower than rendering without making the field depend on display frame count.',
    code: `velocity = (currentPalm - previousPalm) / elapsedMs;\nif (gap > maximumGap || speed > maximumSpeed) return unknown;\nforce = confirmedGesture ? velocity * gestureGain : velocity;`,
    guards: [
      'Owner change, repeated timestamp, long gap, and impossible jump discard motion evidence.',
      'Sub-threshold stillness cannot sustain emission.',
      'Fixed buffer caps the field at 320 particles; no per-frame growth.',
    ],
    map: [
      [
        'src/gesture/motion-signal.ts',
        'Selects owner and creates timestamp-derived palm motion samples.',
      ],
      [
        'src/engine/motion-field-fixtures.ts',
        'Replays sweep, direction, stillness, dropout, and two-hand ownership cases.',
      ],
      [
        'src/effects/motion-field-effect.ts',
        'Consumes bounded signal through a fixed particle buffer.',
      ],
    ],
  },
  '006': {
    title: 'Confirm first. Transform once.',
    intro:
      'Object Bench separates a confirmed pose from the continuous movement it controls. Candidate-time movement stages a baseline without mutating the scene.',
    flow: ['Confirmed gesture', 'Staged baseline', 'Scene command'],
    detailTitle: 'Acquisition preserves natural movement',
    detail:
      'When a gesture becomes candidate, the system records a baseline. On confirmation it applies accumulated displacement once; rejected evidence changes nothing.',
    code: `candidateBaseline = sampleMotion(observations);\nif (signal.phase === 'active') delta = current - candidateBaseline;\nif (invalidDelta || ownerLost) reacquireBaseline();`,
    guards: [
      'Open palm, point, ambiguous evidence, cooldown, and missing evidence emit no transform.',
      'Impossible deltas, gaps, owner loss, and dropout freeze scene then require reacquisition.',
      'Scale and position clamp inside documented scene bounds.',
    ],
    map: [
      [
        'src/gesture/object-manipulation-signal.ts',
        'Maps locked pinch, fist, and span signals to bounded commands.',
      ],
      [
        'src/engine/object-scene.ts',
        'Keeps cube identity, transforms, capacity, discard, and exact undo ephemeral.',
      ],
      [
        'src/engine/object-bench-fixtures.ts',
        'Replays translate, rotate, scale, dropout, and candidate movement.',
      ],
    ],
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function mountMethodPanel(): void {
  if (document.querySelector('[data-method-panel]')) return;
  const study = document.body.dataset.currentStudy;
  const method = study ? METHODS[study] : undefined;
  if (!study || !method) return;

  const panel = document.createElement('dialog');
  panel.className = 'method-panel';
  panel.id = `method-${study}`;
  panel.dataset.methodPanel = '';
  panel.setAttribute('aria-labelledby', `method-${study}-title`);
  panel.innerHTML = `
    <article class="method-panel__content">
      <header class="method-panel__header">
        <div><p>Method / ${study}</p><h2 id="method-${study}-title">${method.title}</h2></div>
        <button class="method-panel__close" type="button" data-method-close>Close ×</button>
      </header>
      <div class="method-panel__body">
        <p class="method-intro">${method.intro}</p>
        <section class="method-block">
          <header class="method-block__heading"><span>01</span><h3>Signal path</h3></header>
          <div class="method-figure method-flow" aria-label="${method.flow.join(', then ')}">
            <span class="method-flow__node">${method.flow[0]}</span><i class="method-flow__arrow"></i>
            <span class="method-flow__node">${method.flow[1]}</span><i class="method-flow__arrow"></i>
            <span class="method-flow__node">${method.flow[2]}</span><i class="method-flow__pulse"></i>
          </div>
        </section>
        <section class="method-block">
          <header class="method-block__heading"><span>02</span><h3>${method.detailTitle}</h3></header>
          <pre class="method-code"><code>${escapeHtml(method.code)}</code></pre><p>${method.detail}</p>
        </section>
        <section class="method-block">
          <header class="method-block__heading"><span>03</span><h3>What gets rejected</h3></header>
          <ul>${method.guards.map((guard) => `<li>${guard}</li>`).join('')}</ul>
        </section>
        <section class="method-block">
          <header class="method-block__heading"><span>04</span><h3>Implementation map</h3></header>
          <div class="method-map">${method.map.map(([path, description]) => `<div><code>${path}</code><p>${description}</p></div>`).join('')}</div>
        </section>
      </div>
    </article>`;
  document.body.append(panel);
}
