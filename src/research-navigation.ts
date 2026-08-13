import './site-footer.css';

type Study = {
  readonly number:
    '001' | '002' | '003' | '004' | '005' | '006' | '007' | '008';
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
  {
    number: '005',
    title: 'Motion Field',
    question: 'Can palm velocity drive an effect through a clean boundary?',
    state: 'Active validation',
    path: 'experiments/005-motion-field/',
  },
  {
    number: '006',
    title: 'Object Manipulation Bench',
    question: 'Can locked gestures transform one wireframe cube?',
    state: 'Active validation',
    path: 'experiments/006-object-manipulation-bench/',
  },
  {
    number: '007',
    title: 'Aperture Field',
    question: 'Can two hands earn a selective optical field?',
    state: 'Active validation',
    path: 'experiments/007-aperture-field/',
  },
  {
    number: '008',
    title: 'Aperture Object Set',
    question: 'Can a complete hand field select a transformable cube set?',
    state: 'Active validation',
    path: 'experiments/008-aperture-object-set/',
  },
] satisfies readonly [Study, Study, Study, Study, Study, Study, Study, Study];

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

function mountSiteFooter(): void {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.setAttribute('aria-label', 'Project information');
  footer.innerHTML = `
    <div class="site-footer__group">
      <a class="site-footer__link" href="https://github.com/marlenesco/gesture-proof" target="_blank" rel="noreferrer" aria-label="Gesture Proof source on GitHub, opens in a new tab">
        <svg class="site-footer__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.2-3.37-1.2-.46-1.2-1.12-1.51-1.12-1.51-.91-.64.07-.63.07-.63 1.01.07 1.54 1.06 1.54 1.06.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.15-4.56-5.09 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05A9.27 9.27 0 0 1 12 6.9c.85 0 1.7.12 2.5.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.95-2.35 4.82-4.58 5.08.36.32.68.93.68 1.88 0 1.36-.01 2.46-.01 2.8 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" /></svg>
        <span>Source / GitHub</span>
      </a>
      <span class="site-footer__divider" aria-hidden="true">/</span>
      <span class="site-footer__license">Apache-2.0</span>
    </div>
    <div class="site-footer__group">
      <span class="site-footer__by">By</span>
      <a class="site-footer__link" href="https://twitter.com/marlenesco" target="_blank" rel="noreferrer" aria-label="David Foliti on Twitter, opens in a new tab">
        <svg class="site-footer__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M23.15 4.78c-.82.37-1.7.61-2.62.72a4.55 4.55 0 0 0 2-2.52 9.1 9.1 0 0 1-2.89 1.11 4.54 4.54 0 0 0-7.86 3.1c0 .36.04.72.12 1.06A12.88 12.88 0 0 1 2.55 3.5a4.54 4.54 0 0 0 1.4 6.06 4.5 4.5 0 0 1-2.06-.57v.06a4.54 4.54 0 0 0 3.64 4.45c-.4.11-.82.17-1.25.17-.3 0-.6-.03-.89-.09a4.55 4.55 0 0 0 4.24 3.16 9.13 9.13 0 0 1-5.64 1.95c-.37 0-.73-.02-1.09-.06a12.87 12.87 0 0 0 6.96 2.04c8.35 0 12.91-6.92 12.91-12.92 0-.2 0-.4-.01-.59a9.2 9.2 0 0 0 2.26-2.35l.13-.07Z" /></svg>
        <span>@marlenesco</span>
      </a>
    </div>`;
  document.body.append(footer);
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
        <p class="research-menu-phase"><span>Phase 04</span> Make movement material</p>
        <ol start="5">
          ${studyMarkup(studies[4], currentStudy)}
          ${studyMarkup(studies[5], currentStudy)}
          ${studyMarkup(studies[6], currentStudy)}
          ${studyMarkup(studies[7], currentStudy)}
        </ol>
      </nav>
      <footer>
        <span>08 studies</span><span>On-device / no capture leaves browser</span>
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

mountSiteFooter();
initResearchNavigation();
