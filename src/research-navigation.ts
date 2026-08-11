type Study = {
  readonly number: '001' | '002' | '003' | '004';
  readonly title: string;
  readonly question: string;
  readonly state: string;
  readonly path: string;
};

const studies = [
  {
    number: '001',
    title: 'Landmark Explorer',
    question: 'What does the tracker actually see?',
    state: 'Revise',
    path: 'experiments/001-landmark-explorer/',
  },
  {
    number: '002',
    title: 'Intent Gate',
    question: 'When does a pinch become intent?',
    state: 'Revise',
    path: 'experiments/002-intent-gate/',
  },
  {
    number: '003',
    title: 'Gesture Calibration Bench',
    question: 'Can local calibration improve two gesture families?',
    state: 'Active validation',
    path: 'experiments/003-gesture-calibration-bench/',
  },
  {
    number: '004',
    title: 'Gesture State Matrix',
    question: 'Can five gesture families share one temporal contract?',
    state: 'Active validation',
    path: 'experiments/004-gesture-state-matrix/',
  },
] satisfies readonly [Study, Study, Study, Study];

function linkFor(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path}`;
}

function studyMarkup(study: Study, currentStudy: string): string {
  const current = study.number === currentStudy ? ' aria-current="page"' : '';

  return `
    <li>
      <a class="research-menu-study" href="${linkFor(study.path)}"${current}>
        <span class="research-menu-number">${study.number}</span>
        <span class="research-menu-copy">
          <strong>${study.title}</strong>
          <small>${study.question}</small>
        </span>
        <span class="research-menu-state">${study.state}</span>
        <span class="research-menu-arrow" aria-hidden="true">↗</span>
      </a>
    </li>`;
}

function initResearchNavigation(): void {
  const toggle = document.querySelector<HTMLButtonElement>(
    '.research-menu-toggle',
  );

  if (!toggle) return;

  const currentStudy = document.body.dataset.currentStudy ?? 'index';
  const dialog = document.createElement('dialog');
  dialog.className = 'research-menu';
  dialog.id = 'research-menu';
  dialog.setAttribute('aria-labelledby', 'research-menu-title');
  dialog.innerHTML = `
    <div class="research-menu-panel">
      <header class="research-menu-header">
        <div>
          <p>Gesture Proof / Collection</p>
          <h2 id="research-menu-title">Experiment index</h2>
        </div>
        <button class="research-menu-close" type="button">
          <span>Close</span><span aria-hidden="true">×</span>
        </button>
      </header>
      <nav aria-label="Experiment index">
        <a class="research-menu-home" href="${linkFor('')}"${currentStudy === 'index' ? ' aria-current="page"' : ''}>
          <span>Index</span><strong>All studies</strong><span aria-hidden="true">↗</span>
        </a>
        <p class="research-menu-phase"><span>Phase 01</span> Observe the signal</p>
        <ol>${studyMarkup(studies[0], currentStudy)}</ol>
        <p class="research-menu-phase"><span>Phase 02</span> Name intent</p>
        <ol start="2">
          ${studyMarkup(studies[1], currentStudy)}
          ${studyMarkup(studies[2], currentStudy)}
        </ol>
        <p class="research-menu-phase"><span>Phase 03</span> Compose vocabulary</p>
        <ol start="4">${studyMarkup(studies[3], currentStudy)}</ol>
      </nav>
      <footer>
        <span>04 studies</span><span>On-device / no capture leaves browser</span>
      </footer>
    </div>`;

  document.body.append(dialog);

  const closeButton = dialog.querySelector<HTMLButtonElement>(
    '.research-menu-close',
  );

  const closeMenu = (): void => dialog.close();

  toggle.addEventListener('click', () => {
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('research-menu-open');
    closeButton?.focus();
  });

  closeButton?.addEventListener('click', closeMenu);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeMenu();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeMenu();
  });
  dialog.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('research-menu-open');
  });
}

initResearchNavigation();
